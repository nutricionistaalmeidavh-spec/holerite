# Controle de Ponto e Holerites — fluxo principal (P0/P1/P2)

**Controle de Ponto é o núcleo do ArtiSys Ponto e Folha.** Opera localmente no SQLite, está disponível para todas as empresas sem ativação e não exige SaaS nem servidor. A emissão mensal do holerite é o **último passo sugerido**, sem bloqueio obrigatório. Férias, 13º e rescisão permanecem disponíveis.

## Sequência de trabalho e jornada
1. Cadastre a empresa e os funcionários. **Controle de ponto** é a tela inicial e a primeira opção do menu.
2. Em **Configurações**, informe horários, dias da semana, divisor salarial, percentual de horas extras, adicional noturno, tolerância e opção entre pagamento de extras ou banco de horas.
3. Na **Ficha individual**, personalize a jornada do empregado, se necessário; o histórico fechado é preservado.
4. Preencha manualmente, importe CSV/XLSX ou clique em **Gerar calendário sugerido** (a variação opcional vai de 0 a 10 minutos). O sistema abre um diálogo perguntando **“Incluir horários gerados na apuração?”**: escolha **Gerar e incluir na apuração** para considerar os horários nos cálculos imediatamente, ou **Gerar sem incluir** para manter somente as sugestões.
5. Na equipe, **Criar calendários da equipe** oferece a mesma decisão para as fichas abertas. Caso escolha gerar sem incluir, ainda pode usar **Conferir mês em lote** ou **Conferir equipe em lote** depois. Imprima a ficha para leitura e assinatura física do funcionário. O fechamento do ponto não é obrigatório para emitir o holerite.

## Ficha mensal
- **Criar ficha manual:** cria calendário em branco para o lançamento efetivo das quatro marcações, faltas, férias, feriados, folgas, afastamentos e observações.
- **Gerar calendário sugerido:** ao clicar, abre um diálogo com **Gerar sem incluir**, **Gerar e incluir na apuração** e **Cancelar**. A primeira opção salva horários com origem `suggested` e os exclui dos cálculos. A segunda gera e registra uma conferência administrativa em lote (`reviewed`) na mesma ação, fazendo os horários entrarem imediatamente na apuração. A origem gerada é preservada e não é tratada como batida de relógio eletrônico. Marcações manuais e importadas nunca são substituídas pela geração.
- **Salvar:** somente dias alterados são enviados ao banco, auditados e versionados.
- **Fechar competência:** opcional e sem exigir confirmação diária. Congela o resumo, parâmetros, base salarial e registros disponíveis; sugestões restantes continuam identificadas e não entram no cálculo.
- **Reabrir:** requer justificativa; fichas integradas ao holerite precisam ser desvinculadas da folha antes de reabrir. Nunca modifica holerites finalizados.
- **PDF / Imprimir:** disponível antes ou depois do fechamento. Gera ficha A4 paisagem com origem dos horários e campos de assinatura e data para empregado e responsável. A assinatura é recolhida em papel após a conferência.

## Matriz mensal da equipe
- Uma linha por empregado/dia, com edição, colagem do Excel e conferência em lote de toda a equipe. Marcações manuais/importadas são preservadas.
- Salvamento em lotes transacionais de até 500 dias.
- Registros de fichas fechadas não podem ser alterados.
- Pode exportar matriz `CSV` ou `XLSX` e gerar modelo `XLSX`.

## Importação de planilhas
- Aceita XLSX ou CSV de até 30 MB e 30.000 linhas por arquivo, com mapeamentos reaproveitados por empresa; CSV com vírgula ou ponto e vírgula.
- Mapeamento manual de colunas, com sugestões para exportações do Obra na Mão.
- Identifica colaborador por CPF, matrícula ou nome exato (único na empresa).
- Prévia de erros e amostras, detecção de linhas duplicadas, datas válidas e quatro horários em ordem.
- Não substitui marcações reais existentes sem confirmação de substituição. Evita reimportar o mesmo arquivo por SHA-256; mantém histórico da importação.
- A importação é uma transferência administrativa de dados, não uma marcação eletrônica realizada pelo trabalhador.

## Apuração e holerite
- Apuração de minutos trabalhados, extras, atraso, faltas, jornada noturna, déficit e saldo de banco de horas.
- Saldo acumulado do banco soma apenas fichas fechadas; déficit compensado no banco não é automaticamente descontado **também** da folha.
- O botão **Gerar holerite do ponto** pode ser usado sem fechamento prévio. Ele insere ou atualiza rubricas com IDs estáveis no holerite **mensal em rascunho**, preservando rubricas manuais/recorrentes, sem duplicação. Sugestões não conferidas permanecem fora dos cálculos.
- Nunca altera holerite finalizado ou pago. A base e os parâmetros da ficha fechada são congelados.

