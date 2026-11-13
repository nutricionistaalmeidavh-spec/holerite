# Modelo impresso de contracheque

O gerador em electron/receipt.ts produz A4 preto e branco, no estilo tradicional de contracheque, com identificação da empresa e funcionário, tabelas paralelas de **Proventos** e **Descontos**, totais, líquido, bases fiscais e assinatura.

Cada holerite mantém **duas vias idênticas do mesmo empregado** (empregador e colaborador). Este ajuste é visual; não mistura funcionários nem altera os motores de cálculo ou o histórico. Para até dez linhas na maior coluna, cabem duas vias em um A4. Com mais lançamentos, as vias são expandidas para páginas separadas, evitando truncamentos.

A coluna **Referência** exibe traço quando a estrutura atual da rubrica não possui valor de referência/percentual: não são inventadas horas ou taxas.

O workflow QA print - A4 holerite PDF gera PDFs com a API nativa do Electron e converte a primeira página para PNG com Poppler. Usa dados **fictícios**, sem dependências pagas.

O botão Gerar PDF e o de Imprimir seguem a mesma função receiptHTML e utilizam os dados congelados de cada holerite finalizado.
