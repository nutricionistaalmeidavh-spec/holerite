import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {_electron as electron} from 'playwright-core';

const base = process.cwd();
const artifacts = path.join(base, 'qa-artifacts');
const shots = path.join(artifacts, 'screenshots');
const manifest = [];
const issues = [];
let server;
let app;
let page;
let failure = null;

async function waitForPreview() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite preview encerrou antes de iniciar.');
    try {
      const response = await fetch('http://127.0.0.1:5173');
      if (response.ok) return;
    } catch {}
    await delay(300);
  }
  throw new Error('Vite preview não iniciou na porta 5173.');
}

async function screenshot(name, description) {
  await page.locator('h1').first().waitFor({state:'visible'});
  const filename = name + '.png';
  const destination = path.join(shots, filename);
  await page.screenshot({path:destination, fullPage:true, animations:'disabled'});
  const size = (await stat(destination)).size;
  assert.ok(size > 3000, 'Screenshot vazio: ' + filename);
  manifest.push({filename, description, bytes:size});
  console.log('CAPTURED ' + filename + ' (' + size + ' bytes)');
}

async function go(label) {
  await page.locator('nav[aria-label="Menu principal"]').getByRole('button', {name:label, exact:true}).click();
  await page.locator('h1').first().waitFor({state:'visible'});
}

function field(scope, label) {
  return scope.locator('label.field').filter({hasText:label}).first().locator('input').first();
}

async function kind(label) {
  await page.locator('button.kind-option').filter({hasText:label}).click();
  await page.locator('.editor').waitFor({state:'visible'});
}

async function verifyNoAlert() {
  const alert = page.locator('[role="alert"]');
  if (await alert.count()) throw new Error('Erro na interface: ' + await alert.first().innerText());
}

