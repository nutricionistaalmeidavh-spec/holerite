# QA visual — Holerites

O workflow [QA visual - Electron e screenshots](../.github/workflows/qa-visual.yml) roda em push para branches qa/**, PR para main e disparo manual (workflow_dispatch). Ele usa somente GitHub Actions, Node 24, Electron, Playwright Core e Xvfb: sem SaaS de testes, chave, conta ou assinatura de terceiros.

## Executar

No Actions do GitHub, abra "QA visual - Electron e screenshots", selecione "Run workflow" ou abra um PR para main. Ao concluir, baixe o artefato "ArtiSys-Holerites-QA-Screenshots" na página da execução. Ele contém 29 PNGs, README.md e report.json, ou falha.png quando aplicável.

Para rodar localmente no Linux com interface virtual:

~~~bash
npm install
npm run build
xvfb-run -a -s '-screen 0 1600x1000x24' npm run qa:screenshots
~~~

A automação inicia Vite Preview e o aplicativo Electron real, cria um perfil temporário e cadastra empresa e colaborador fictícios. Nenhum banco, documento, CPF ou empresa reais são usados. Registra primeiro acesso, cinco áreas da navegação, modais de cadastro/edição, cinco tipos de documentos, rubricas recorrentes, rascunho, finalização, pagamento, histórico filtrado e as telas em viewport compacto (1024 x 768).

O relatório falha se a interface apresentar erro, um screenshot for ilegível/vazio, os comandos de interação não concluírem ou houver exceção JavaScript. Os PNGs são anexados também quando ocorrer erro, para diagnóstico. Não altera código ou dados do aplicativo em produção, não gera instalador nem publica release.

**Limite:** este QA usa uma máquina Linux virtual e cobre a interface Electron e seus fluxos principais; não substitui a homologação de impressão nativa, instalador e atualização automática no Windows.
