// ===============================
// CONFIGURAÇÃO DE API - RAILWAY
// ===============================
// ⚠️ ALTERE ISSO PARA SUA URL DO RAILWAY
const API_URL = 'https://seu-url-railway.up.railway.app';

// ===============================
// ELEMENTOS BÁSICOS
// ===============================
const dropZone = document.getElementById("drop-zone");
const processBtn = document.getElementById("process-btn");

// NOVOS BOTÕES
const btnSelectFalhas = document.getElementById("btn-select-falhas");
const btnSelectOutput = document.getElementById("btn-select-output");

// NOVOS INPUTS
const inputFalhas = document.getElementById("file-input-falhas");
const inputOutput = document.getElementById("file-input-output");

// LABELS
const falhasNameSpan = document.getElementById("falhas-name");
const outputNameSpan = document.getElementById("output-name");

// OUTROS ELEMENTOS
const loadingSection = document.getElementById("loading");
const resultsSection = document.getElementById("results");
const filtersSection = document.getElementById("filters-section");
const toggleFiltrosBtn = document.getElementById("toggle-filtros");
const minimizeFiltersBtn = document.getElementById("minimize-filters");

// TABELAS
const resumoTableBody = document.querySelector("#resumo-table tbody");
const falhasTableBody = document.querySelector("#falhas-table tbody");
const pivotModeloBody = document.querySelector("#pivot-modelo-table tbody");

// FILTROS CHECKBOX
const filterEstacao = document.getElementById("filter-estacao");
const filterLinha = document.getElementById("filter-linha");
const filterData = document.getElementById("filter-data");
const filterWO = document.getElementById("filter-wo");
const filterModelo = document.getElementById("filter-modelo");
const filterModeloSerial = document.getElementById("filter-modelo-serial");
const filterDescricaoAjustada = document.getElementById("filter-descricao-ajustada");
const filterHora = document.getElementById("filter-hora");
const clearFiltersBtn = document.getElementById("clear-filters-btn");

// GRÁFICOS
let paretoCausaChart = null;
let paretoItemChart = null;
let pieEstacaoChart = null;

// DADOS
let falhasRows = [];
let outputRows = [];

// ARQUIVOS
let falhasFile = null;
let outputFile = null;

// FILTRO POR CLIQUE
let filtroParetoCausa = null;
let filtroParetoItem = null;
let filtroEstacaoPizza = null;

// CONFIG GLOBAL CHART.JS
Chart.register(ChartDataLabels);
Chart.defaults.font.size = 11;

// ===============================
// UPLOAD — BOTÕES
// ===============================

// Botão Falhas
btnSelectFalhas.addEventListener("click", () => {
    inputFalhas.click();
});

inputFalhas.addEventListener("change", () => {
    const file = inputFalhas.files[0];
    if (file) {
        falhasFile = file;
        falhasNameSpan.textContent = file.name;
    }
    atualizarBotaoProcessar();
});

// Botão Output
btnSelectOutput.addEventListener("click", () => {
    inputOutput.click();
});

inputOutput.addEventListener("change", () => {
    const file = inputOutput.files[0];
    if (file) {
        outputFile = file;
        outputNameSpan.textContent = file.name;
    }
    atualizarBotaoProcessar();
});

// Ativa o botão somente quando os dois arquivos forem carregados
function atualizarBotaoProcessar() {
    processBtn.disabled = !(falhasFile && outputFile);
}

// ===============================
// DRAG & DROP (NOVA VERSÃO)
// ===============================
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const files = e.dataTransfer.files;
    for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.includes("falhas")) {
            falhasFile = file;
            falhasNameSpan.textContent = file.name;
        }
        else if (name.includes("output")) {
            outputFile = file;
            outputNameSpan.textContent = file.name;
        }
    }

    atualizarBotaoProcessar();
});

