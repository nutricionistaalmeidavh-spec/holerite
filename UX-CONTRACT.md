# Contrato de UX — Ponto e Folha

O ponto é a funcionalidade central. Este contrato descreve comportamento observável; não altera regras de folha, legislação ou persistência.

## Fluxo canônico

1. **Empresa e funcionários**: cadastrar ou selecionar empresa e equipe, sem perder dados históricos.
2. **Jornada**: definir horários por empresa/funcionário, inclusive ciclos e demais configurações existentes.
3. **Preenchimento**: edição individual ou matriz, colagem da planilha, modelo XLSX, importação CSV/XLSX e geração sugerida.
4. **Conferência**: avisos ajudam a revisar sem obrigar fechamento ou bloquear integração com holerite.
5. **Impressão e assinatura**: imprimir individualmente/em lote para assinatura física. Não mostrar status fictício de assinatura coletada.
6. **Holerite**: integração mensal após ou antes do fechamento do ponto; férias, duas parcelas de 13º e rescisão permanecem acessíveis. Históricos finalizados/pagos não podem ser modificados.

## Estados de ponto na interface

- `manual`: **Manual** — marcação informada pelo operador, não implica prova de batida eletrônica.
- `imported`: **Importada** — veio de planilha, sem atribuição de origem eletrônica.
- `suggested`: **Gerada**, badge **Sugestão** — fora da apuração até confirmação.
- `reviewed`: **Gerada · conferida**, badge **Conferida** — conferência administrativa, não substitui batida real.
- Dias com inconsistência têm badge **Aviso** com maior prioridade visual; as ações continuam disponíveis.
- **Fechada** descreve o status da ficha, distinto de `reviewed` e de impressão/assinatura.

## Ações e feedback

| Área | Ação | Confirmação / resultado | Falha |
|---|---|---|---|
| Matriz | Salvar N dias | Persistência por lote + notificação de sucesso | Mensagem de erro; rascunho permanece |
| Matriz | Conferir equipe em lote | Confirma sugestões, sem travar a emissão | Erro exibido; não apresentar sucesso |
| Ponto | Gerar calendário | Diálogo com `Gerar sem incluir`, `Gerar e incluir na apuração` e `Cancelar` | Sem inclusão silenciosa |
| Matriz | PDF / imprimir | Inclui todos quando ninguém está selecionado | Erro exibido; não alegar impressão |
| Importação | Selecionar arquivo → mapear → prévia → importar | Mapeamento revisável, substituição explícita | Validação com mensagens, sem perda de arquivos existentes |
| Holerite | Salvar, finalizar, marcar pago, PDF / impressão | Atualizar estados e preservar histórico | Erro visível; não duplicar rubricas |

## Invariantes

- Não introduzir login, SaaS, fontes externas, dependência paga ou coleta de dados.
- Não esconder controles existentes em nome de simplificação visual.
- Não exibir números fictícios nos indicadores reais, especialmente impressão, assinatura ou fichas "conferidas" quando apenas fechadas.
- Estados são textuais além de cor. Teclado deve alcançar todos os controles.
- Modais não podem ser usados para impedir a apuração, salvo regra canônica de edição de fichas fechadas.
- Código visual é escopo: `src/atlas.css`, `src/executive.css` e marcação React. Dados originais, regras fiscais e documentos preservados.

## Conceitos ainda não disponíveis

A prancheta Penpot apresenta números **demonstrativos** (24 empregados, 18 fichas conferidas, 12 impressões, 248 registros etc.). Esses números **não** viram conteúdo real da aplicação. O produto atualmente não acompanha digitalmente o recolhimento das assinaturas ou a contagem de fichas físicas impressas por competência. Esse rastreamento requer definição funcional separada, dados canônicos e teste.

O modo escuro `Control Room`, a estética `Ledger Atelier` e animações de bibliotecas externas são alternativas de design, não capacidades embarcadas nesta versão.
