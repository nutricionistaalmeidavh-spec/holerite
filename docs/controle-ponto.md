# Módulo opcional de Controle de Ponto — P0/P1/P2

Este módulo opera **localmente no mesmo SQLite** do ArtiSys Holerites. Por padrão, está **desativado em cada empresa**. Não há assinatura, SaaS ou servidor obrigatório. A folha mensal, 13º, férias e rescisão continuam disponíveis sem ponto.

## Habilitação e jornada
1. Em **Controle de ponto**, escolha a empresa e ative o módulo.
2. Em **Configurações**, informe horários, dias da semana, divisor salarial, percentual de horas extras, adicional noturno, tolerância e opção entre pagamento de extras ou banco de horas.
3. Na **Ficha individual**, você pode personalizar a jornada do empregado; essas mudanças não alteram a ficha histórica já fechada.
4. Variação de horários **0–10 minutos**, padrão 0. Este recurso gera apenas **sugestões**, sem registrar batidas reais.

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
- Depois de fechar uma ficha, o botão **Enviar para holerite** insere ou atualiza rubricas com IDs estáveis no holerite **mensal ainda em rascunho**, preservando rubricas manuais/recorrentes e impedindo duplicação.
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

Cobertura inclui isolamento do módulo desativado, sugestões versus batidas reais, virada de meia-noite, fechamento imutável, integração mensal idempotente, CSV/XLSX, alias brasileiro, banco de horas sem desconto duplicado e migrações antigas.
