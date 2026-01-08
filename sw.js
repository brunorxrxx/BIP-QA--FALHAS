// Service Worker - Permite funcionar OFFLINE
const CACHE_NAME = 'bip-qa-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache criado');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.log('⚠️ Erro ao cachear:', err))
  );
  self.skipWaiting();
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', event => {
  // Se for POST (dados), tentar online primeiro
  if (event.request.method === 'POST') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se offline, mostrar mensagem
          console.log('⚠️ Offline: Não é possível processar sem internet');
          return new Response(
            JSON.stringify({ erro: 'Sem internet. Use dados em cache ou processe online.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Para GETs (páginas/estilos/scripts), usar cache
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se tiver em cache, retornar
        if (response) {
          return response;
        }

        // Senão, tentar buscar online
        return fetch(event.request)
          .then(response => {
            // Cachear novo recurso
            if (!response || response.status !== 200) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Se offline e não tiver cache, retornar página offline
            return caches.match('/index.html')
              .then(response => response || new Response('Offline'));
          });
      })
  );
});
