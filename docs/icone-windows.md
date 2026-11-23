# Ícone Windows — ArtiSys Ponto e Folha

Ícone próprio do executável, atalhos criados pelo NSIS, instalador e desinstalador. Visual Atlas Executive: fundo azul-petróleo, monograma A e relógio em verde-água.

## Fontes editáveis

- `build/icon-source.svg`: ícone detalhado (32–256 px e PNG 512 px).
- `build/icon-small.svg`: forma simplificada para barra de tarefas e atalhos pequenos (16/24 px).

A cada `npm run build` o script `scripts/generate-icon.mjs` converte o SVG localmente, gerando `build/icon.ico` multirresolução (16, 24, 32, 48, 64, 128, 256) e `build/icon.png`. Os binários são derivados e não são versionados.

O único pacote novo é `sharp`, dependência **de desenvolvimento open source**, sem instalação no PC do cliente; nenhuma API, login ou serviço de terceiros foi adicionado.

O `package.json` utiliza `build.win.icon`, `build.nsis.installerIcon` e `build.nsis.uninstallerIcon`. O `appId` e o `productName` foram mantidos para não alterar o caminho de instalação/identidade da atualização automática.

## QA

```bash
npm install
npm test
npm run build
npm run dist:win
```

O teste `electron/brand-icon.test.ts` verifica estrutura do ICO e todas as resoluções. No instalador, conferir o ícone embutido em `ArtiSys Holerites.exe`, atalho da área de trabalho e painel de desinstalação. A imagem é integrada ao NSIS; instalar ou atualizar a nova versão deve atualizar o ícone do executável.

Se o Windows ainda mostrar a miniatura antiga por cache, reinicie o Windows Explorer ou recrie o atalho **após** a atualização; não altere o banco de dados nem a pasta de usuário.
