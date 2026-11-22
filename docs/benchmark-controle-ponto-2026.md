# Ampliação do Controle de Ponto — benchmark P0/P1/P2

Implementação em branch, sem alteração de serviços externos. Tudo roda localmente com Electron, React, Node e SQLite, sem cobrança obrigatória ou login em nuvem.

## P0 — rotina de fichas
- PDF único e impressão direta de toda a equipe ou funcionários selecionados. Cada ficha ocupa uma página A4 com origem das marcações e assinaturas em papel.
- Importação CSV/XLSX ampliada para até **30.000 linhas e 30 MB** por arquivo. Prévia e confirmação permanecem; hashes impedem reprocessar o mesmo arquivo.
- Mapeamento de colunas persistido por empresa e sequência exata de cabeçalhos, reutilizado nas importações seguintes.
- Alertas de horários sugeridos não conferidos, dias incompletos, faltas sem observação, jornadas longas e dias previstos sem lançamento. Alertas **não** impedem revisão em lote, fechamento opcional, impressão nem integração à folha.
- Feriados nacionais federais fixos são reconhecidos offline; feriados estaduais/municipais podem ser incluídos pela empresa em Configurações com datas explícitas. Não se presume a existência de feriados locais que não foram cadastrados.

## P1 — regras e gestão de jornadas
- Ciclos de dias trabalhados e folga por funcionário/empresa, com data-âncora: 1x1 (12x36 com horários de 12h definidos), 6x1, 5x1 e outras combinações.
- Percentuais de hora extra distintos em domingos e feriados; cada competência usa a configuração atual ou o snapshot de ficha fechada.
- Redução opcional de hora noturna a 52m30s e DSR **estimado** sobre extras, ambos desligados em instalações antigas. Exigem conferência pela contabilidade/DP antes de integrar holerites.
- Anexos de atestados em PDF, PNG, JPEG e WebP de até 10 MB, armazenados como BLOB no mesmo SQLite do backup, com vinculação à data, funcionário e auditoria; nenhum upload.
- Relatórios por funcionário com horas trabalhadas, extras, noturnas, atrasos, faltas, situação e exportação CSV, com filtros por setor/obra/centro de custo.
- Setor, obra/local e centro de custo são campos persistentes no cadastro do funcionário, sem afetar holerites antigos.

## P2 — acesso local
- Perfis *administrador*, *RH* e *consulta*, com nomes únicos e PIN de 6 a 16 dígitos, hash scrypt com salt aleatório.
- Ativação explicitamente opcional na interface; sem ativar, instalações legadas permanecem acessíveis.
- Após ativar, autenticação obrigatória na abertura. Verificação de permissão no processo principal do Electron, e não apenas ocultação de botões.
- Histórico de ponto identifica o operador autenticado; registros antigos são marcados como legados quando não há operador conhecido.
- Bloqueio temporário depois de tentativas falhas; nenhum e-mail ou serviço externo necessário. Guarde o PIN do administrador, pois não há recuperação remota.

## Salvaguardas e pendências de domínio
- Horários gerados continuam identificados como **sugestões**, e não são batidas reais ou documento REP.
- A confirmação de inclusão da geração na apuração continua opcional por diálogo; conferência em lote não foi transformada em trava.
- **Não há homologação de REP-C/REP-A/REP-P** e não são emitidos AFD/AEJ oficiais.
- Feriados estaduais/municipais são cadastrados manualmente, sem base nacional geográfica completa embutida.
- A parametrização atual não implementa o universo de CCT/ACT, reflexos de adicionais em todas as demais verbas, nem valida todas as peculiaridades da legislação trabalhista. DSR e adicionais precisam de revisão profissional.
- A classificação de centro de custo está no cadastro e relatórios, não há rateio automático de pagamento entre múltiplas obras no mesmo dia.
- Os PINs controlam o acesso pelo aplicativo; **o arquivo SQLite local não é criptografado**. Proteja backups e permissões do computador.

## Verificação
- Scripts existentes: `npm test`, `npm run build`, `npm run dist:win`.
- Testes adicionados para PDF em lote, importação acima de 500 linhas, escalas, feriados, taxas diferenciadas, diagnósticos, anexos, perfis locais, autorização de consulta e auditoria por operador.
- Não alterar secrets, atualizador do GitHub, rotas nem histórico financeiro.