try {
  await mkdir(shots, {recursive:true});
  const profile = await mkdtemp(path.join(tmpdir(), 'holerites-qa-'));
  server = spawn(process.execPath, [
    path.join(base, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'
  ], {cwd:base, stdio:['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', chunk => process.stdout.write('[vite] ' + chunk.toString()));
  server.stderr.on('data', chunk => process.stderr.write('[vite] ' + chunk.toString()));
  await waitForPreview();
  app = await electron.launch({
    args:['.', '--no-sandbox'],
    cwd:base,
    timeout:60000,
    env:{...process.env, XDG_CONFIG_HOME:path.join(profile, 'config'), ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => issues.push('JS: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') issues.push('Console: ' + message.text());
  });
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({width:1440,height:960});
  await page.getByText('Comece cadastrando sua empresa').waitFor();

  await screenshot('01-primeiro-acesso', 'Visão geral: primeiro acesso sem empresa');
  await go('Empresas');
  await screenshot('02-empresas-vazio', 'Empresas: lista vazia');
  await page.getByRole('button', {name:'Nova empresa'}).first().click();
  let dialog = page.getByRole('dialog', {name:'Cadastro de empresa'});
  await dialog.waitFor();
  await screenshot('03-cadastro-empresa', 'Modal de cadastro de empresa');
  await field(dialog, 'Razão social').fill('Empresa Demonstração QA LTDA');
  await field(dialog, 'Nome fantasia').fill('Empresa QA');
  await field(dialog, 'Endereço').fill('Endereço fictício para homologação');
  await dialog.getByRole('button', {name:'Salvar empresa'}).click();
  await dialog.waitFor({state:'hidden'});
  await verifyNoAlert();
  await screenshot('04-empresas-cadastradas', 'Empresas: lista com cadastro demonstrativo');

  await go('Funcionários');
  await screenshot('05-funcionarios-vazio', 'Funcionários: nenhum colaborador');
  await page.getByRole('button', {name:'Novo funcionário'}).click();
  dialog = page.getByRole('dialog', {name:'Cadastro de funcionário'});
  await dialog.waitFor();
  await screenshot('06-cadastro-funcionario', 'Modal de cadastro de funcionário');
  await field(dialog, 'Nome completo').fill('Colaborador Demonstração QA');
  await field(dialog, 'Cargo').fill('Assistente de teste');
  await field(dialog, 'Admissão').fill('2024-01-10');
  await field(dialog, 'Salário mensal').fill('3250.00');
  await dialog.getByRole('button', {name:'Adicionar verba'}).click();
  const recurring = dialog.locator('.employee-recurring .entry-grid').first();
  await field(recurring, 'Descrição').fill('Adicional de homologação');
  await field(recurring, 'Valor').fill('180.00');
  await screenshot('07-funcionario-verbas-recorrentes', 'Cadastro de funcionário com verba mensal recorrente');
  await dialog.evaluate(element => {element.scrollTop = element.scrollHeight;});
  await screenshot('08-funcionario-cadastro-completo', 'Formulário extenso de funcionário');
  await dialog.getByRole('button', {name:'Salvar funcionário'}).click();
  await dialog.waitFor({state:'hidden'});
  await verifyNoAlert();
  await screenshot('09-funcionarios-lista', 'Funcionários: lista preenchida');

  await go('Visão geral');
  await screenshot('10-visao-geral', 'Dashboard após cadastros');
  await go('Folha de pagamento');
  await page.locator('input[aria-label="Competência"]').fill('2026-11');
  await screenshot('11-folha-sem-selecao', 'Folha: seleção de documento e colaborador');
  await page.locator('.employee-rail-item').filter({hasText:'Colaborador Demonstração QA'}).click();
  await page.locator('.editor').waitFor();
  await screenshot('12-holerite-mensal', 'Salário mensal: editor e resumo canônico');

  await kind('Férias');
  await screenshot('13-ferias', 'Férias: período aquisitivo, abono e terço');
  await kind('13º · 1ª parcela');
  await screenshot('14-decimo-terceiro-primeira', '13º salário: primeira parcela');
  await kind('13º · 2ª parcela');
  await screenshot('15-decimo-terceiro-segunda', '13º salário: segunda parcela');
  await kind('Rescisão');
  await screenshot('16-rescisao', 'Rescisão: motivo, aviso e verbas');
  await kind('Salário mensal');
  await screenshot('17-mensal-com-recorrencia', 'Folha mensal com verba recorrente pré-preenchida');
  await page.getByRole('button', {name:'Salvar rascunho'}).click();
  await page.getByRole('button', {name:'Finalizar', exact:true}).waitFor();
  await verifyNoAlert();
  await screenshot('18-rascunho-salvo', 'Holerite mensal salvo em rascunho');
  await page.getByRole('button', {name:'Finalizar', exact:true}).click();
  await page.getByRole('button', {name:'Marcar como pago'}).waitFor();
  await verifyNoAlert();
  await screenshot('19-holerite-finalizado', 'Holerite finalizado e bloqueado para edição');
  await page.getByRole('button', {name:'Marcar como pago'}).click();
  await page.getByText('Pago', {exact:true}).first().waitFor();
  await verifyNoAlert();
  await screenshot('20-holerite-pago', 'Holerite marcado como pago');

  await go('Histórico');
  await screenshot('21-historico', 'Histórico de recibos e ações de exportação');
  await page.getByLabel('Filtrar por tipo de documento').selectOption('monthly');
  await screenshot('22-historico-filtrado', 'Histórico filtrado por salário mensal');
  await go('Funcionários');
  await page.getByRole('button', {name:'Editar', exact:true}).first().click();
  dialog = page.getByRole('dialog', {name:'Cadastro de funcionário'});
  await screenshot('23-editar-funcionario', 'Modal para editar funcionário existente');
  await dialog.getByRole('button', {name:'Cancelar'}).click();
  await go('Empresas');
  await page.getByRole('button', {name:'Editar', exact:true}).first().click();
  dialog = page.getByRole('dialog', {name:'Cadastro de empresa'});
  await screenshot('24-editar-empresa', 'Modal para editar empresa existente');
  await dialog.getByRole('button', {name:'Cancelar'}).click();

  await page.setViewportSize({width:1024,height:768});
  for (const [label, name] of [
    ['Visão geral', '25-compacto-dashboard'],
    ['Empresas', '26-compacto-empresas'],
    ['Funcionários', '27-compacto-funcionarios'],
    ['Folha de pagamento', '28-compacto-folha'],
    ['Histórico', '29-compacto-historico']
  ]) {
    await go(label);
    await screenshot(name, 'Viewport compacto: ' + label);
  }
  await verifyNoAlert();
  assert.equal(issues.filter(issue => issue.startsWith('JS:')).length, 0, 'Exceções JavaScript encontradas.');
  assert.equal(manifest.length, 29, 'Quantidade de capturas inferior ao esperado.');
} catch (error) {
  failure = error;
  console.error('QA VISUAL FALHOU:', error);
  if (page) {
    try {await page.screenshot({path:path.join(artifacts, 'falha.png'), fullPage:true});}
    catch {}
  }
} finally {
  if (app) {
    try {await app.close();} catch {}
  }
  if (server) {
    server.kill('SIGTERM');
    try {await delay(500);} catch {}
  }
  await mkdir(artifacts, {recursive:true});
  const report = {
    generatedAt:new Date().toISOString(),
    status:failure ? 'failed' : 'passed',
    screenshotCount:manifest.length,
    screenshots:manifest,
    consoleIssues:issues,
    failure:failure ? String(failure.stack || failure) : null,
    demoData:'Dados fictícios. Banco isolado por execução.'
  };
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  const sections = [
    '# ArtiSys Holerites — QA visual',
    '',
    'Resultado: **' + report.status + '**',
    '',
    'Capturas: **' + manifest.length + '/29**',
    '',
    failure ? 'Erro: ' + String(failure) : 'Navegação, cadastros e estados da folha verificados.',
    '',
    'As imagens estão em screenshots/. Os dados são fictícios.',
    '',
    ...manifest.map(item => '- [' + item.description + '](screenshots/' + item.filename + ')')
  ];
  await writeFile(path.join(artifacts, 'README.md'), sections.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, sections.join('\n'), {flag:'a'});
  }
}
if (failure) process.exitCode = 1;