// ===============================
// BOTÃO PROCESSAR
// ===============================
processBtn.addEventListener("click", async () => {
    if (!(falhasFile && outputFile)) return;

    loadingSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");
    filtersSection.classList.add("hidden");

    try {
        const formData = new FormData();
        formData.append("falhas", falhasFile);
        formData.append("output", outputFile);

        // ⭐ AGORA USA API_URL (Railway) AO INVÉS DE LOCALHOST
        const resp = await fetch(`${API_URL}/processar`, {
            method: "POST",
            body: formData,
        });

        if (!resp.ok) {
            const errorData = await resp.json();
            throw new Error(errorData.erro || "Erro ao processar arquivos");
        }

        const data = await resp.json();
        falhasRows = data.falhas_rows || [];
        outputRows = data.output_rows || [];

        preencherFiltros(outputRows, falhasRows);

        filtroParetoCausa = null;
        filtroParetoItem = null;
        filtroEstacaoPizza = null;

        recomputarEDesenhar();

        loadingSection.classList.add("hidden");
        resultsSection.classList.remove("hidden");
        filtersSection.classList.remove("hidden");

    } catch (e) {
        console.error("Erro:", e);
        alert(`Erro ao processar arquivos:\n${e.message}\n\nVerifique se a URL do Railway está correta no app.js`);
        loadingSection.classList.add("hidden");
    }
});

// ===============================
// BOTÃO MOSTRAR / OCULTAR FILTROS
// ===============================
toggleFiltrosBtn.addEventListener("click", () => {
    if (filtersSection.classList.contains("hidden")) {
        filtersSection.classList.remove("hidden");
        toggleFiltrosBtn.textContent = "Ocultar filtros";
    } else {
        filtersSection.classList.add("hidden");
        toggleFiltrosBtn.textContent = "Mostrar filtros";
    }
});

// ===============================
// BOTÃO MINIMIZAR FILTROS
// ===============================
if (minimizeFiltersBtn) {
    minimizeFiltersBtn.addEventListener("click", () => {
        filtersSection.classList.toggle("collapsed");
    });
}

// ===============================
// FUNÇÕES DE FILTRO (CHECKBOX)
// ===============================

function extrairHora(dataComHora) {
    if (!dataComHora) return null;
    
    console.log("Processando data com hora:", dataComHora);
    
    // Formato: "04/12/2025 07:57:46" ou "2025-12-04 07:57:46"
    const str = String(dataComHora).trim();
    
    // Tenta encontrar padrão HH:MM
    const match = str.match(/(\d{2}):(\d{2})/);
    if (match) {
        const hora = `${match[1]}:${match[2]}`;
        console.log("Hora extraída:", hora);
        return hora;
    }
    
    return null;
}

function preencherCheckboxList(container, values) {
    if (!container) return;

    container.innerHTML = "";

    values.forEach((v) => {
        const id = container.id + "_" + v.toString().replace(/\W+/g, "_");

        const label = document.createElement("label");
        label.innerHTML = `
            <input type="checkbox" id="${id}" value="${v}">
            <span>${v}</span>
        `;

        const input = label.querySelector("input");
        input.addEventListener("change", () => {
            recomputarEDesenhar();
        });

        container.appendChild(label);
    });
}

// Checkbox → valores marcados
function getCheckboxValues(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll("input:checked")).map((i) => i.value);
}

// Preenche todos filtros automaticamente
function preencherFiltros(outputRows, falhasRows) {
    const estacoes = new Set();
    const linhas = new Set();
    const datas = new Set();
    const wos = new Set();
    const modelos = new Set();
    const modelosSerial = new Set();
    const descricoesAjustadas = new Set();
    const horas = new Set();

    outputRows.forEach((r) => {
        if (r.Estacao) estacoes.add(r.Estacao);
        if (r.Linha) linhas.add(r.Linha);
        if (r.Data) datas.add(r.Data);
        if (r["Work Order"]) wos.add(r["Work Order"]);
        if (r["Nome do Modelo"]) modelos.add(r["Nome do Modelo"]);
        if (r["Modelo Serial"]) modelosSerial.add(r["Modelo Serial"]);
    });

    falhasRows.forEach((f) => {
        if (f.Descricao_Ajustada) descricoesAjustadas.add(f.Descricao_Ajustada);
        // Extrair hora do campo "Data da falha" (formato: 04/12/2025 07:57:46)
        if (f["Data da falha"]) {
            const hora = extrairHora(f["Data da falha"]);
            if (hora) {
                console.log("Hora adicionada ao conjunto:", hora);
                horas.add(hora);
            }
        }
    });

    console.log("Horas encontradas:", Array.from(horas).sort());

    preencherCheckboxList(filterEstacao, Array.from(estacoes).sort());
    preencherCheckboxList(filterLinha, Array.from(linhas).sort());
    preencherCheckboxList(filterData, Array.from(datas).sort());
    preencherCheckboxList(filterWO, Array.from(wos).sort());
    preencherCheckboxList(filterModelo, Array.from(modelos).sort());
    preencherCheckboxList(filterModeloSerial, Array.from(modelosSerial).sort());
    preencherCheckboxList(filterDescricaoAjustada, Array.from(descricoesAjustadas).sort());
    preencherCheckboxList(filterHora, Array.from(horas).sort());

    // ⭐ NOVO: ativar botões Selecionar/Desmarcar
    ativarToggleTodos();
}

