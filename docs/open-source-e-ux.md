# ArtiSys Holerites — pesquisa open source e roadmap de UX

Pesquisa em 13/11/2026. Requisito fixo: **R$ 0 obrigatório, software open source e desktop offline/self-hosted**. Integrações pagas nunca fazem parte do fluxo principal.

## Propostas priorizadas

| Prioridade | Projeto (licença) | Aplicação concreta | Decisão |
|---|---|---|---|
| P0 | [shadcn/ui](https://github.com/shadcn-ui/ui) (MIT) | Formulários, menus, modal com foco, botões, alertas, acessibilidade; componentes editáveis no próprio repositório | **Recomendado** em evolução gradual, preservando o CSS atual |
| P0 | [React Hook Form](https://github.com/react-hook-form/react-hook-form) (MIT) | Validação em tempo real e controle de campos complexos de férias, 13º e rescisão | Recomendado; eliminar formulários não salvos sem feedback |
| P0 | [Zod](https://github.com/colinhacks/zod) (MIT) | Validação do lado do formulário e IPC; esquemas compartilhados com o domínio | Recomendado, sem substituir validações obrigatórias do backend |
| P1 | [TanStack Table](https://github.com/TanStack/table) (MIT) | Colunas, ordenação, filtros por competência/tipo/status, paginação e seleção para emissão em lote | Recomendado quando histórico crescer |
| P1 | [Mantine](https://github.com/mantinedev/mantine) (MIT) | Alternativa rápida a shadcn/ui: calendário, inputs, dialogs, notificações, tema | **Alternativa**, não instalar junto com shadcn sem decisão de design system |
| P1 | [Apache ECharts](https://github.com/apache/echarts) (Apache-2.0) | Custos de folha por competência, obrigações e comparações anuais | Somente após garantir consistência dos dados de cálculo |
| P1 | [pdfme](https://github.com/pdfme/pdfme) (MIT) | Designer visual WYSIWYG para personalizar modelos de holerite e PDF, sem backend externo | **Grande potencial**; não trocar o gerador atual antes de validar impressão e duas vias |
| P1 | [Lucide](https://github.com/lucide-icons/lucide) (ISC/MIT) | Ícones profissionais, consistentes e leves para menus, estados e ações | Recomendado gradualmente |
| P1 | [ExcelJS](https://github.com/exceljs/exceljs) (MIT) | Exportação de resumo da folha em XLSX com totais e fórmulas inspecionáveis | Opcional; CSV já funciona com R$ 0 |
| P1 | [Playwright](https://github.com/microsoft/playwright) (Apache-2.0) | QA automatizado de cadastro, cálculo, exportação, navegação e capturas de tela | Recomendado em CI; sem serviço externo |
| P2 | [Frappe HRMS](https://github.com/frappe/hrms) (GPL-3.0) | Referência arquitetural para políticas de férias, estrutura de salários e recibos | **Estudar, não copiar código**: licença copyleft e regras locais não equivalem à CLT brasileira |

## Melhorias de UX recomendadas

1. **Assistente em etapas**: selecionar tipo e competência → colaborador → parâmetros específicos → verbas e impostos → conferência final → gerar PDF.
2. **Destaque da base de cada tributo**: exibir valor de origem, incidência e alíquota por rubrica; mostrar exceções com textos objetivos.
3. **Cabeçalho contextual**: férias, 13º e rescisão não devem parecer "holerite mensal" convencional.
4. **Histórico multivisualização**: tabela com filtros por tipo, empresa, competência e status; drill-down até as rubricas salvas.
5. **Validação preventiva**: aviso se férias começarem perto de feriado/DSR, se 13º adiantado exceder total ou se faltarem dados de FGTS.
6. **Confirmação contábil**: antes de finalizar uma rescisão, exigir que o responsável confirme os campos informativos e eventuais ajustes de CCT.
7. **Autonomia offline**: manter SQLite e a geração de PDF via Chromium; não depender de backend pago, login externo, internet ou SaaS.

## Regras do domínio: implementadas x limites

**Férias**: dias gozados, até 10 dias de abono pecuniário sujeito ao limite de 1/3, terço constitucional, datas e prazo de pagamento estimado até 2 dias antes. Não automatiza 100% das férias coletivas/fracionadas, DSR/feriados, cálculos retroativos ou conciliação INSS entre recibo de férias e folha.

**13º salário**: primeira parcela proporcional, segunda parcela com abatimento de antecipação, INSS/IRRF separados da folha mensal, aplicação da redução de IRRF de 2026 e FGTS complementar informativo. Exige conferência de avos, médias de adicionais e antecipações em outros recibos.

**Rescisão**: situações sem justa causa, justa causa, pedido de demissão e acordo do art. 484-A; saldo salarial, aviso proporcional quando indenizado, férias adquiridas e proporcionais, terço, 13º proporcional, estimativa de multa 40%/20% sobre base de FGTS **informada**. Sem suporte completo a todas as hipóteses, multas de atraso ou TRCT/eSocial oficiais.

**Fonte da verdade**: cálculo puro em `src/shared/payroll.ts` e `src/shared/special.ts`; SQLite salva detalhes completos. O PDF lê o snapshot do registro e não refaz imposto.

## Fontes legais primárias

- [INSS — tabelas 2026](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
- [Receita — IRRF 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)
- [Receita — redução de IR no 13º](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-orienta-fontes-pagadoras-e-contribuintes-a-calcular-a-reducao-do-imposto-de-renda-a-partir-de-1o-de-janeiro-de-2026)
- [MTE — dúvidas frequentes de férias e rescisão](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/acoes-e-programas/programas-projetos-acoes-obras-e-atividades/proteja/duvidas-frequentes)
- [CLT art. 484-A — rescisão por acordo](https://legis.senado.gov.br/norma/530547/publicacao/37353698)

Nota: consulta aos repositórios e documentação não significa adoção automática de dependência. Antes de integrar, verificar licença e travar versão, executar testes e revisar segurança.
