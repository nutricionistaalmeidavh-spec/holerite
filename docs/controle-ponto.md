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
- **Gerar calendário sugerido:** preenche horários planejados de dias úteis, com variação configurável; cada dia mantém origem `suggested` até a conferência em lote. A conferência muda a origem para `reviewed` (gerado e conferido administrativamente), sem fingir que houve batida eletrônica. Só dias conferidos entram na apuração.
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
- Aceita XLSX ou CSV de até 10 MB e 500 linhas por arquivo; CSV com vírgula ou ponto e vírgula.
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

O motor trabalha com minutos cronológicos efetivos e não automatiza integralmente a redução ficta noturna, DSR/reflexos, alterações de CCT/ACT, horas extras diferenciadas em feriados, intervalos indenizatórios, sobreavisos ou regras particulares por setor. A política de percentuais e o resultado da folha devem ser conferidos pelo contador/DP.

Para desenvolvimentos futuros: integração com arquivos de REPs, regras convencionais versionadas e homologação regulatória separada. Nenhuma dessas extensões é dependência do core gratuito.

## Testes
```bash
npm test
npm run build
npm run dist:win
```

Cobertura inclui ponto ativo, conferência em lote auditável e idempotente, preservação de importações/manuais, emissão sem fechamento obrigatório, sugestões não conferidas excluídas da apuração, virada de meia-noite, integração mensal idempotente, CSV/XLSX e migrações antigas.