// Botão limpar filtros
if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
        [
            filterEstacao,
            filterLinha,
            filterData,
            filterWO,
            filterModelo,
            filterModeloSerial,
            filterDescricaoAjustada,
            filterHora,
        ].forEach((container) => {
            if (!container) return;
            container.querySelectorAll("input:checked").forEach((i) => (i.checked = false));
        });

        filtroParetoCausa = null;
        filtroParetoItem = null;
        filtroEstacaoPizza = null;

        recomputarEDesenhar();
    });
}

// ===============================
// SELECT ALL / UNSELECT ALL — BOTÕES NOS FILTROS
// ===============================

// Cria botões automaticamente em cada bloco de filtro
function criarBotaoToggle(container) {
    if (!container) return;

    const button = document.createElement("button");
    button.className = "btn-toggle-select";
    button.textContent = "Selecionar todos";
    button.style.marginBottom = "6px";
    button.style.fontSize = "12px";
    button.style.padding = "4px 8px";
    button.style.borderRadius = "6px";
    button.style.border = "1px solid #b3b3b3";
    button.style.cursor = "pointer";
    button.style.backgroundColor = "#e6e6e6";

    button.addEventListener("click", () => {
        toggleSelectAll(container, button);
    });

    container.parentNode.insertBefore(button, container);
}

// Selecionar/Desmarcar todos
function toggleSelectAll(container, button) {
    const checkboxes = container.querySelectorAll("input[type='checkbox']");
    const allChecked = Array.from(checkboxes).every(ch => ch.checked);
    checkboxes.forEach(ch => ch.checked = !allChecked);

    button.textContent = allChecked ? "Selecionar todos" : "Desmarcar todos";

    recomputarEDesenhar();
}

// Ativar botões nos grupos de filtros
function ativarToggleTodos() {
    criarBotaoToggle(filterEstacao);
    criarBotaoToggle(filterLinha);
    criarBotaoToggle(filterData);
    criarBotaoToggle(filterWO);
    criarBotaoToggle(filterModelo);
    criarBotaoToggle(filterModeloSerial);
    criarBotaoToggle(filterDescricaoAjustada);
    criarBotaoToggle(filterHora);
}


