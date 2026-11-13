# Histórico de versões

## 0.2.0 — 13/11/2026

- Cadastro ampliado de funcionários: matrícula, PIS/NIS, jornada, banco, agência, conta e chave Pix.
- Rubricas recorrentes de vencimentos e descontos com incidências configuráveis para geração de holerite mensal.
- Geração mensal em lote, idempotente e transacional, somente para funcionários ativos sem folha existente.
- Migração incremental do SQLite, sem reprocessar holerites finalizados.
- Sem mudanças na identidade Electron (`dev.artisys.holerites`), no local de armazenamento, no canal de atualização, nem em secrets.

## 0.1.0 — base do aplicativo

- Desktop Electron com React, SQLite, emissão mensal, férias, décimo terceiro e rescisão, recibos em PDF e atualização optativa via GitHub Releases.
