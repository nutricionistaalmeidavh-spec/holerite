# ArtiSys Ponto e Folha — Atlas Executive

Referência visual aprovada: conceitos premium criados no Penpot em 22/11/2026.
Arquivo: https://design.penpot.app/?screen=workspace&team-id=41725af0-a889-809a-8008-d84126116e07&file-id=42288968-6e5e-808d-8008-fcb06fb746ab&page-id=42288968-6e5e-808d-8008-fcb06fb746ac

## Identidade visual

Aplicativo desktop de operações de ponto e folha. A sensação deve ser de software empresarial confiável, preciso e calmo, com alta legibilidade em jornadas longas. O ponto é o centro da experiência; holerite, férias, 13º e rescisão permanecem acessíveis.

O **Atlas Executive** é a direção principal. As pranchetas Ledger Atelier e Control Room são conceitos alternativos; **não** são modos operacionais nem recursos implementados.

### Cores semânticas

Fonte canônica: `src/atlas.css`, variáveis `--atlas-*`; `src/executive.css` consome esses tokens, acrescentando somente cores semânticas específicas de alertas e movimento.

| Papel | Valor |
|---|---|
| Canvas | `#F5F7F9` |
| Superfície | `#FFFFFF` |
| Superfície alternativa | `#ECF1F4` |
| Texto principal | `#16283A` |
| Texto secundário | `#52677B` |
| Ação principal | `#1E4B65` |
| Acento/seleção | `#117A70` |
| Borda | `#D4DFE5` |
| Navegação | `#192E40` |

Tipografia: Segoe UI Variable / Segoe UI / system-ui (arquivos locais), pesos 400–750; números tabulares para horários e valores. Radius: 7–12px para campos e cards; botões 40px. Nada de neon, saturação excessiva, efeitos sem utilidade, dependências remotas ou paywall.

### Linguagem por área

- **Visão geral:** KPI de dados reais e tarefas existentes; sem indicadores fabricados.
- **Controle de ponto:** matriz densa, cabeçalho legível, estados com texto, ações em grupos e avisos que não bloqueiam.
- **Importação:** botões de modelo, seleção, mapeamento, prévia e confirmação preservados.
- **Conferência:** diálogo explica exatamente a inclusão opcional das sugestões na apuração.
- **Holerite:** cinco tipos e painel de cálculo com destaque ao líquido; nenhuma alteração de fórmulas.
- **Histórico, cadastros e configurações:** mesmos componentes base e tratamento de foco.
- **Responsividade:** largura inicial 320px, tabela rola horizontalmente, sidebar compacta permanece navegável.

### Movimento e acessibilidade

Animações CSS locais somente quando úteis: diálogo 180ms, feedback 160ms, hover 120ms. `prefers-reduced-motion: reduce` desativa os movimentos. Foco visível, labels, estados textuais e contraste legível são obrigatórios. Movimento não é dependência do core.

### Processo de mudança

Preservar funcionalidades e nomes de ações testados por `scripts/qa-screenshots.mjs`; refatorar componentes compartilhados antes de duplicar CSS de tela. Não alterar IPC, banco, cálculos ou PDFs numa mudança apenas visual. QA: `npm test`, `npm run build` e capturas do Electron.
