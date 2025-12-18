// requerimentos.js — Módulo B (versão simplificada e corrigida)

// ====== BASE DE DADOS ======
if (typeof window.BD === "undefined") {
    window.BD = {
        lista_processos: [],
        lista_requerimentos: [],
        aproveitamentos: []
    };
} else {
    if (!BD.lista_processos) BD.lista_processos = [];
    if (!BD.lista_requerimentos) BD.lista_requerimentos = [];
    if (!BD.aproveitamentos) BD.aproveitamentos = [];
}

// ====== FUNÇÕES UTILITÁRIAS (FALLBACKS) ======
if (typeof window.normalizar_nome === "undefined") {
    window.normalizar_nome = function (s) {
        return (s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    };
}

if (typeof window.download_blob === "undefined") {
    window.download_blob = function (conteudo, nome_arquivo) {
        const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome_arquivo;
        a.click();
        URL.revokeObjectURL(url);
    };
}

// ====== INICIALIZAÇÃO DOS BOTÕES ======
document.addEventListener("DOMContentLoaded", () => {
    const btnCarregarCSV = document.getElementById("btnCarregarCSV");
    const btnExtrairPDFs = document.getElementById("btnExtrairPDFs");
    const btnCSVFinal = document.getElementById("btnCSVFinal");

    if (btnCarregarCSV) btnCarregarCSV.addEventListener("click", carregarCSV_Processos);
    if (btnExtrairPDFs) btnExtrairPDFs.addEventListener("click", processarPDFs);
    if (btnCSVFinal) btnCSVFinal.addEventListener("click", baixarCSVIntermediario);
});

// ======================================================
// PASSO 1 — CARREGAR CSV DOS PROCESSOS
// ======================================================
function carregarCSV_Processos() {
    const input = document.getElementById("csvProcessos");
    const arquivo = input && input.files ? input.files[0] : null;

    if (!arquivo) {
        alert("Selecione o arquivo CSV gerado pelo Módulo A.");
        return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
        try {
            const texto = leitor.result || "";
            let linhas = texto.split(/\r?\n/);

            // remove linhas completamente vazias
            linhas = linhas.map(l => l.trim()).filter(l => l.length > 0);

            if (linhas.length < 2) {
                alert("O CSV não contém dados suficientes.");
                return;
            }

            // primeira linha = cabeçalho (mas não travamos se for diferente)
            // esperada: num_processo;nome_aluno;origem_processo;destino_processo;situacao_processo
            const cabecalho = linhas[0].split(";").map(c => c.replace(/^"|"$/g, "").trim());

            BD.lista_processos = [];

            for (let i = 1; i < linhas.length; i++) {
                const linha = linhas[i];
                if (!linha) continue;

                const cols = linha.split(";").map(c => c.replace(/^"|"$/g, "").trim());

                const num_processo     = cols[0] || "";
                const nome_aluno       = cols[1] || "";
                const origem_processo  = cols[2] || "";
                const destino_processo = cols[3] || "";
                const situacao_processo= cols[4] || "";

                if (!num_processo && !nome_aluno) continue;

                BD.lista_processos.push({
                    num_processo,
                    nome_aluno,
                    nome_aluno_normalizado: normalizar_nome(nome_aluno),
                    origem_processo,
                    destino_processo,
                    situacao_processo
                });
            }

            const divPreview = document.getElementById("previewCSV");
            if (divPreview) {
                divPreview.innerHTML =
                    `<p><b>${BD.lista_processos.length}</b> processos carregados com sucesso.</p>`;
            }

            const passo2 = document.getElementById("passo2");
            if (passo2) passo2.style.display = "block";

        } catch (e) {
            console.error("Erro ao processar CSV:", e);
            alert("Erro ao processar o CSV. Verifique o arquivo.");
        }
    };

    leitor.readAsText(arquivo, "UTF-8");
}

// ======================================================
// PASSO 2 — PROCESSAR PDFs
// ======================================================
async function processarPDFs() {
    const input = document.getElementById("pdfs");
    const arquivos = input && input.files ? input.files : [];

    if (!arquivos.length) {
        alert("Selecione ao menos um arquivo PDF.");
        return;
    }

    if (!window.pdfjsLib) {
        alert("Biblioteca PDF.js não carregada. Verifique o script pdf.js em requerimentos.html.");
        return;
    }

    BD.lista_requerimentos = [];

    const divPreview = document.getElementById("previewPDFs");
    if (divPreview) {
        divPreview.innerHTML = "<h3>Arquivos carregados:</h3>";
        const ul = document.createElement("ul");
        divPreview.appendChild(ul);

        for (const arquivo of arquivos) {
            try {
                const texto = await extrairTextoPDF(arquivo);
                const req = extrairDadosRequerimento(texto);
                req.arquivo = arquivo;

                // associação aluno → processo
                const candidatos = BD.lista_processos.filter(
                    p => p.nome_aluno_normalizado === req.nome_aluno_normalizado
                );

                if (candidatos.length === 1) {
                    req.processo_associado = candidatos[0];
                    req.status = "ok";
                } else if (candidatos.length > 1) {
                    req.processo_associado = null;
                    req.opcoes_processos = candidatos;
                    req.status = "ambiguo";
                } else {
                    req.processo_associado = null;
                    req.status = "nao_encontrado";
                }

                BD.lista_requerimentos.push(req);

                const li = document.createElement("li");
                li.innerHTML =
                    `<b>${arquivo.name}</b> — ${req.nome_aluno || "NOME NÃO ENCONTRADO"} — ` +
                    `<i>${req.status}</i> | ` +
                    `Origens: ${req.disciplinas_origem.length}, Destinos: ${req.disciplinas_destino.length}`;
                ul.appendChild(li);

            } catch (e) {
                console.error("Erro ao processar PDF:", arquivo.name, e);
                const li = document.createElement("li");
                li.innerHTML = `<b>${arquivo.name}</b> — erro ao ler o PDF.`;
                ul.appendChild(li);
            }
        }
    }

    mostrarAmbiguidades();

    const passo3 = document.getElementById("passo3");
    if (passo3) passo3.style.display = "block";

    const passo4 = document.getElementById("passo4");
    if (passo4) passo4.style.display = "block";
}

// ======================================================
// EXTRAÇÃO DE TEXTO DOS PDFs (PDF.js)
// ======================================================
async function extrairTextoPDF(arquivo) {
    const arrayBuffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let texto = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        texto += conteudo.items.map(item => item.str).join("\n") + "\n";
    }

    return texto;
}

