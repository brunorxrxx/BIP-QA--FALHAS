// ========== CONFIGURAÇÃO ==========
const API_URL = "https://web-production-cf763.up.railway.app";
let MODO_OFFLINE = false;
let BACKEND_LOCAL = "http://localhost:8000";

// Detectar automaticamente ao carregar
window.addEventListener('load', () => {
    detectarInternet();
});

function detectarInternet() {
    // Tenta conectar ao Railway
    fetch(API_URL + '/processar', { 
        method: 'HEAD',
        mode: 'no-cors'
    })
        .then(() => {
            MODO_OFFLINE = false;
            console.log('✅ Online - Railway Backend');
        })
        .catch(() => {
            // Se falhar, assume offline
            MODO_OFFLINE = true;
            console.log('⚠️ Offline - Backend Local (localhost:8000)');
        });
}

let allFalhas = [];
let allOutput = [];
let filtroCliqueCausa = null;
let filtroCliqueItem = null;
let filtroCliqueEstacao = null;
let filtroCliqueModelo = null;

let charts = {
    causa: null,
    item: null,
    estacao: null,
    modelo: null
};

// ========== ELEMENTOS ==========
const btnSelectFalhas = document.getElementById('btn-select-falhas');
const btnSelectOutput = document.getElementById('btn-select-output');
const fileInputFalhas = document.getElementById('file-input-falhas');
const fileInputOutput = document.getElementById('file-input-output');
const processBtn = document.getElementById('process-btn');
const loadingSection = document.getElementById('loading');
const resultsSection = document.getElementById('results');
const messageDiv = document.getElementById('message');
const toggleFiltrosBtn = document.getElementById('toggle-filtros');
const filtersSidebar = document.getElementById('filters-section');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const dropZone = document.getElementById('drop-zone');

const resumoTableBody = document.querySelector("#resumo-table tbody");
const falhasTableBody = document.querySelector("#falhas-table tbody");
const pivotModeloBody = document.querySelector("#pivot-modelo-table tbody");

Chart.register(ChartDataLabels);

// ========== FUNÇÕES DE FILTRO ==========
function toggleFilter(filterId) {
    const container = document.getElementById(filterId);
    const header = event.currentTarget.querySelector('.filter-toggle');
    container.classList.toggle('collapsed');
    header.classList.toggle('collapsed');
}

function filtrarCheckboxes(filterId, termo) {
    const container = document.getElementById(filterId);
    const labels = container.querySelectorAll('label');
    
    labels.forEach(label => {
        const texto = label.textContent.toLowerCase();
        if (texto.includes(termo.toLowerCase())) {
            label.style.display = 'flex';
        } else {
            label.style.display = 'none';
        }
    });
}

// ========== FUNÇÕES DE TURNO ==========
function calcularTurno(dataComHora) {
    if (!dataComHora) return null;
    
    const str = String(dataComHora).trim();
    const match = str.match(/(\d{2}):(\d{2})/);
    
    if (!match) return null;
    
    const hora = parseInt(match[1]);
    const minuto = parseInt(match[2]);
    const tempo = hora + minuto / 60;
    
    if (tempo >= 6 && tempo < 15.8) {
        return "Turno 1 (06:00-15:48)";
    } else if (tempo >= 15.8 || tempo < 1.15) {
        return "Turno 2 (15:48-01:09)";
    } else if (tempo >= 1.15 && tempo < 5.983) {
        return "Turno 3 (01:09-05:59)";
    }
    
    return null;
}

// ========== FILE UPLOAD ==========
btnSelectFalhas.addEventListener('click', () => fileInputFalhas.click());
btnSelectOutput.addEventListener('click', () => fileInputOutput.click());

fileInputFalhas.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        document.getElementById('falhas-name').textContent = e.target.files[0].name;
        updateProcessBtn();
    }
});

fileInputOutput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        document.getElementById('output-name').textContent = e.target.files[0].name;
        updateProcessBtn();
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    for (let file of files) {
        const name = file.name.toLowerCase();
        if (name.includes('falha')) {
            fileInputFalhas.files = files;
            document.getElementById('falhas-name').textContent = file.name;
        }
        if (name.includes('output')) {
            fileInputOutput.files = files;
            document.getElementById('output-name').textContent = file.name;
        }
    }
    updateProcessBtn();
});

function updateProcessBtn() {
    processBtn.disabled = !(fileInputFalhas.files[0] && fileInputOutput.files[0]);
}

// ========== TOGGLE FILTROS ==========
toggleFiltrosBtn.addEventListener('click', () => {
    filtersSidebar.classList.toggle('hidden');
    toggleFiltrosBtn.textContent = filtersSidebar.classList.contains('hidden') ? '📊 Mostrar Filtros' : '📊 Ocultar Filtros';
});

