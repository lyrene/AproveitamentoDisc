// fichas.js — Módulo C (geração de fichas em PDF dentro de um ZIP)

// =============================================================================
// BASE DE DADOS LOCAL
// =============================================================================

if (typeof window.BD === "undefined") {
    window.BD = {};
}

if (!BD.aproveitamentos_por_processo) {
    BD.aproveitamentos_por_processo = {}; // { num_processo: { cabecalho, linhas: [] } }
}

// Fallback de normalização, caso não esteja em core.js
if (typeof window.normalizar_nome === "undefined") {
    window.normalizar_nome = function (s) {
        return (s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const btnCarregarAprov = document.getElementById("btnCarregarAprov");
    const btnGerarFichas   = document.getElementById("btnGerarFichas");
    const btnGerarDocx     = document.getElementById("btnGerarDocx");

    if (btnCarregarAprov) btnCarregarAprov.addEventListener("click", carregarCSV_Aproveitamentos);
    if (btnGerarFichas)   btnGerarFichas.addEventListener("click", gerarZIPComFichas);
    if (btnGerarDocx)     btnGerarDocx.addEventListener("click", gerarZIPComDocxs);
});


// =============================================================================
// PASSO 1 — CARREGAR CSV INTERMEDIÁRIO (APROVEITAMENTOS)
// =============================================================================

function carregarCSV_Aproveitamentos() {
    const input = document.getElementById("csvAproveitamentos");
    const arquivo = input && input.files ? input.files[0] : null;

    if (!arquivo) {
        alert("Selecione o CSV intermediário (aproveitamentos_intermediario.csv).");
        return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
        try {
            const texto = leitor.result || "";
            let linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

            if (linhas.length < 2) {
                alert("O CSV não contém dados suficientes.");
                return;
            }

            const cabecalhoCols = linhas[0].split(";").map(c => c.replace(/^"|"$/g, "").trim());

            // Mapeia índices por nome de coluna
            const idx = {
                num_processo:   cabecalhoCols.indexOf("num_processo"),
                nome_aluno:     cabecalhoCols.indexOf("nome_aluno"),
                matricula:      cabecalhoCols.indexOf("matricula"),
                origem_codigo:  cabecalhoCols.indexOf("origem_codigo"),
                origem_nome:    cabecalhoCols.indexOf("origem_nome"),
                origem_ch:      cabecalhoCols.indexOf("origem_ch"),
                destino_codigo: cabecalhoCols.indexOf("destino_codigo"),
                destino_nome:   cabecalhoCols.indexOf("destino_nome"),
                destino_ch:     cabecalhoCols.indexOf("destino_ch"),
                tipo_match:     cabecalhoCols.indexOf("tipo_match"),
                natureza:       cabecalhoCols.indexOf("Natureza"),     // coluna Natureza (se existir)
                inst_origem:    cabecalhoCols.indexOf("inst_origem")   // coluna Inst. Origem (se existir)
            };

            BD.aproveitamentos_por_processo = {};

            for (let i = 1; i < linhas.length; i++) {
                const linha = linhas[i];
                if (!linha) continue;

                const cols = linha.split(";").map(c => c.replace(/^"|"$/g, "").trim());

                const num_processo = pegaColuna(cols, idx.num_processo) || "";
                if (!num_processo) continue;

                const nome_aluno = pegaColuna(cols, idx.nome_aluno) || "";
                const matricula  = pegaColuna(cols, idx.matricula)  || "";

                const origem = {
                    inst_origem: "", // será resolvido abaixo
                    codigo:      pegaColuna(cols, idx.origem_codigo) || "",
                    nome:        pegaColuna(cols, idx.origem_nome)   || "",
                    ch:          pegaColuna(cols, idx.origem_ch)     || ""
                };

                // Inst. Origem: se houver coluna e não estiver vazia, usar; senão "UFRN"
                const instCSV = pegaColuna(cols, idx.inst_origem);
                origem.inst_origem = instCSV ? instCSV : "UFRN";

                const destino = {
                    codigo: pegaColuna(cols, idx.destino_codigo) || "",
                    nome:   pegaColuna(cols, idx.destino_nome)   || "",
                    ch:     pegaColuna(cols, idx.destino_ch)     || ""
                };

                // Natureza: se existir coluna Natureza, usar; caso contrário, vazio
                let natureza = "";
                if (idx.natureza >= 0) {
                    natureza = pegaColuna(cols, idx.natureza) || "";
                }

                if (!BD.aproveitamentos_por_processo[num_processo]) {
                    BD.aproveitamentos_por_processo[num_processo] = {
                        cabecalho: {
                            num_processo,
                            nome_aluno,
                            matricula
                        },
                        linhas: []
                    };
                }

                BD.aproveitamentos_por_processo[num_processo].linhas.push({
                    origem,
                    destino,
                    natureza
                });
            }

            atualizarPreviewProcessos();

            const passo2 = document.getElementById("passo2");
            if (passo2) passo2.style.display = "block";

        } catch (e) {
            console.error("Erro ao processar CSV de aproveitamentos:", e);
            alert("Erro ao processar o CSV de aproveitamentos. Verifique o arquivo.");
        }
    };

    leitor.readAsText(arquivo, "UTF-8");
}

function pegaColuna(cols, idx) {
    if (idx === -1 || idx == null) return "";
    return cols[idx] ?? "";
}

// =============================================================================
// PRÉVIA: LISTA DE PROCESSOS E QUANTIDADE DE LINHAS POR FICHA
// =============================================================================

function atualizarPreviewProcessos() {
    const div = document.getElementById("previewAprov");
    const divTabela = document.getElementById("tabelaProcessosFicha");

    const chaves = Object.keys(BD.aproveitamentos_por_processo);

    if (!chaves.length) {
        if (div) div.innerHTML = "<p>Nenhum processo encontrado no CSV.</p>";
        if (divTabela) divTabela.innerHTML = "";
        return;
    }

    if (div) {
        div.innerHTML = `<p>Foram encontrados <b>${chaves.length}</b> processos no CSV.</p>`;
    }

    if (divTabela) {
        let html = `
            <table border="1" cellpadding="4" cellspacing="0">
              <thead>
                <tr>
                  <th>Processo</th>
                  <th>Nome do aluno</th>
                  <th>Matrícula</th>
                  <th>Qtde. de linhas de aproveitamento</th>
                </tr>
              </thead>
              <tbody>
        `;

        chaves.forEach(num => {
            const grupo = BD.aproveitamentos_por_processo[num];
            html += `
                <tr>
                    <td>${grupo.cabecalho.num_processo}</td>
                    <td>${grupo.cabecalho.nome_aluno}</td>
                    <td>${grupo.cabecalho.matricula}</td>
                    <td style="text-align:center;">${grupo.linhas.length}</td>
                </tr>
            `;
        });

        html += "</tbody></table>";
        divTabela.innerHTML = html;
    }
}

// =============================================================================
// PASSO 2 — GERAR ZIP COM TODAS AS FICHAS
// =============================================================================

async function gerarZIPComFichas() {
    const chaves = Object.keys(BD.aproveitamentos_por_processo);

    if (!chaves.length) {
        alert("Nenhum processo carregado. Importe o CSV de aproveitamentos primeiro.");
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("Biblioteca jsPDF não está carregada. Verifique o script em fichas.html.");
        return;
    }

    if (!window.JSZip) {
        alert("Biblioteca JSZip não está carregada. Verifique o script em fichas.html.");
        return;
    }

    const zip = new JSZip();

    for (const num of chaves) {
        const grupo = BD.aproveitamentos_por_processo[num];
        const { nomeArquivo, pdfBytes } = gerarFichaPDF(grupo);
        zip.file(nomeArquivo, pdfBytes);
    }

    const blobZip = await zip.generateAsync({ type: "blob" });
    downloadBlobZip(blobZip, "fichas_aproveitamento.zip");
    alert("ZIP gerado com todas as fichas. Verifique o arquivo baixado.");
}

function downloadBlobZip(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
}

// =============================================================================
// GERAÇÃO DA FICHA PDF (UM PROCESSO)
// =============================================================================

function gerarFichaPDF(grupo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margemEsq = 15;
    let y = 20;

    // ===========================
    // Cabeçalho institucional
    // ===========================
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text("UNIVERSIDADE FEDERAL DO RIO GRANDE DO NORTE", pageWidth / 2, y, { align: "center" }); y += 5;
    doc.setFont("Helvetica", "");
    doc.text("CENTRO DE CIÊNCIAS EXATAS E DA TERRA", pageWidth / 2, y, { align: "center" }); y += 5;
    doc.text("CURSO DE BACHARELADO EM ENGENHARIA DE SOFTWARE", pageWidth / 2, y, { align: "center" }); y += 8;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FICHA DE APROVEITAMENTO DE COMPONENTE CURRICULAR", pageWidth / 2, y, { align: "center" }); y += 12;

    // ===========================
    // Dados do processo / aluno
    // ===========================
    doc.setFontSize(11);
    doc.setFont("Helvetica", "");
    doc.text(`PROCESSO Nº: ${grupo.cabecalho.num_processo || ""}`, margemEsq, y); y += 7;
    doc.text(`NOME DO ALUNO: ${grupo.cabecalho.nome_aluno || ""}`, margemEsq, y); y += 7;
    doc.text("CURSO: ENGENHARIA DE SOFTWARE", margemEsq, y); y += 7;
    doc.text(`CADASTRO (MATRÍCULA): ${grupo.cabecalho.matricula || ""}`, margemEsq, y); y += 10;

    // ===========================
    // Linha "REF. À INST. ..." antes da tabela
    // ===========================
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.text("REF. À INST. DE ORIGEM", margemEsq, y);
    doc.text("REFERÊNCIAS RELATIVAS À UFRN", margemEsq + 80, y);
    y += 5;

    // ===========================
    // Monta dados para a tabela
    // ===========================
    const body = grupo.linhas.map(linha => {
        const origem  = linha.origem  || {};
        const destino = linha.destino || {};
        const instOrig = origem.inst_origem && origem.inst_origem.trim()
            ? origem.inst_origem
            : "UFRN";
        const natureza = linha.natureza || "";

        return [
            instOrig,
            origem.codigo || "",
            (origem.ch || "").toString(),
            destino.nome || "",
            destino.codigo || "",
            (destino.ch || "").toString(),
            natureza
        ];
    });

    // ===========================
    // Tabela com jsPDF-AutoTable
    // ===========================
    doc.setFont("Helvetica", "");
    doc.setFontSize(9);

    doc.autoTable({
        startY: y,
        head: [[
            "Inst. Origem",
            "Cod. Comp. Curr.",
            "CH",
            "Nome do comp. curricular a ser implantado no histórico",
            "Cod. Comp. Curr.",
            "CH",
            "Natureza"
        ]],
        body,
        styles: {
            font: "Helvetica",
            fontSize: 9,
            cellPadding: 1,
            valign: "middle"
        },
        headStyles: {
            fontStyle: "bold",
            halign: "center",
            fillColor: [0, 153, 102],  // verde aproximado
            textColor: 255
        },
        columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 28 },
            2: { cellWidth: 10, halign: "center" },
            3: { cellWidth: 70 },
            4: { cellWidth: 25 },
            5: { cellWidth: 10, halign: "center" },
            6: { cellWidth: 15, halign: "center" }
        },
        theme: "grid"
    });

    let yPos = doc.lastAutoTable.finalY + 8;

    // ===========================
    // OBSERVAÇÕES + NATUREZA + RODAPÉ
    // ===========================

    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold");
    doc.text("OBSERVAÇÕES:", margemEsq, yPos); 
    yPos += 5;

    doc.setFont("Helvetica", "");
    doc.setFontSize(8);
    // Obs. 1 (parafraseada para evitar cópia literal do modelo)
    doc.text(
        "1) Se o histórico da instituição de origem não mostrar códigos para os componentes, " +
        "a Coordenação deve adotar uma codificação interna e utilizá-la também nesta ficha.",
        margemEsq,
        yPos,
        { maxWidth: pageWidth - 2 * margemEsq }
    );
    yPos += 8;

    // Obs. 2 (parafraseada)
    doc.text(
        "2) O preenchimento incompleto ou incorreto desta ficha poderá implicar na devolução do processo " +
        "para ajustes.",
        margemEsq,
        yPos,
        { maxWidth: pageWidth - 2 * margemEsq }
    );
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont("Helvetica", "bold");
    doc.text("NATUREZA DA DISCIPLINA:", margemEsq, yPos); 
    yPos += 4;

    doc.setFont("Helvetica", "");
    doc.text("OB - Obrigatória   |   OP - Optativa   |   EL - Eletiva", margemEsq, yPos);
    yPos += 8;

    doc.setFontSize(8);
    doc.text("COORDENAÇÃO DO CURSO DE ENGENHARIA DE SOFTWARE", margemEsq, yPos); yPos += 4;
    doc.text("CCET - CENTRO DE CIÊNCIAS EXATAS E DA TERRA", margemEsq, yPos); yPos += 4;
    doc.text("UFRN - UNIVERSIDADE FEDERAL DO RIO GRANDE DO NORTE", margemEsq, yPos); yPos += 4;
    doc.text("Campus Universitário - Lagoa Nova - Natal/RN", margemEsq, yPos); yPos += 4;
    doc.text("Fone: (84) 3215-3814   |   E-mail: bes@dimap.ufrn.br", margemEsq, yPos);

    // ===========================
    // Nome do arquivo + retorno para ZIP
    // ===========================
    const nomeAlunoSan = (grupo.cabecalho.nome_aluno || "")
        .replace(/[\\\/:*?"<>|]/g, "_")
        .trim();

    const numProcSan = (grupo.cabecalho.num_processo || "")
        .replace(/[\\\/:*?"<>|]/g, "_")
        .trim();

    const nomeArquivo = `Ficha de Aprov - ${nomeAlunoSan} - ${numProcSan}.pdf`;
    const pdfBytes = doc.output("arraybuffer");

    return { nomeArquivo, pdfBytes };
}



async function gerarZIPComDocxs() {
    const chaves = Object.keys(BD.aproveitamentos_por_processo);

    if (!chaves.length) {
        alert("Nenhum processo carregado. Importe o CSV de aproveitamentos primeiro.");
        return;
    }

    if (!window.JSZip) {
        alert("Biblioteca JSZip não está carregada. Verifique o script em fichas.html.");
        return;
    }

    if (!window.docx || !window.docx.Document) {
        alert("Biblioteca docx não está carregada. Verifique o script em fichas.html.");
        return;
    }

    const zip = new JSZip();

    for (const num of chaves) {
        const grupo = BD.aproveitamentos_por_processo[num];
        const { nomeArquivo, blob } = await gerarFichaDOCX(grupo);
        zip.file(nomeArquivo, blob);
    }

    const blobZip = await zip.generateAsync({ type: "blob" });
    downloadBlobZip(blobZip, "fichas_aproveitamento_docx.zip");
}



async function gerarFichaDOCX(grupo) {
    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        AlignmentType,
        BorderStyle
    } = window.docx;

    // Cabeçalho da ficha
    const headerParagraphs = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: "UNIVERSIDADE FEDERAL DO RIO GRANDE DO NORTE",
                    bold: true
                })
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun("CENTRO DE CIÊNCIAS EXATAS E DA TERRA")
            ]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun("CURSO DE BACHARELADO EM ENGENHARIA DE SOFTWARE")
            ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: "FICHA DE APROVEITAMENTO DE COMPONENTE CURRICULAR",
                    bold: true
                })
            ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `PROCESSO Nº: ${grupo.cabecalho.num_processo || ""}`,
                    bold: false
                })
            ]
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `NOME DO ALUNO: ${grupo.cabecalho.nome_aluno || ""}`,
                    bold: false
                })
            ]
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: "CURSO: ENGENHARIA DE SOFTWARE",
                    bold: false
                })
            ]
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `CADASTRO (MATRÍCULA): ${grupo.cabecalho.matricula || ""}`,
                    bold: false
                })
            ]
        }),
        new Paragraph({ text: "" })
    ];

    // Título das duas seções antes da tabela
    const sectionTitles = [
        new Paragraph({
            children: [
                new TextRun({
                    text: "REF. À INST. DE ORIGEM / REFERÊNCIAS RELATIVAS À UFRN",
                    bold: true
                })
            ]
        }),
        new Paragraph({ text: "" })
    ];

    // Cabeçalho da tabela
    const headerRow = new TableRow({
        children: [
            new TableCell({
                width: { size: 22, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "Inst. Origem", bold: true }) ]
            }),
            new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "Cod. Comp. Curr.", bold: true }) ]
            }),
            new TableCell({
                width: { size: 5, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "CH", bold: true }) ]
            }),
            new TableCell({
                width: { size: 28, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "Nome do comp. curricular a ser implantado no histórico", bold: true }) ]
            }),
            new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "Cod. Comp. Curr.", bold: true }) ]
            }),
            new TableCell({
                width: { size: 5, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "CH", bold: true }) ]
            }),
            new TableCell({
                width: { size: 10, type: WidthType.PERCENTAGE },
                children: [ new Paragraph({ text: "Natureza", bold: true }) ]
            })
        ]
    });

    // Linhas de dados
    const dataRows = grupo.linhas.map(linha => {
        const origem  = linha.origem  || {};
        const destino = linha.destino || {};
        const instOrig = origem.inst_origem && origem.inst_origem.trim()
            ? origem.inst_origem
            : "UFRN";
        const natureza = linha.natureza || "";

        return new TableRow({
            children: [
                new TableCell({
                    children: [ new Paragraph(instOrig) ]
                }),
                new TableCell({
                    children: [ new Paragraph(origem.codigo || "") ]
                }),
                new TableCell({
                    children: [ new Paragraph((origem.ch || "").toString()) ]
                }),
                new TableCell({
                    children: [ new Paragraph(destino.nome || "") ]
                }),
                new TableCell({
                    children: [ new Paragraph(destino.codigo || "") ]
                }),
                new TableCell({
                    children: [ new Paragraph((destino.ch || "").toString()) ]
                }),
                new TableCell({
                    children: [ new Paragraph(natureza) ]
                })
            ]
        });
    });

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        }
    });

    // Observações e rodapé (texto simplificado, adaptado ao template)
    const obsRodape = [
        new Paragraph({ text: "" }),
        new Paragraph({
            children: [ new TextRun({ text: "OBSERVAÇÕES:", bold: true }) ]
        }),
        new Paragraph({
            children: [ new TextRun(
                "1) Se o histórico da instituição de origem não mostrar códigos para os componentes, " +
                "a Coordenação deve adotar uma codificação interna e utilizá-la também nesta ficha."
            ) ]
        }),
        new Paragraph({
            children: [ new TextRun(
                "2) O preenchimento incompleto ou incorreto desta ficha poderá implicar na devolução " +
                "do processo para ajustes."
            ) ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
            children: [ new TextRun({ text: "NATUREZA DA DISCIPLINA:", bold: true }) ]
        }),
        new Paragraph({
            children: [ new TextRun("OB - Obrigatória   |   OP - Optativa   |   EL - Eletiva") ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
            children: [ new TextRun("COORDENAÇÃO DO CURSO DE ENGENHARIA DE SOFTWARE") ]
        }),
        new Paragraph({
            children: [ new TextRun("CCET - CENTRO DE CIÊNCIAS EXATAS E DA TERRA") ]
        }),
        new Paragraph({
            children: [ new TextRun("UFRN - UNIVERSIDADE FEDERAL DO RIO GRANDE DO NORTE") ]
        })
    ];

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: [
                    ...headerParagraphs,
                    ...sectionTitles,
                    table,
                    ...obsRodape
                ]
            }
        ]
    });

    const blob = await Packer.toBlob(doc);

    const nomeAlunoSan = (grupo.cabecalho.nome_aluno || "")
        .replace(/[\\\/:*?"<>|]/g, "_")
        .trim();

    const numProcSan = (grupo.cabecalho.num_processo || "")
        .replace(/[\\\/:*?"<>|]/g, "_")
        .trim();

    const nomeArquivo = `Ficha de Aprov - ${nomeAlunoSan} - ${numProcSan}.docx`;

    return { nomeArquivo, blob };
}
