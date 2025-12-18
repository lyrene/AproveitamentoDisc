/* ============================================================
   core.js — Funções utilitárias e base de dados compartilhada
   ============================================================ */

const BD = {
    lista_processos: [],
    lista_requerimentos: [],
    aproveitamentos: []
};

/* ------------ Normalização de Strings ------------ */
function normalizar_nome(nome) {
    return nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/* ------------ Download de arquivos ------------ */
function download_blob(conteudo, nome_arquivo) {
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = nome_arquivo;
    a.click();

    URL.revokeObjectURL(url);
}

/* ------------ Gerar CSV de processos ------------ */
function gerarCSV_processos(lista) {
    const linhas = [];
    linhas.push("num_processo;nome_aluno;origem_processo;destino_processo;situacao_processo");

    for (const p of lista) {
        const linha = [
            p.num_processo,
            p.nome_aluno,
            p.origem_processo,
            p.destino_processo,
            p.situacao_processo
        ]
        .map(v => `"${v ?? ""}"`)
        .join(";");

        linhas.push(linha);
    }

    return linhas.join("\n");
}