// ========== PROCESSAR ==========
processBtn.addEventListener('click', async () => {
    const formData = new FormData();
    formData.append('falhas', fileInputFalhas.files[0]);
    formData.append('output', fileInputOutput.files[0]);

    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    try {
        const urlProcessar = MODO_OFFLINE ? `${BACKEND_LOCAL}/processar` : `${API_URL}/processar`;
        
        const response = await fetch(urlProcessar, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.erro);

        allFalhas = data.falhas_rows || [];
        allOutput = data.output_rows || [];

        preencherFiltros();
        recomputarTudo();

        loadingSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        showMessage(`✅ Processado com sucesso! (${MODO_OFFLINE ? 'Offline' : 'Online'})`, 'success');

    } catch (error) {
        console.error('Erro:', error);
        showMessage(`❌ ${error.message}`, 'error');
        loadingSection.classList.add('hidden');
    }
});

// ========== FILTROS ==========
function preencherFiltros() {
    const estacoes = new Set();
    const linhas = new Set();
    const wos = new Set();
    const modelos = new Set();
    const descricoes = new Set();
    const itens = new Set();
    const datas = new Set();
    const turnos = new Set();

    allFalhas.forEach(f => {
        if (f.Estacao_Ajustada) estacoes.add(f.Estacao_Ajustada);
        if (f.Linha) linhas.add(f.Linha);
        if (f['Work Order']) wos.add(f['Work Order']);
        if (f.Descricao_Ajustada) descricoes.add(f.Descricao_Ajustada);
        if (f.Item) itens.add(f.Item);
        if (f['Data da falha']) {
            const turno = calcularTurno(f['Data da falha']);
            if (turno) turnos.add(turno);
        }
    });

    allOutput.forEach(o => {
        if (o.Estacao) estacoes.add(o.Estacao);
        if (o.Linha) linhas.add(o.Linha);
        if (o['Work Order']) wos.add(o['Work Order']);
        if (o['Nome do Modelo']) modelos.add(o['Nome do Modelo']);
        if (o.Data) datas.add(o.Data);
    });

    criarCheckboxes('filter-estacao', Array.from(estacoes).sort());
    criarCheckboxes('filter-linha', Array.from(linhas).sort());
    criarCheckboxes('filter-wo', Array.from(wos).sort());
    criarCheckboxes('filter-modelo', Array.from(modelos).sort());
    criarCheckboxes('filter-descricao', Array.from(descricoes).sort());
    criarCheckboxes('filter-item', Array.from(itens).sort());
    criarCheckboxes('filter-data', Array.from(datas).sort());
    criarCheckboxes('filter-turno', Array.from(turnos).sort());
}

function criarCheckboxes(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item;
        checkbox.addEventListener('change', () => recomputarTudo());
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(item));
        container.appendChild(label);
    });
}

function getCheckboxValues(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('input:checked')).map(i => i.value);
}

clearFiltersBtn.addEventListener('click', () => {
    document.querySelectorAll('.checkbox-list input:checked').forEach(cb => cb.checked = false);
    filtroCliqueCausa = null;
    filtroCliqueItem = null;
    filtroCliqueEstacao = null;
    filtroCliqueModelo = null;
    recomputarTudo();
});

