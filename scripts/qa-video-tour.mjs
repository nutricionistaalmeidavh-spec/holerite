import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {_electron as electron} from 'playwright-core';

const root=process.cwd();
const out=path.join(root,'qa-artifacts','video-tour');
const shots=path.join(out,'screenshots');
const videoDir=path.join(out,'raw-video');
const report={status:'failed',startedAt:new Date().toISOString(),scenario:'Tour de primeiro acesso, cadastro, geração e impressão de holerites',steps:[],checks:[],warnings:[],artifacts:[],failure:null};
let server, app, page, video, failure=null;
const record=(label)=>{report.steps.push({label,at:new Date().toISOString()});console.log('[QA TOUR]',label)};
const check=(name,passed=true)=>{assert.ok(passed,name);report.checks.push(name)};
const field=(scope,label)=>scope.locator('label.field').filter({hasText:label}).first().locator('input').first();

async function waitPreview(){
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Vite preview encerrou.');
    try{if((await fetch('http://127.0.0.1:5173')).ok)return;}catch{}
    await delay(300);
  }
  throw Error('Vite preview não iniciou.');
}
async function shot(name){
  const target=path.join(shots,name+'.png');
  await page.screenshot({path:target,fullPage:false,animations:'disabled'});
  check('Captura '+name,(await stat(target)).size>3000);
  report.artifacts.push('screenshots/'+name+'.png');
}
async function nav(label){
  await page.locator('nav[aria-label="Menu principal"]').getByRole('button',{name:label,exact:true}).click();
  await page.locator('h1').first().waitFor({state:'visible'});
}
async function noError(){
  const alerts=page.locator('[role="alert"]');
  if(await alerts.count())throw Error('Erro da interface: '+await alerts.first().innerText());
}
async function waitFile(filename){
  for(let i=0;i<80;i++){try{if((await stat(filename)).size>5000)return;}catch{}await delay(250);}
  throw Error('Arquivo de PDF não foi criado: '+filename);
}
async function assertPdf(filename,label){
  const file=await readFile(filename);
  check(label+' possui assinatura PDF',file.subarray(0,5).toString()==='%PDF-');
  check(label+' tem conteúdo',file.length>5000);
  report.artifacts.push(path.relative(out,filename));
}

