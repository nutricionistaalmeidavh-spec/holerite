# Controle de Ponto e Holerites — fluxo principal (P0/P1/P2)

**Controle de Ponto é o núcleo do ArtiSys Ponto e Folha.** Opera localmente no SQLite, está disponível para todas as empresas sem botão de ativação e não exige assinatura, SaaS ou servidor. O holerite mensal é o **resultado do fechamento da ficha de ponto**; férias, 13º e rescisão permanecem como documentos trabalhistas especiais.

## Sequência de trabalho e jornada
1. Cadastre a empresa e os funcionários. **Controle de ponto** é a tela inicial e a primeira opção do menu.
2. Em **Configurações**, informe horários, dias da semana, divisor salarial, percentual de horas extras, adicional noturno, tolerância e opção entre pagamento de extras ou banco de horas.
3. Na **Ficha individual**, personalize a jornada do empregado, se necessário; o histórico fechado é preservado.
4. Preencha o mês manualmente ou importe CSV/XLSX; a variação **0–10 minutos**, padrão 0, continua opcional apenas para **sugestões** e nunca cria batidas reais.
5. Confira, salve e feche a competência; somente então gere e revise o holerite mensal.

## Ficha mensal
- **Criar ficha manual:** cria calendário em branco para o lançamento efetivo das quatro marcações, faltas, férias, feriados, folgas, afastamentos e observações.
- **Gerar calendário sugerido:** preenche horários planejados de dias úteis, com variação configurável; cada dia mantém origem `suggested` e **não participa da apuração** enquanto não for conferido e lançado como real.
- **Salvar:** somente dias alterados são enviados ao banco, auditados e versionados.
- **Fechar competência:** exige que todos os dias previstos tenham marcações efetivas ou ocorrências confirmadas; congela saldo, parâmetros, base salarial e registros no fechamento.
- **Reabrir:** requer justificativa; fichas integradas ao holerite precisam ser desvinculadas da folha antes de reabrir. Nunca modifica holerites finalizados.
- **PDF / Imprimir:** gera ficha A4 paisagem, com origem por marcação, total de horas e identificação do estado rascunho/fechado.

## Matriz mensal da equipe
- Uma linha por empregado/dia, com edição e colagem de blocos do Excel.
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
- Depois de fechar uma ficha, o botão **Gerar holerite do ponto** insere ou atualiza rubricas com IDs estáveis no holerite **mensal ainda em rascunho**, preservando rubricas manuais/recorrentes e impedindo duplicação.
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

Cobertura inclui ponto ativo em novas empresas e obrigatoriedade de fechamento antes do holerite, sugestões versus batidas reais, virada de meia-noite, fechamento imutável, integração mensal idempotente, CSV/XLSX, alias brasileiro, banco de horas sem desconto duplicado e migrações antigas.