// ========== RECOMPUTAR ==========
function recomputarTudo() {
    const selEstacao = getCheckboxValues('filter-estacao');
    const selLinha = getCheckboxValues('filter-linha');
    const selWO = getCheckboxValues('filter-wo');
    const selModelo = getCheckboxValues('filter-modelo');
    const selDescricao = getCheckboxValues('filter-descricao');
    const selItem = getCheckboxValues('filter-item');
    const selData = getCheckboxValues('filter-data');
    const selTurno = getCheckboxValues('filter-turno');

    let falhasFiltradas = allFalhas;
    let outputFiltrado = allOutput;

    if (selEstacao.length) {
        falhasFiltradas = falhasFiltradas.filter(f => selEstacao.includes(f.Estacao_Ajustada));
        outputFiltrado = outputFiltrado.filter(o => selEstacao.includes(o.Estacao));
    }
    if (selLinha.length) {
        falhasFiltradas = falhasFiltradas.filter(f => selLinha.includes(f.Linha));
        outputFiltrado = outputFiltrado.filter(o => selLinha.includes(o.Linha));
    }
    if (selWO.length) {
        falhasFiltradas = falhasFiltradas.filter(f => selWO.includes(f['Work Order']));
        outputFiltrado = outputFiltrado.filter(o => selWO.includes(o['Work Order']));
    }
    if (selModelo.length) {
        outputFiltrado = outputFiltrado.filter(o => selModelo.includes(o['Nome do Modelo']));
        const wosDoModelo = new Set();
        allOutput.forEach(o => {
            if (selModelo.includes(o['Nome do Modelo'])) {
                wosDoModelo.add(o['Work Order']);
            }
        });
        falhasFiltradas = falhasFiltradas.filter(f => wosDoModelo.has(f['Work Order']));
    }
    if (selDescricao.length) {
        falhasFiltradas = falhasFiltradas.filter(f => selDescricao.includes(f.Descricao_Ajustada));
    }
    if (selItem.length) {
        falhasFiltradas = falhasFiltradas.filter(f => selItem.includes(f.Item));
    }
    if (selData.length) {
        outputFiltrado = outputFiltrado.filter(o => selData.includes(o.Data));
    }
    if (selTurno.length) {
        falhasFiltradas = falhasFiltradas.filter(f => {
            const turno = calcularTurno(f['Data da falha']);
            return selTurno.includes(turno);
        });
    }

    if (filtroCliqueCausa) {
        falhasFiltradas = falhasFiltradas.filter(f => (f['Descrição.1'] || 'TBA') === filtroCliqueCausa);
    }
    if (filtroCliqueItem) {
        falhasFiltradas = falhasFiltradas.filter(f => f.Item === filtroCliqueItem);
    }
    if (filtroCliqueEstacao) {
        falhasFiltradas = falhasFiltradas.filter(f => f.Estacao_Ajustada === filtroCliqueEstacao);
    }
    if (filtroCliqueModelo) {
        outputFiltrado = outputFiltrado.filter(o => o['Nome do Modelo'] === filtroCliqueModelo);
        const wosDoModelo = new Set();
        allOutput.forEach(o => {
            if (o['Nome do Modelo'] === filtroCliqueModelo) {
                wosDoModelo.add(o['Work Order']);
            }
        });
        falhasFiltradas = falhasFiltradas.filter(f => wosDoModelo.has(f['Work Order']));
    }

    desenharResumo(falhasFiltradas, outputFiltrado);
    desenharPivotModelo(outputFiltrado);
    desenharGraficoPareto(falhasFiltradas, 'Descrição.1', 'paretoCausaChart', 'causa');
    desenharGraficoPareto(falhasFiltradas, 'Item', 'paretoItemChart', 'item');
    desenharGraficoPizza(falhasFiltradas, 'Estacao_Ajustada', 'pieEstacaoChart', 'estacao');
    desenharGraficoPizza(outputFiltrado, 'Nome do Modelo', 'pieModeloChart', 'modelo');
    desenharFalhasPreview(falhasFiltradas);
}

function desenharResumo(falhas, output) {
    resumoTableBody.innerHTML = '';
    const estacoes = {};

    output.forEach(o => {
        const est = o.Estacao || 'TBA';
        if (!estacoes[est]) estacoes[est] = { pass: 0, data: o.Data };
        estacoes[est].pass += parseInt(o.Board_Pass || 0);
    });

    falhas.forEach(f => {
        const est = f.Estacao_Ajustada || 'TBA';
        if (!estacoes[est]) estacoes[est] = { pass: 0, fail: 0 };
        estacoes[est].fail = (estacoes[est].fail || 0) + 1;
    });

    Object.entries(estacoes).sort().forEach(([est, dados]) => {
        const fail = dados.fail || 0;
        const total = dados.pass;
        const taxa = total > 0 ? ((fail / total) * 100).toFixed(2) : '0.00';
        const fpy = (100 - taxa).toFixed(2);

        const tr = document.createElement('tr');
        
        const estacaoTd = document.createElement('td');
        estacaoTd.textContent = est;
        estacaoTd.className = `estacao-${est}`;
        
        const dataTd = document.createElement('td');
        dataTd.textContent = dados.data || '';
        
        const passTd = document.createElement('td');
        passTd.textContent = dados.pass;
        
        const failTd = document.createElement('td');
        failTd.textContent = fail;
        
        const totalTd = document.createElement('td');
        totalTd.textContent = total;
        
        const taxaTd = document.createElement('td');
        taxaTd.textContent = taxa + '%';
        if (taxa > 2) taxaTd.setAttribute('data-taxa-high', '');

        const fpyTd = document.createElement('td');
        fpyTd.textContent = fpy + '%';
        if (fpy >= 99) fpyTd.setAttribute('data-fpy-good', '');
        else fpyTd.setAttribute('data-fpy-bad', '');

        tr.appendChild(estacaoTd);
        tr.appendChild(dataTd);
        tr.appendChild(passTd);
        tr.appendChild(failTd);
        tr.appendChild(totalTd);
        tr.appendChild(taxaTd);
        tr.appendChild(fpyTd);
        
        resumoTableBody.appendChild(tr);
    });
}