try{
  await Promise.all([mkdir(shots,{recursive:true}),mkdir(videoDir,{recursive:true})]);
  const profile=await mkdtemp(path.join(tmpdir(),'holerites-tour-video-'));
  server=spawn(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'preview','--host','127.0.0.1','--port','5173','--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>process.stdout.write('[vite] '+d));
  server.stderr.on('data',d=>process.stderr.write('[vite] '+d));
  await waitPreview();
  app=await electron.launch({
    args:['.','--no-sandbox'],cwd:root,timeout:60000,
    recordVideo:{dir:videoDir,size:{width:1280,height:800},fps:20},
    env:{...process.env,XDG_CONFIG_HOME:path.join(profile,'config'),ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}
  });
  page=await app.firstWindow();
  video=page.video();
  page.setDefaultTimeout(25000);
  await page.setViewportSize({width:1280,height:800});
  page.on('pageerror',err=>report.warnings.push('JS: '+err.message));
  page.on('console',message=>{if(message.type()==='error')report.warnings.push('Console: '+message.text())});
  page.on('dialog',dialog=>dialog.accept());
  const tour=page.locator('.onboarding-tour');
  await page.getByText('Comece cadastrando sua empresa').waitFor();
  record('01. Primeiro acesso do aplicativo Electron real');
  await shot('01-primeiro-acesso');
  await page.getByRole('button',{name:'Iniciar tour guiado'}).click();
  await tour.getByText('Cadastre sua empresa').waitFor();
  record('02. Tour: cadastrando empresa');
  await shot('02-tour-primeiro-passo');
  await tour.getByRole('button',{name:'Cadastrar empresa'}).click();
  let dialog=page.getByRole('dialog',{name:'Cadastro de empresa'});
  await dialog.waitFor();
  await field(dialog,'Razão social').fill('Empresa Demonstração QA LTDA');
  await field(dialog,'Nome fantasia').fill('Empresa QA');
  await field(dialog,'Endereço').fill('Endereço fictício - uso exclusivo em QA');
  await shot('03-empresa-formulario');
  await dialog.getByRole('button',{name:'Salvar empresa'}).click();
  await dialog.waitFor({state:'hidden'});
  await tour.getByText('Cadastre um funcionário').waitFor();
  await noError();
  record('03. Empresa salva e tour avançado automaticamente');
  await shot('04-empresa-cadastrada');
  await tour.getByRole('button',{name:'Cadastrar funcionário'}).click();
  dialog=page.getByRole('dialog',{name:'Cadastro de funcionário'});
  await dialog.waitFor();
  await field(dialog,'Nome completo').fill('Colaborador Demonstração QA');
  await field(dialog,'Matrícula').fill('QA-001');
  await field(dialog,'Jornada de trabalho').fill('44 horas semanais');
  await field(dialog,'Cargo').fill('Assistente administrativo');
  await field(dialog,'Admissão').fill('2024-01-10');
  await field(dialog,'Salário mensal').fill('3250.00');
  await dialog.getByRole('button',{name:'Adicionar verba'}).click();
  const recurring=dialog.locator('.employee-recurring .entry-grid').first();
  await field(recurring,'Descrição').fill('Adicional demonstrativo');
  await field(recurring,'Valor').fill('180.00');
  await shot('05-funcionario-verbas-recorrentes');
  await dialog.getByRole('button',{name:'Salvar funcionário'}).click();
  await dialog.waitFor({state:'hidden'});
  await tour.getByText('Abra a folha de pagamento').waitFor();
  await noError();
  record('04. Funcionário salvo com rubrica recorrente');

  await nav('Funcionários');
  await page.getByRole('button',{name:'Novo funcionário'}).click();
  dialog=page.getByRole('dialog',{name:'Cadastro de funcionário'});
  await field(dialog,'Nome completo').fill('Segundo Colaborador QA');
  await field(dialog,'Cargo').fill('Auxiliar administrativo');
  await field(dialog,'Admissão').fill('2025-02-05');
  await field(dialog,'Salário mensal').fill('2400.00');
  await dialog.getByRole('button',{name:'Salvar funcionário'}).click();
  await dialog.waitFor({state:'hidden'});
  check('Cadastro com dois funcionários',await page.getByText('Segundo Colaborador QA').count()>0);
  record('05. Cadastro de segundo colaborador para teste de lote');
  await shot('06-dois-colaboradores');

  await tour.getByRole('button',{name:'Abrir folha'}).click();
  await page.locator('input[aria-label="Competência"]').fill('2026-11');
  await page.locator('.editor').waitFor();
  await tour.getByRole('button',{name:'Próxima etapa'}).click();
  await tour.getByText('Calcule e finalize').waitFor();
  record('06. Tour: emissão mensal e resumo de cálculo');
  await shot('07-tour-calculo-mensal');
  for(const [kind,label,name] of [
    ['Férias','Programação das férias','08-ferias'],
    ['13º · 1ª parcela','13º · 1ª parcela','09-decimo-primeira'],
    ['13º · 2ª parcela','13º · 2ª parcela','10-decimo-segunda'],
    ['Rescisão','Dados da rescisão','11-rescisao']
  ]){
    await page.locator('button.kind-option').filter({hasText:kind}).click();
    await page.locator('.editor').waitFor();
    await shot(name);
    record('07. Prévia de '+kind);
  }
  await page.locator('button.kind-option').filter({hasText:'Salário mensal'}).click();
  await page.locator('.editor').waitFor();
  check('Verba recorrente pré-preenchida',await page.locator('.editor .entry-grid input').evaluateAll(inputs=>inputs.some(input=>input.value==='Adicional demonstrativo')));
  await page.getByRole('button',{name:'Salvar rascunho'}).click();
  await page.getByRole('button',{name:'Finalizar',exact:true}).waitFor();
  await noError();
  record('08. Rascunho mensal salvo');
  await shot('12-rascunho-mensal');
  await page.getByRole('button',{name:'Finalizar',exact:true}).click();
  await page.getByRole('button',{name:'Marcar como pago'}).waitFor();
  await noError();
  record('09. Holerite finalizado e bloqueado');
  await shot('13-holerite-finalizado');

  await page.getByRole('button',{name:'Gerar mês em lote'}).click();
  await page.getByText(/Lote concluído:/).waitFor();
  await noError();
  record('10. Geração em lote: preserva documento existente, cria segundo recibo');
  await shot('14-lote-mensal');

  await tour.getByRole('button',{name:'Próxima etapa'}).click();
  await tour.getByText('Gerar PDF e imprimir').waitFor();
  await shot('15-tour-pdf-impressao');
  record('11. Tour: exportação em PDF e impressão');
  const savedPdf=path.join(out,'Holerite-QA-exportado.pdf');
  await app.evaluate(({dialog},pdfPath)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:pdfPath});
  },savedPdf);
  await page.getByRole('button',{name:'Gerar PDF',exact:true}).click();
  await waitFile(savedPdf);
  await assertPdf(savedPdf,'Exportação');
  await noError();
  record('12. Gerar PDF: arquivo A4 real gerado pelo Electron');
  await shot('16-apos-gerar-pdf');

  await app.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    const wcProto=Object.getPrototypeOf(window.webContents);
    globalThis.__holeritesQaPrint=null;
    wcProto.print=function(options,callback){
      void this.printToPDF({pageSize:'A4',printBackground:options?.printBackground??true})
        .then(bytes=>{globalThis.__holeritesQaPrint={bytes:bytes.toString('base64'),silent:options?.silent??null};callback(true,'');})
        .catch(error=>callback(false,String(error)));
    };
  });
  await page.getByRole('button',{name:'Imprimir',exact:true}).click();
  let proof=null;
  for(let i=0;i<80;i++){
    proof=await app.evaluate(()=>globalThis.__holeritesQaPrint??null);
    if(proof?.bytes)break;
    await delay(250);
  }
  check('Comando Imprimir alcançou o processo principal Electron',Boolean(proof?.bytes));
  const printPdf=path.join(out,'Holerite-QA-prova-de-impressao.pdf');
  await writeFile(printPdf,Buffer.from(proof.bytes,'base64'));
  await assertPdf(printPdf,'Caminho de impressão');
  await noError();
  record('13. Imprimir: comando verificado e saída de impressão simulada em PDF (sem impressora física)');
  await shot('17-impressao-verificada');

  await tour.getByRole('button',{name:'Abrir histórico'}).click();
  await nav('Histórico');
  await page.getByText('Colaborador Demonstração QA').first().waitFor();
  await shot('18-historico');
  await tour.getByRole('button',{name:'Concluir tour'}).click();
  check('Tour encerrado',await tour.count()===0);
  await noError();
  check('Nenhuma exceção JS',report.warnings.filter(w=>w.startsWith('JS:')).length===0);
  record('14. Tour encerrado, histórico acessível');
  await shot('19-final');
  report.status='passed';
}catch(e){
  failure=e;
  report.failure=String(e?.stack??e);
  console.error('QA TOUR VIDEO FALHOU:',e);
  if(page){try{await page.screenshot({path:path.join(out,'falha.png'),fullPage:true});report.artifacts.push('falha.png')}catch{}}
}finally{
  try{if(app)await app.close()}catch(e){report.warnings.push('Fechamento Electron: '+e)}
  if(video){
    try{
      const rawPath=path.join(out,'tour-holerites.webm');
      await video.saveAs(rawPath);
      report.artifacts.push('tour-holerites.webm');
      const ffmpeg=spawnSync('ffmpeg',['-y','-loglevel','error','-i',rawPath,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-crf','24','-movflags','+faststart',path.join(out,'tour-holerites.mp4')],{timeout:120000,encoding:'utf8'});
      if(ffmpeg.status===0 && (await stat(path.join(out,'tour-holerites.mp4'))).size>10000){report.artifacts.push('tour-holerites.mp4');}
      else report.warnings.push('Conversão MP4 indisponível: '+(ffmpeg.stderr??ffmpeg.error??'falha ffmpeg'));
    }catch(e){report.warnings.push('Vídeo: '+e)}
  }
  if(server){server.kill('SIGTERM');await delay(350)}
  report.completedAt=new Date().toISOString();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  const lines=['# QA gravado — ArtiSys Holerites','','Resultado: **'+report.status+'**','','## Etapas',...report.steps.map(s=>'- '+s.label),'','## Verificações',...report.checks.map(s=>'- '+s),'','## Limites','Impressão verificada no processo principal com geração de PDF equivalente; não houve spool físico nem teste de driver no Windows.','',...report.warnings.map(s=>'- Aviso: '+s),report.failure?'\nFalha: '+report.failure:''];
  await writeFile(path.join(out,'README.md'),lines.join('\n'));
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'),{flag:'a'});
}
if(failure)process.exitCode=1;