// ======================================================
// EXTRAÇÃO DOS DADOS DO REQUERIMENTO
// ======================================================
function extrairDadosRequerimento(texto) {
    // Nome
    let nome =
        texto.match(/Nome:\s*(.+)/i)?.[1]?.trim() ||
        texto.match(/Discente:\s*(.+)/i)?.[1]?.trim() ||
        "";

    if (nome.includes("Matrícula")) {
        nome = nome.split("Matrícula")[0].trim();
    }

    // Matrícula
    const matricula = texto.match(/Matr[ií]cula:\s*([0-9]+)/i)?.[1] || "";

    const disciplinas_origem  = extrairTabelaDisciplinas(texto, "origem");
    const disciplinas_destino = extrairTabelaDisciplinas(texto, "destino");

    return {
        nome_aluno: nome || "NOME NÃO ENCONTRADO",
        nome_aluno_normalizado: normalizar_nome(nome || ""),
        matricula,
        disciplinas_origem,
        disciplinas_destino,
        processo_associado: null,
        status: "pendente"
    };
}

// ======================================================
// EXTRAÇÃO DE TABELAS DE DISCIPLINAS
// ======================================================
function extrairTabelaDisciplinas(texto, tipo) {
    let marcador_inicio, marcador_fim;

    if (tipo === "origem") {
        marcador_inicio = "Ementa dos Componentes Curriculares Integralizados nos Cursos Anteriores";
        marcador_fim    = "Componentes Curriculares Solicitados - Solicitação de Aproveitamento de Estudos Manual Interno";
    } else {
        marcador_inicio = "Componentes Curriculares Solicitados - Solicitação de Aproveitamento de Estudos Manual Interno";
        marcador_fim    = "Ementa dos Componentes Curriculares Solicitados";
    }

    const idxInicio = texto.indexOf(marcador_inicio);
    if (idxInicio === -1) return [];

    const idxFim = texto.indexOf(marcador_fim, idxInicio + marcador_inicio.length);
    let trecho;
    if (idxFim !== -1) {
        trecho = texto.substring(idxInicio, idxFim);
    } else {
        trecho = texto.substring(idxInicio, idxInicio + 8000);
    }

    const linhas = trecho
        .split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const disciplinas = [];
    const vistos = new Set();

    for (const l of linhas) {
        const m = l.match(/^([A-Z]{2,}\d{3,})\s*-\s*(.+?)\s*-\s*(\d{2,3})h/i);
        if (m) {
            const codigo = m[1];
            const nome   = m[2];
            const ch     = m[3];
            const chave  = `${codigo}///${nome}///${ch}`;
            if (!vistos.has(chave)) {
                vistos.add(chave);
                disciplinas.push({ codigo, nome, ch });
            }
        }
    }

    return disciplinas;
}