function desenharPivotModelo(output) {
    pivotModeloBody.innerHTML = '';
    const map = {};
    output.forEach(o => {
        const modelo = o['Nome do Modelo'] || 'SEM MODELO';
        map[modelo] = (map[modelo] || 0) + parseInt(o.Total || 0);
    });

    Object.entries(map).sort((a, b) => b[1] - a[1]).forEach(([modelo, total]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${modelo}</td><td>${total}</td>`;
        tr.addEventListener('click', () => {
            filtroCliqueModelo = filtroCliqueModelo === modelo ? null : modelo;
            recomputarTudo();
        });
        pivotModeloBody.appendChild(tr);
    });
}

function desenharGraficoPareto(falhas, campo, canvasId, tipo) {
    const cont = {};
    falhas.forEach(f => {
        const key = (f[campo] || 'TBA').toString();
        cont[key] = (cont[key] || 0) + 1;
    });

    const ordenada = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const total = ordenada.reduce((s, x) => s + x[1], 0);

    let acum = 0;
    const percAcum = [];
    ordenada.forEach(x => {
        acum += x[1];
        percAcum.push((acum / total) * 100);
    });

    if (charts[tipo]) charts[tipo].destroy();
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    charts[tipo] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ordenada.map(c => c[0]),
            datasets: [
                {
                    type: 'bar',
                    label: 'Qtd Falhas',
                    data: ordenada.map(c => c[1]),
                    backgroundColor: '#0078d4',
                    borderColor: '#003f7f',
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 1,
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: '#003f7f',
                        font: { weight: 'bold', size: 10 }
                    }
                },
                {
                    type: 'line',
                    label: '% Acumulado',
                    data: percAcum,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#ff6b6b',
                    yAxisID: 'y1',
                    order: 0,
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: '#ff6b6b',
                        font: { weight: 'bold', size: 9 },
                        formatter: (value) => value.toFixed(1) + '%'
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' },
                datalabels: { display: true }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grace: '10%'
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    max: 115,
                    ticks: { callback: v => v + '%' },
                    grid: { drawOnChartArea: false }
                }
            },
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const valor = ordenada[idx][0];
                
                if (tipo === 'causa') {
                    filtroCliqueCausa = filtroCliqueCausa === valor ? null : valor;
                } else if (tipo === 'item') {
                    filtroCliqueItem = filtroCliqueItem === valor ? null : valor;
                }
                recomputarTudo();
            }
        }
    });
}

function desenharGraficoPizza(dados, campo, canvasId, tipo) {
    const cont = {};
    dados.forEach(d => {
        const key = (d[campo] || 'TBA').toString();
        cont[key] = (cont[key] || 0) + 1;
    });

    const coresEstacoes = {
        'ICT': '#bbdefb',
        'S_VI_B': '#e1bee7',
        'S_VI_T': '#f8bbd0',
        'FBT': '#ffe0b2',
        'FVI': '#b2dfdb',
        'INBOUND': '#c8e6c9',
        'PACKING': '#ede7f6',
        'RELATION': '#fce4ec',
        'REPAIR': '#fff9c4',
        'ROUTER': '#b3e5fc',
        'R_FBT': '#f0f4c3',
        'SCREENING': '#ffebee',
        'TEST': '#e8f5e9',
        'TBA': '#eeeeee'
    };

    let cores = [];
    if (tipo === 'estacao') {
        cores = Object.keys(cont).map(label => coresEstacoes[label] || '#0078d4');
    } else {
        cores = ['#0078d4', '#0063b1', '#004b8a', '#003f7f', '#667eea', '#764ba2', '#f093fb'];
    }

    if (charts[tipo]) charts[tipo].destroy();
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    charts[tipo] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cont),
            datasets: [{
                data: Object.values(cont),
                backgroundColor: cores
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const labels = Object.keys(cont);
                const valor = labels[idx];
                
                if (tipo === 'estacao') {
                    filtroCliqueEstacao = filtroCliqueEstacao === valor ? null : valor;
                } else if (tipo === 'modelo') {
                    filtroCliqueModelo = filtroCliqueModelo === valor ? null : valor;
                }
                recomputarTudo();
            }
        }
    });
}

function desenharFalhasPreview(falhas) {
    falhasTableBody.innerHTML = '';
    falhas.slice(0, 50).forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.Serial || '-'}</td>
            <td>${f.Estacao_Ajustada || '-'}</td>
            <td>${f.Descricao_Ajustada || '-'}</td>
            <td>${f['Descrição.1'] || '-'}</td>
            <td>${f.Item || '-'}</td>
        `;
        falhasTableBody.appendChild(tr);
    });
}

function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    setTimeout(() => messageDiv.classList.remove('show'), 4000);
}