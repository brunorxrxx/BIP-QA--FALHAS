// Service Worker - Permite funcionar OFFLINE
const CACHE_NAME = 'bip-qa-v2';
const CACHE_EXTERNAL = 'bip-qa-external-v2';

// Arquivos locais (caminhos relativos para GitHub Pages)
const urlsToCache = [
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json'
];

// URLs externas (CDN)
const externalUrls = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker instalando...');
  
  event.waitUntil(
    // Cachear arquivos locais
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cacheando arquivos locais');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('⚠️ Erro ao cachear locais:', err);
      })
      .then(() => {
        // Cachear CDN em background
        return caches.open(CACHE_EXTERNAL)
          .then(cache => {
            console.log('✅ Cacheando CDN');
            externalUrls.forEach(url => {
              cache.add(url).catch(err => console.log('⚠️ Erro CDN:', url));
            });
          });
      })
  );
  
  self.skipWaiting();
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  console.log('✅ Service Worker ativado');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => 
            cacheName !== CACHE_NAME && 
            cacheName !== CACHE_EXTERNAL
          )
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
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requisições para outros domínios (exceto CDN)
  if (url.origin !== self.location.origin && 
      !url.href.includes('cdn.jsdelivr.net') &&
      !url.href.includes('api')) {
    return;
  }
  
  // Para POST (processamento), deixar pass-through
  if (request.method === 'POST') {
    event.respondWith(
      fetch(request)
        .catch(err => {
          console.log('❌ POST offline:', err);
          return new Response(
            JSON.stringify({ erro: 'Sem conexão' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }
  
  // Para GET (páginas/scripts/estilos)
  event.respondWith(
    caches.match(request)
      .then(response => {
        // Se tem em cache, retorna do cache
        if (response) {
          console.log('📦 Cache hit:', request.url);
          return response;
        }
        
        // Senão, busca online
        return fetch(request)
          .then(response => {
            // Valida resposta
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            
            // Cacheia novo recurso
            const responseToCache = response.clone();
            const cacheName = url.href.includes('cdn.jsdelivr.net') ? 
              CACHE_EXTERNAL : CACHE_NAME;
              
            caches.open(cacheName)
              .then(cache => {
                cache.put(request, responseToCache);
              })
              .catch(err => console.log('⚠️ Erro ao cachear:', err));
            
            return response;
          })
          .catch(err => {
            console.log('❌ Fetch failed:', request.url, err);
            
            // Se offline, tenta cache novamente
            return caches.match(request)
              .then(cached => {
                if (cached) return cached;
                
                // Se for HTML, retorna index.html
                if (request.headers.get('accept').includes('text/html')) {
                  return caches.match('./index.html')
                    .then(r => r || new Response('Offline'));
                }
                
                return new Response('Offline');
              });
          });
      })
  );
});