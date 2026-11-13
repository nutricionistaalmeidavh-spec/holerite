# ArtiSys Holerites

Aplicativo **desktop offline para Windows** para cadastrar empresas e colaboradores, preparar a folha, calcular INSS/IRRF nas competências suportadas e emitir holerites em PDF (duas vias). Sem SaaS, APIs pagas ou serviços externos.

## Stack

- Electron 45, React 19, TypeScript e Vite
- **SQLite nativo do Node 24** (`node:sqlite`, incluído no Electron). Nenhum addon SQLite de terceiros para recompilar.
- Impressão e PDF A4 usando a API nativa do Electron
- Código MIT (dependências de código aberto)

## Funcionalidades (v0.1.0)

- Cadastro de múltiplas empresas, colaboradores, salários, cargos, CPF, CNPJ e dependentes.
- Cinco tipos de documento por colaborador/competência: **salário mensal, férias, 13º (1ª e 2ª parcelas) e rescisão**.
- Folha mensal por competência e funcionário; salário-base ajustável na competência sem modificar o cadastro.
- Férias: dias gozados, abono pecuniário, terço constitucional e prazo de pagamento indicativo.
- 13º: avos, adiantamento e separação das incidências entre parcelas.
- Rescisão: motivo, aviso proporcional, saldo salarial, férias vencidas/proporcionais, 13º proporcional e estimativa de multa FGTS (fora do líquido).
- Interface **ArtiSys Atlas — Folha Premium**, com seletor por tipo, visão geral, resumo financeiro ao lado do formulário e histórico filtrável.
- Vencimentos e descontos adicionais, com incidências configuráveis de INSS, IRRF e FGTS.
- Cálculo automático de INSS progressivo e IRRF incluindo redutor mensal **apenas para competências de 2026**.
- Modo manual para períodos históricos/sem tabela automática — **não calcula tributos**.
- FGTS patronal de 8% apresentado apenas como valor informativo, nunca como desconto.
- Rascunho editável; finalização bloqueia alterações; registro de pagamento separado.
- Dados e cálculos congelados no recibo finalizado (alterar cadastro não altera holerites antigos).
- PDF A4 em duas vias com assinatura física; impressão por dispositivo local.
- Histórico, relatório CSV e backup consistente do SQLite com escolha do local.
- Sem login obrigatório, internet, telemetria ou assinaturas.

## Desenvolvimento

Requer **Node.js 24+** (use Node 24 no GitHub Actions).

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Para criar o instalador do Windows (preferencialmente no Windows):

```bash
npm run dist:win
```

O resultado fica em `release/ArtiSys-Holerites-Setup-0.1.0.exe`. O arquivo ficará **sem assinatura de código**: o Windows SmartScreen poderá avisar. Nenhum instalador é publicado automaticamente. O workflow **Quality and Windows setup** também permite gerar um artefato manual via `workflow_dispatch`, sem criar uma release automaticamente.

## Dados

- Banco no diretório `app.getPath('userData')/holerites.sqlite`.
- SQLite usa WAL para integridade, chaves estrangeiras e unicidade por colaborador + competência + tipo. A migração do banco anterior preserva holerites existentes.
- Use **Fazer backup** para gerar uma cópia consistente (.sqlite) em local escolhido.
- Os registros não são criptografados em repouso e não há autenticação nesta versão; execute somente em máquinas e contas Windows de acesso controlado. Não compartilhe pastas de dados ou cópias de backup sem proteção apropriada.
- O projeto não tem sincronização multiusuário em rede; para isso, seria necessária arquitetura cliente-servidor com controle transacional.

## Escopo fiscal e limitações

**Atenção:** esta é uma ferramenta de emissão/controle; não substitui a escrituração oficial, o fechamento de folha com um contador nem o envio de eventos ao eSocial.

- Os motores de folha mensal, férias, 13º e rescisão cobrem **cenários-padrão CLT com tabelas de 2026**, mas não substituem apuração contábil completa. Não contemplam integralmente pensão, médias de remuneração variável, acordos e convenções coletivas, múltiplos vínculos, afastamentos, estabilidade, multas legais e todas as verbas particulares. Na rescisão, o sistema emite **demonstrativo**, não TRCT oficial completo.
- A aplicação das incidências sobre cada verba depende da classificação realizada pelo operador e deve ser revisada pelo responsável.
- O INSS considera o teto de R$ 8.475,55 e as faixas progressivas de 2026. IRRF considera desconto simplificado (R$ 607,20) ou deduções legais (INSS e R$ 189,59/dependente), selecionando o maior; redutor de 2026 aplicado sobre os rendimentos tributáveis.
- Modo **manual** não valida recolhimentos; se o usuário quiser informar INSS/IRRF manualmente, deve lançar os descontos e conferir os totais.
- FGTS exibido em alíquota-base de 8% apenas para informação; situações especiais exigem revisão.
- Emissão não equivale a assinatura digital; campo de assinatura é para recebimento manuscrito.
- Os valores são calculados por motores puros em `src/shared/payroll.ts` e `src/shared/special.ts`, compartilhados entre a prévia e o salvamento (revalidação obrigatória no processo principal). O PDF usa somente o snapshot canônico salvo.

Fontes oficiais (atualizadas para a competência 2026):
- [INSS — Tabela de contribuição mensal](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
- [Receita Federal — Tributação 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)
- [Exemplos oficiais de aplicação do redutor de IR](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025)

## Design da interface

A identidade ArtiSys Atlas utiliza cores institucionais e tokens CSS locais em `src/atlas.css`, sem CDN, fontes remotas ou assinatura. A impressão A4 conserva duas vias e adota a mesma identidade de cores. Detalhes: [Atlas — especificação visual](docs/atlas-design.md) e [Pesquisa open source de UI](docs/open-source-e-ux.md).

## Qualidade, contribuição e segurança

`npm test` cobre cálculos com centavos, faixa progressiva, abatimento de IR, 13º, férias, rescisão, migração SQLite, recibos imutáveis, exclusividade de parcelas por ano, acessibilidade básica do seletor Atlas e contraste semântico das cores. No CI, testes e build rodam antes de integração em `main`. Código de UI roda com `sandbox`, `contextIsolation` e `nodeIntegration: false`; operações de disco e banco existem apenas no processo principal via canais IPC específicos. Não há canal genérico de SQL nem acesso indiscriminado ao sistema de arquivos.

Fluxo de contribuição: branch → PR → QA → merge apenas após revisão/autorização.