// ===============================
// RECOMPUTAR + REDESENHAR TUDO
// ===============================
function recomputarEDesenhar() {
    if (!outputRows.length) return;

    const selEstacao = getCheckboxValues(filterEstacao);
    const selLinha = getCheckboxValues(filterLinha);
    const selData = getCheckboxValues(filterData);
    const selWO = getCheckboxValues(filterWO);
    const selModelo = getCheckboxValues(filterModelo);
    const selModeloSerial = getCheckboxValues(filterModeloSerial);
    const selDescAjustada = getCheckboxValues(filterDescricaoAjustada);
    const selHora = getCheckboxValues(filterHora);

    const outputFiltrado = outputRows.filter((r) => {
        if (selEstacao.length && !selEstacao.includes(r.Estacao)) return false;
        if (selLinha.length && !selLinha.includes(r.Linha)) return false;
        if (selData.length && !selData.includes(r.Data)) return false;
        if (selWO.length && !selWO.includes(r["Work Order"])) return false;
        if (selModelo.length && !selModelo.includes(r["Nome do Modelo"])) return false;
        if (selModeloSerial.length && !selModeloSerial.includes(r["Modelo Serial"])) return false;
        return true;
    });

    const validKeys = new Set();
    outputFiltrado.forEach((r) => {
        const est = r.Estacao || "SEM ESTAÇÃO";
        const wo = r["Work Order"] || "";
        validKeys.add(`${est}||${wo}`);
    });

    let falhasFiltradas = falhasRows.filter((f) => {
        const est = f.Estacao_Ajustada || "SEM ESTAÇÃO";
        const wo = f["Work Order"] || "";
        if (!validKeys.size) return true;
        return validKeys.has(`${est}||${wo}`);
    });

    if (selDescAjustada.length) {
        falhasFiltradas = falhasFiltradas.filter((f) =>
            selDescAjustada.includes(f.Descricao_Ajustada || "")
        );
    }

    // ⭐ NOVO: Filtro de horas
    if (selHora.length) {
        falhasFiltradas = falhasFiltradas.filter((f) => {
            const hora = extrairHora(f["Data da falha"]);
            return selHora.includes(hora);
        });
    }

    falhasFiltradas = falhasFiltradas.filter((f) => {
        const causa = normalizarDescricao1(f["Descrição.1"]);
        const item = f.Item || "SEM INFORMAÇÃO";
        const est = f.Estacao_Ajustada || "SEM ESTAÇÃO";

        if (filtroParetoCausa && causa !== filtroParetoCausa) return false;
        if (filtroParetoItem && item !== filtroParetoItem) return false;
        if (filtroEstacaoPizza && est !== filtroEstacaoPizza) return false;

        return true;
    });

    const resumo = calcularResumoPorEstacao(outputFiltrado, falhasFiltradas);
    desenharResumoTabela(resumo);

    const paretoCausaData = calcularPareto(falhasFiltradas, "Descrição.1");
    paretoCausaChart = desenharPareto(
        paretoCausaChart,
        "paretoCausaChart",
        paretoCausaData,
        "Causas",
        "causa"
    );

    const paretoItemData = calcularPareto(falhasFiltradas, "Item");
    paretoItemChart = desenharPareto(
        paretoItemChart,
        "paretoItemChart",
        paretoItemData,
        "Itens",
        "item"
    );

    const pizzaData = calcularPizzaEstacao(falhasFiltradas);
    pieEstacaoChart = desenharPizza(
        pieEstacaoChart,
        "pieEstacaoChart",
        pizzaData
    );

    const pivot = calcularPivotModelo(outputFiltrado);
    desenharPivotModelo(pivot);

    desenharFalhasPreview(falhasFiltradas.slice(0, 200));
}

function calcularResumoPorEstacao(outputFiltrado, falhasFiltradas) {
    const map = new Map();

    // PASS
    outputFiltrado.forEach((r) => {
        const est = r.Estacao || "SEM ESTAÇÃO";
        const pass = Number(r.Total || r.Board_Pass || 0);
        const data = r.Data || "";

        if (!map.has(est)) {
            map.set(est, { estacao: est, pass: 0, fail: 0, data });
        }

        const ref = map.get(est);
        ref.pass += pass;
        if (!ref.data && data) ref.data = data;
    });

    // FAIL
    falhasFiltradas.forEach((f) => {
        const est = f.Estacao_Ajustada || "SEM ESTAÇÃO";
        if (!map.has(est)) {
            map.set(est, { estacao: est, pass: 0, fail: 0, data: "" });
        }
        map.get(est).fail += 1;
    });

    const arr = Array.from(map.values()).map((r) => {
        const total = r.pass;
        const taxaDefeito = total > 0 ? r.fail / total : 0;
        const fpy = 1 - taxaDefeito;

        return {
            ...r,
            total,
            taxaDefeito,
            fpy,
        };
    });

    arr.sort((a, b) => a.estacao.localeCompare(b.estacao));
    return arr;
}

function normalizarDescricao1(valor) {
    if (valor === null || valor === undefined) return "TBA";
    const txt = String(valor).trim();
    if (!txt) return "TBA";
    return txt;
}