## Atenção fiscal e legal
Este é um módulo de **administração/tratamento de jornadas para conferência interna**, **não** um registrador eletrônico REP-C, REP-A ou REP-P homologado. Não gera AFD/AEJ. Não utilizar sugestões como se fossem marcações reais, nem fabricar horários praticados.

O motor calcula minutos cronológicos e dispõe de redução noturna opcional, DSR estimado e percentuais distintos para domingos e feriados. Não substitui revisão de CCT/ACT, reflexos completos, intervalos indenizatórios, sobreavisos ou regras particulares por setor. Feriados estaduais e municipais devem ser cadastrados manualmente. A política de percentuais e o resultado da folha devem ser conferidos pelo contador/DP.

Para desenvolvimentos futuros: integração com arquivos de REPs, regras convencionais versionadas e homologação regulatória separada. Nenhuma dessas extensões é dependência do core gratuito.

## Ampliação P0/P1/P2 (2026-11)
Consulte [`benchmark-controle-ponto-2026.md`](./benchmark-controle-ponto-2026.md) para impressão de fichas em lote, escalas rotativas, relatórios, anexos locais e perfis de acesso. O fechamento continua opcional e o holerite é a etapa final do fluxo.

## Testes
```bash
npm test
npm run build
npm run dist:win
```

Cobertura inclui ponto ativo, conferência em lote auditável e idempotente, preservação de importações/manuais, emissão sem fechamento obrigatório, sugestões não conferidas excluídas da apuração, virada de meia-noite, integração mensal idempotente, CSV/XLSX e migrações antigas.

## Importar funcionários e fichas de ponto de planilhas (P0–P2)

O cadastro individual permanece disponível. Para importar lotes, abra **Funcionários → Importar funcionários CSV/XLSX** ou **Controle de ponto → Importar planilha / Importação completa**.

### Modelos oficiais (gerados localmente)

| Ação | Modelo baixado | Abas | Campos |
| --- | --- | --- | --- |
| Funcionários → Baixar modelo de funcionários | `Modelo-Funcionarios.xlsx` | Funcionários + Instruções | Nome, CPF, matrícula, cargo, admissão, salário em R$, setor, obra, centro de custo, PIS/NIS, jornada, dependentes e situação |
| Ponto → Modelo de ponto diário XLSX | `Modelo-Controle-Ponto.xlsx` | Ponto + Instruções | Uma linha por funcionário e por data: entrada, almoço, retorno, saída, tipo de dia e observações |
| Ponto → Modelo de matriz mensal XLSX | `Modelo-Matriz-Mensal.xlsx` | Matriz mensal + Instruções | Uma linha por funcionário e competência; até 31 dias, com entrada, almoço, retorno, saída, tipo e observações por dia |
| Ponto → Importação completa → Baixar modelo completo | `Modelo-Funcionarios-e-Ponto.xlsx` | Funcionários + Ponto + Instruções | Cadastra funcionários e importa marcações do mesmo arquivo XLSX |

Os cabeçalhos do modelo são reconhecidos **automaticamente**. Para arquivos CSV/XLSX de terceiros, o operador pode ajustar o mapeamento de colunas antes de importar. CSV aceita vírgula, ponto e vírgula, campos entre aspas, UTF-8 e Windows-1252; o Excel deve preservar CPF/matrícula como texto. Dados de ponto podem ser corrigidos na prévia paginada.

**Segurança do processo:** nunca sobrescreve cadastro de funcionário só por identificar CPF ou matrícula já existente. A importação em lote de funcionários usa transação SQLite; a de ponto também grava marcações, hash do arquivo e mapeamento de modo atômico. Em erro parcial, o operador pode corrigir células diretamente na prévia ou optar explicitamente por **importar somente linhas válidas**, baixando os problemas em CSV. Lançamentos de ponto reais já existentes não são substituídos sem confirmação; fichas fechadas continuam protegidas. A importação completa exige que as duas abas estejam válidas e grava funcionários e ponto em **uma única transação**: falhou uma etapa, nada é salvo.

**Fluxo de apuração:** importar uma marcação não gera um holerite por conta própria; permanece a conferência administrativa em lote e a decisão explícita de inclusão das sugestões de calendário, sem travas de fechamento.

Bibliotecas gratuitas/offline: ExcelJS, Papa Parse e iconv-lite; todo o processamento e armazenamento ficam no PC.

