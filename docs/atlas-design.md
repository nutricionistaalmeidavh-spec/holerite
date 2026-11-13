# Atlas — tema da interface ArtiSys Holerites

Implementação: 13/11/2026. Tema aplicado à interface do Electron, preservando o motor de cálculo, IPC e SQLite.

## Tokens

| Papel | Cor |
|---|---|
| Fundo | `#F5F7FA` |
| Superfície | `#FFFFFF` |
| Superfície suave | `#EEF2F7` |
| Texto principal | `#17273D` |
| Texto secundário | `#526278` |
| Primária | `#264E78` |
| Destaque e sucesso | `#16776D` |
| Borda | `#CDD7E3` |

Tokens em `src/atlas.css` via propriedades CSS `--atlas-*`. Fontes do sistema, sem downloads. Tipografia com números tabulares para conferir valores.

## Telas atualizadas

- Visão geral: painel de abertura com CTA de emissão, resumo da competência, indicadores e ações específicas por tipo de documento.
- Folha: seleção visível dos cinco tipos, lista de colaboradores e um painel de conferência financeiro lateral no desktop (empilhado em telas menores).
- Histórico: filtro por tipo de documento, busca textual e acesso aos PDFs e à impressão.
- Cadastros, estados, alertas e foco: componentes existentes com tratamento visual uniforme.

## Acessibilidade e preservação

- Controles nativos, `aria-pressed` na seleção, seleção operável por teclado e `aria-current` no menu.
- Contraste dos pares semânticos ensaiado por teste automatizado WCAG AA de cores; **não equivale a auditoria WCAG completa**.
- Modo de movimento reduzido respeitado.
- Nenhuma dependência de API, fonte remota, assinatura ou serviço pago.
- Sem alteração de cálculos, documentação oficial em PDF ou formato do banco.
- Mudanças visuais são reversíveis: remover a importação `./atlas.css` permite retornar ao CSS anterior.

## QA

`npm test`, `npm run build`, `npm run dist:win` via CI. A aprovação de UI no navegador e impressão real deve ser validada antes de distribuição.