function calcularPareto(rows, campo) {
    const cont = {};

    rows.forEach((r) => {
        let key;
        if (campo === "Descrição.1") {
            key = normalizarDescricao1(r["Descrição.1"]);
        } else {
            key = r[campo];
            if (!key || String(key).trim() === "") key = "SEM INFORMAÇÃO";
        }

        if (!cont[key]) cont[key] = 0;
        cont[key] += 1;
    });

    const arr = Object.entries(cont).map(([label, qtd]) => ({ label, qtd }));
    arr.sort((a, b) => b.qtd - a.qtd);

    const totalFalhas = arr.reduce((s, x) => s + x.qtd, 0);

    let acum = 0;
    const labels = [];
    const valores = [];
    const percAcumulado = [];

    arr.forEach((x) => {
        labels.push(x.label);
        valores.push(x.qtd);
        acum += x.qtd;
        percAcumulado.push(totalFalhas ? (acum / totalFalhas) * 100 : 0);
    });

    return { labels, valores, percAcumulado };
}

function calcularPizzaEstacao(rows) {
    const cont = {};
    rows.forEach((r) => {
        const est = r.Estacao_Ajustada || "SEM ESTAÇÃO";
        if (!cont[est]) cont[est] = 0;
        cont[est] += 1;
    });

    return { labels: Object.keys(cont), valores: Object.values(cont) };
}

function calcularPivotModelo(outputFiltrado) {
    const map = {};
    outputFiltrado.forEach((r) => {
        const modelo = r["Nome do Modelo"] || "SEM MODELO";
        const total = Number(r.Total || r.Board_Pass || 0);
        if (!map[modelo]) map[modelo] = 0;
        map[modelo] += total;
    });

    const arr = Object.entries(map).map(([modelo, total]) => ({
        modelo,
        total,
    }));

    arr.sort((a, b) => b.total - a.total);
    return arr;
}



// ===============================
// TABELAS
// ===============================
function desenharResumoTabela(resumo) {
    resumoTableBody.innerHTML = "";
    resumo.forEach((r) => {
        const taxaDefeito = r.taxaDefeito * 100;
        const fpy = r.fpy * 100;
        
        // ⭐ CORES CONDICIONAIS (APENAS STYLE)
        let styleTaxaDefeito = "";
        let styleFpy = "";
        
        // Taxa Defeito > 2.00% → VERMELHO
        if (taxaDefeito > 2.0) {
            styleTaxaDefeito = 'style="background-color: #ffcccc; color: #cc0000; font-weight: bold;"';
        }
        
        // FPY >= 99.00% → VERDE
        if (fpy >= 99.0) {
            styleFpy = 'style="background-color: #ccffcc; color: #00cc00; font-weight: bold;"';
        } else {
            // FPY < 99.00% → VERMELHO
            styleFpy = 'style="background-color: #ffcccc; color: #cc0000; font-weight: bold;"';
        }
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.estacao}</td>
            <td>${r.data || ""}</td>
            <td>${r.pass}</td>
            <td>${r.fail}</td>
            <td>${r.total}</td>
            <td ${styleTaxaDefeito}>${(r.taxaDefeito * 100).toFixed(2)}%</td>
            <td ${styleFpy}>${(r.fpy * 100).toFixed(2)}%</td>
        `;
        resumoTableBody.appendChild(tr);
    });
}

function desenharPivotModelo(pivot) {
    pivotModeloBody.innerHTML = "";
    pivot.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.modelo}</td>
            <td>${r.total}</td>
        `;
        pivotModeloBody.appendChild(tr);
    });

    ativarCliqueTabelaModelo();
}

function ativarCliqueTabelaModelo() {
    const linhas = document.querySelectorAll("#pivot-modelo-table tbody tr");

    linhas.forEach((linha) => {
        linha.style.cursor = "pointer";

        linha.addEventListener("click", () => {
            const modelo = linha.children[0].innerText.trim();

            const checkboxes = Array.from(
                filterModelo.querySelectorAll("input")
            );

            const ativo = checkboxes.some(
                (cb) => cb.checked && cb.value === modelo
            );

            if (ativo) {
                checkboxes.forEach((cb) => (cb.checked = false));
            } else {
                checkboxes.forEach((cb) => {
                    cb.checked = cb.value === modelo;
                });
            }

            recomputarEDesenhar();
        });
    });
}

