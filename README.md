# ArtiSys Holerite

Sistema local e gratuito para **cadastro de empresa e funcionários, rubricas recorrentes, holerites mensais e demonstrativos**. O núcleo funciona com **Python 3.10+ e SQLite**, sem licenças pagas, serviços externos, CDN, login na nuvem ou instalação de bibliotecas.

## Iniciar

No Windows, macOS ou Linux, tenha Python 3.10 ou superior e execute:

```bash
python app.py
```

Abra **http://127.0.0.1:8765** no navegador deste computador. Para escolher outro caminho para o banco: `python app.py --db /caminho/holerite.sqlite3`. Para escolher porta: `python app.py --port 9000`.

## Funcionalidades implementadas

- Empresa: razão social, CNPJ, endereço e contato.
- Funcionários: criar, listar, pesquisar, editar e inativar; validação do CPF e prevenção de duplicatas; salário e valores em centavos inteiros.
- Informações trabalhistas: cargo, admissão, matrícula, PIS/NIS, tipo de contrato, jornada, dependentes, setor e dados bancários.
- Rubricas mensais recorrentes de provento ou desconto por funcionário.
- Holerite mensal: preenchimento a partir do salário-base e rubricas recorrentes; ajustes avulsos revisáveis; proventos, descontos e líquido.
- Férias, 13º e rescisão: demonstrativos **com rubricas manuais** (sem cálculos legais automáticos).
- Geração individual e geração em lote dos holerites mensais de todos os funcionários ativos.
- Consulta por competência, impressão A4 / salvar como PDF usando o navegador.
- Finalização bloqueia alterações nos lançamentos. Documentos guardam **snapshot** da empresa e do funcionário; edições posteriores no cadastro não modificam o histórico.
- Geração idempotente: solicitar o mesmo funcionário, competência e tipo retorna o documento existente, sem sobrescrever ajustes.

## Limites importantes

**Esta versão não calcula automaticamente encargos legais** (INSS, IRRF, FGTS), férias, décimo terceiro ou rescisão. Não há sincronização com eSocial, assinatura eletrônica oficial, cálculo por convenção coletiva, conferência de legislação vigente ou substituição de sistema contábil. O líquido exibido é a soma dos proventos menos os descontos **informados**, não uma validação de conformidade da folha. Revise com profissional habilitado antes de usar em pagamentos reais.

**Segurança e dados pessoais:** por padrão aceita conexões somente de `127.0.0.1`. Não possui autenticação de usuários, HTTPS ou isolamento entre várias empresas; **não publique esta porta na internet nem abra para a rede local**. Para uso por outros computadores será necessário implementar autenticação, autorização, TLS e controles LGPD. O banco fica em `data/holerite.sqlite3` no diretório do app (ou no local informado em `--db`); adote backup seguro, criptografia do dispositivo e controle de acesso ao computador. Ninguém recebe os dados: não há telemetria, e-mail ou API externa.

## Testes

```bash
python -m unittest discover -s tests -v
```

Os testes cobrem validação de CPF, cadastro, prevenção de duplicidade, geração idempotente, lote, snapshots históricos, rubricas e finalização, além de endpoints de API e proteção básica contra requisições de outras origens.

## Arquitetura

- `app.py`: HTTP local e endpoints JSON (sem dependências extras).
- `models.py`: operações SQLite e regras canônicas de cadastro e emissão.
- `static/`: frontend responsivo e visual de impressão sem frameworks/CDNs.
- `tests/`: testes unitários e de integração HTTP.

Licença: MIT, conforme arquivo `LICENSE`.
