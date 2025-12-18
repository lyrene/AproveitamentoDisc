/* ============================================================
   processos.js — Módulo A (versão final, robusta)
   ============================================================ */

/* ------------ Botões ------------ */

document.getElementById("btnProcessar").onclick = () => {
    const arquivo = document.getElementById("arquivoHTML").files[0];
    if (!arquivo) {
        alert("Selecione um arquivo HTML primeiro.");
        return;
    }
    lerHTML(arquivo);
};

document.getElementById("btnCSV").onclick = () => {
    if (BD.lista_processos.length === 0) {
        alert("Nenhum processo carregado.");
        return;
    }

    const csv = gerarCSV_processos(BD.lista_processos);
    download_blob(csv, "processos_iniciais.csv");
};


/* ------------ Leitura do arquivo HTML ------------ */

function lerHTML(arquivo) {
    const leitor = new FileReader();

    leitor.onload = () => {
        const texto = leitor.result;
        const processos = extrairProcessosDoHTML(texto);

        // Ordenação por nome do aluno (normalizado)
        processos.sort((a, b) =>
            normalizar_nome(a.nome_aluno).localeCompare(normalizar_nome(b.nome_aluno))
        );

        BD.lista_processos = processos;
        mostrarTabelaProcessos(processos);
    };

    leitor.readAsText(arquivo, "UTF-8");
}


/* ============================================================
   EXTRAÇÃO — SUPORTA TABELA E PÁGINA INDIVIDUAL (OPÇÃO B)
   ============================================================ */

function extrairProcessosDoHTML(htmlTexto) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlTexto, "text/html");

    let lista = [];

    /* --------- Caso 1: Tabela com vários processos --------- */
    const linhas_inicio = doc.querySelectorAll("td[rowspan='6']");

    if (linhas_inicio.length > 0) {
        lista = extrairProcessos_daTabela(doc);
        return lista;
    }

    /* --------- Caso 2: Página individual --------- */
    const processo_individual = extrairProcesso_individual(doc);
    if (processo_individual) {
        return [processo_individual];
    }

    return [];
}


/* ============================================================
   EXTRAÇÃO DA TABELA — VERSÃO ROBUSTA
   ============================================================ */

function extrairProcessos_daTabela(doc) {
    const processos = [];
    const inicios = doc.querySelectorAll("td[rowspan='6']");

    inicios.forEach(td => {
        const tr_principal = td.closest("tr");
        const cols = tr_principal.querySelectorAll("td");

        const num_processo = cols[0]?.innerText.trim();
        const nome_aluno   = cols[1]?.innerText.trim();

        /* ======================================================
           NOVO BLOCO: PROCURAR ORIGEM / DESTINO / SITUAÇÃO
           SEM DEPENDER DA ESTRUTURA FIXA
        ====================================================== */

        let origem_processo = "";
        let destino_processo = "";
        let situacao_processo = "";

        // Vamos avançar até encontrar uma linha que contenha Origem / Destino.
        let tr = tr_principal.nextElementSibling;

        while (tr) {

            // Procurar qualquer bloco com informações
            const celulaExpandida = tr.querySelector("td[colspan]");

            if (celulaExpandida) {
                // Dentro do bloco expandido procurar qualquer <td> com textos relevantes
                const tds = celulaExpandida.querySelectorAll("td");

                tds.forEach(td2 => {
                    const texto = td2.innerText.replace(/\u00a0/g, " ").trim();

                    if (texto.includes("Origem:")) {
                        origem_processo = texto.replace(/.*Origem:\s*/i, "").trim();
                    }
                    if (texto.includes("Destino:")) {
                        destino_processo = texto.replace(/.*Destino:\s*/i, "").trim();
                    }
                    if (texto.includes("Situação")) {
                        situacao_processo = texto.replace(/.*Situação:\s*/i, "").trim();
                    }
                });

                // Se já capturou ao menos um dos campos, paramos
                if (origem_processo || destino_processo || situacao_processo) {
                    break;
                }
            }

            // continuar avançando
            tr = tr.nextElementSibling;
        }

        processos.push({
            num_processo,
            nome_aluno,
            nome_aluno_normalizado: normalizar_nome(nome_aluno),
            origem_processo,
            destino_processo,
            situacao_processo
        });
    });

    return processos;
}


/* ============================================================
   EXTRAÇÃO DA PÁGINA INDIVIDUAL
   ============================================================ */

function extrairProcesso_individual(doc) {
    function pegar(label) {
        const el = [...doc.querySelectorAll("b")]
            .find(b => b.innerText.trim().startsWith(label));
        if (!el) return "";
        return el.parentElement.innerText
            .replace(label, "")
            .trim();
    }

    const num = pegar("Número do Processo:");
    if (!num) return null;

    return {
        num_processo: num,
        nome_aluno: pegar("Interessado:"),
        nome_aluno_normalizado: normalizar_nome(pegar("Interessado:")),
        origem_processo: pegar("Origem:") || pegar("Unidade de Origem:"),
        destino_processo: pegar("Destino:") || pegar("Unidade de Destino:"),
        situacao_processo: pegar("Situação:") || pegar("Situação Atual:")
    };
}


/* ============================================================
   EXIBIÇÃO DA TABELA
   ============================================================ */

function mostrarTabelaProcessos(lista) {
    const div = document.getElementById("resultado_processos");
    div.innerHTML = "";

    if (lista.length === 0) {
        div.innerHTML = "<p>Nenhum processo encontrado no arquivo.</p>";
        return;
    }

    let html = `
        <table class="tabela">
            <thead>
                <tr>
                    <th>Nº Processo</th>
                    <th>Nome do Aluno</th>
                    <th>Origem</th>
                    <th>Destino</th>
                    <th>Situação</th>
                </tr>
            </thead>
            <tbody>
    `;

    lista.forEach(p => {
        html += `
            <tr>
                <td>${p.num_processo}</td>
                <td>${p.nome_aluno}</td>
                <td>${p.origem_processo}</td>
                <td>${p.destino_processo}</td>
                <td>${p.situacao_processo}</td>
            </tr>`;
    });

    html += "</tbody></table>";

    div.innerHTML = html;
}