// ======================================================
// AMBIGUIDADES (interface simples)
// ======================================================
function mostrarAmbiguidades() {
    const div = document.getElementById("tabelaAmbiguidades");
    if (!div) return;

    const problematicos = BD.lista_requerimentos.filter(r => r.status !== "ok");

    if (!problematicos.length) {
        div.innerHTML = "<p>Nenhuma ambiguidade ou problema de associação foi encontrado.</p>";
        return;
    }

    let html = "<h3>Requerimentos com problemas de associação:</h3>";

    problematicos.forEach((r, idx) => {
        html += `<div class="amb-box">
            <p><b>${r.nome_aluno}</b> — status: <i>${r.status}</i></p>`;

        if (r.status === "ambiguo" && Array.isArray(r.opcoes_processos)) {
            html += `<p>Selecione o processo correto:</p>
                     <select data-idx="${idx}" class="selProc">`;

            r.opcoes_processos.forEach(p => {
                html += `<option value="${p.num_processo}">
                            ${p.num_processo} — ${p.nome_aluno}
                         </option>`;
            });

            html += "</select>";
        }

        if (r.status === "nao_encontrado") {
            html += `<p style="color:#b00;">Nenhum processo encontrado para este aluno no CSV.</p>`;
        }

        html += `</div>`;
    });

    div.innerHTML = html;

    const selects = div.querySelectorAll(".selProc");
    selects.forEach(sel => {
        sel.addEventListener("change", e => {
            const idx = parseInt(e.target.getAttribute("data-idx"), 10);
            const req = problematicos[idx];
            const num = e.target.value;

            const proc = BD.lista_processos.find(p => p.num_processo === num);
            if (proc) {
                req.processo_associado = proc;
                req.status = "ok";
            }
        });
    });
}

// ======================================================
// MATCH ORIGEM ↔ DESTINO + CSV INTERMEDIÁRIO
// ======================================================
function criarAproveitamentos() {
    BD.aproveitamentos = [];

    for (const req of BD.lista_requerimentos) {
        const origens  = [...req.disciplinas_origem];
        const destinos = [...req.disciplinas_destino];

        const pares = [];

        // 1) por código
        for (const o of origens) {
            const d = destinos.find(x => x.codigo === o.codigo);
            if (d) {
                pares.push({ req, origem: o, destino: d, tipo: "codigo" });
                destinos.splice(destinos.indexOf(d), 1);
            }
        }

        // 2) por nome
        for (const o of origens) {
            if (pares.some(p => p.origem === o)) continue;
            const d = destinos.find(x =>
                normalizar_nome(x.nome).includes(normalizar_nome(o.nome))
            );
            if (d) {
                pares.push({ req, origem: o, destino: d, tipo: "nome" });
                destinos.splice(destinos.indexOf(d), 1);
            }
        }

        // 3) sobras
        const sobrasO = origens.filter(o => !pares.some(p => p.origem === o));
        const sobrasD = destinos;
        const max = Math.max(sobrasO.length, sobrasD.length);

        for (let i = 0; i < max; i++) {
            pares.push({
                req,
                origem: sobrasO[i] || null,
                destino: sobrasD[i] || null,
                tipo: "aleatorio"
            });
        }

        BD.aproveitamentos.push(...pares);
    }
}

function baixarCSVIntermediario() {
    if (!BD.lista_requerimentos.length) {
        alert("Nenhum requerimento processado. Carregue os PDFs primeiro.");
        return;
    }

    criarAproveitamentos();

    const linhas = [];
    linhas.push("num_processo;nome_aluno;matricula;origem_codigo;origem_nome;origem_ch;destino_codigo;destino_nome;destino_ch;tipo_match");

    for (const a of BD.aproveitamentos) {
        const p = a.req.processo_associado || {};

        const linha = [
            p.num_processo || "",
            a.req.nome_aluno || "",
            a.req.matricula || "",
            a.origem  ? a.origem.codigo || "" : "",
            a.origem  ? a.origem.nome   || "" : "",
            a.origem  ? a.origem.ch     || "" : "",
            a.destino ? a.destino.codigo|| "" : "",
            a.destino ? a.destino.nome  || "" : "",
            a.destino ? a.destino.ch    || "" : "",
            a.tipo || ""
        ]
            .map(v => `"${v}"`)
            .join(";");

        linhas.push(linha);
    }

    const csv = linhas.join("\n");
    download_blob(csv, "aproveitamentos_intermediario.csv");
}