function desenharFalhasPreview(rows) {
    falhasTableBody.innerHTML = "";
    rows.forEach((r) => {
        const desc1 = normalizarDescricao1(r["Descrição.1"]);
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.Serial || ""}</td>
            <td>${r.Estacao_Ajustada || ""}</td>
            <td>${r.Descricao_Ajustada || ""}</td>
            <td>${desc1}</td>
        `;
        falhasTableBody.appendChild(tr);
    });
}

// ===============================
// GRÁFICOS - PARETO (CAUSAS / ITENS)
// ===============================
function desenharPareto(chartInstance, canvasId, dados, labelBars, tipo) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (chartInstance) chartInstance.destroy();

    const newChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: dados.labels,
            datasets: [
                {
                    type: "bar",
                    label: `${labelBars} - Qtd Falhas`,
                    data: dados.valores,
                    backgroundColor: "#79bbff",
                    borderColor: "#467fcf",
                    borderWidth: 1,
                    yAxisID: "y",
                    order: 1,
                },
                {
                    type: "line",
                    label: "% Acumulado",
                    data: dados.percAcumulado,
                    yAxisID: "y1",
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: 3,
                    borderColor: "#ff4d8d",
                    backgroundColor: "#ff4d8d",
                    order: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            plugins: {
                legend: {
                    position: "top",
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === "y1") {
                                return `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;
                            }
                            return `${ctx.dataset.label}: ${ctx.raw}`;
                        },
                    },
                },
                datalabels: {
                    anchor: "end",
                    align: "end",
                    clamp: true,
                    clip: false,
                    offset: 4,
                    color: "#000",
                    font: { size: 10, weight: "bold" },
                    formatter: (value, ctx) => {
                        if (ctx.dataset.yAxisID === "y1") {
                            return value.toFixed(1) + "%";
                        }
                        return value;
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 0,
                    },
                },
                y: {
                    beginAtZero: true,
                    grace: "15%",
                    title: {
                        display: true,
                        text: "Qtd Falhas",
                    },
                    ticks: {
                        padding: 6,
                    },
                },
                y1: {
                    beginAtZero: true,
                    max: 115,
                    grace: "7%",
                    position: "right",
                    grid: {
                        drawOnChartArea: false,
                    },
                    ticks: {
                        callback: (v) => `${v}%`,
                        padding: 10,
                    },
                    title: {
                        display: true,
                        text: "% Acumulado",
                    },
                },
            },
            onClick: (evt, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const categoria = dados.labels[idx];

                if (tipo === "causa") {
                    filtroParetoCausa =
                        filtroParetoCausa === categoria ? null : categoria;
                } else if (tipo === "item") {
                    filtroParetoItem =
                        filtroParetoItem === categoria ? null : categoria;
                }

                recomputarEDesenhar();
            },
        },
    });

    return newChart;
}



// ===============================
// GRÁFICO DE PIZZA - FALHAS POR ESTAÇÃO
// ===============================
function desenharPizza(chartInstance, canvasId, dados) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (chartInstance) chartInstance.destroy();

    const total = dados.valores.reduce((s, v) => s + v, 0);

    const newChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: dados.labels,
            datasets: [
                {
                    data: dados.valores,
                    backgroundColor: [
                        "#4e79a7",
                        "#f28e2b",
                        "#e15759",
                        "#76b7b2",
                        "#59a14f",
                        "#edc949",
                        "#af7aa1",
                        "#ff9da7",
                        "#9c755f",
                        "#bab0ab",
                    ],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const qtd = ctx.raw;
                            const perc = total ? (qtd / total) * 100 : 0;
                            return `${ctx.label}: ${qtd} (${perc.toFixed(1)}%)`;
                        },
                    },
                },
                datalabels: {
                    formatter: (value) => {
                        const perc = total ? (value / total) * 100 : 0;
                        return `${value} (${perc.toFixed(1)}%)`;
                    },
                    color: "#000",
                    font: { size: 10 },
                },
            },
            onClick: (evt, elements) => {
                if (!elements.length) return;

                const idx = elements[0].index;
                const est = dados.labels[idx];

                filtroEstacaoPizza =
                    filtroEstacaoPizza === est ? null : est;

                recomputarEDesenhar();
            },
        },
    });

    return newChart;
}