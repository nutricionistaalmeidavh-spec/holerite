import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {_electron as electron} from 'playwright-core';

const profile=await mkdtemp(join(tmpdir(),'artisys-packaged-qa-'));
const appData=join(profile,'appdata'),localData=join(profile,'localdata');
await Promise.all([mkdir(appData,{recursive:true}),mkdir(localData,{recursive:true})]);
const executablePath=resolve(process.argv[2]||'release/win-unpacked/ArtiSys Holerites.exe');
let app;
try{
  app=await electron.launch({executablePath,args:['--user-data-dir='+join(profile,'chromium')],timeout:60000,
    env:{...process.env,APPDATA:appData,LOCALAPPDATA:localData,XDG_CONFIG_HOME:appData}});
  const actual=await app.evaluate(({app})=>app.getPath('userData'));
  assert.ok(resolve(actual).toLowerCase().startsWith(resolve(profile).toLowerCase()),'Perfil de QA não isolado: '+actual);
  const page=await app.firstWindow({timeout:60000});
  await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor({timeout:30000});
  const result=await page.evaluate(async()=>{
    const api=window.holerites;
    const company=await api.saveCompany({legalName:'Empresa QA empacotado',tradeName:'',cnpj:'',address:''});
    const employee=await api.saveEmployee({companyId:company.id,name:'Pessoa QA',cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true});
    const matrix=await api.getTimeMatrixPage({companyId:company.id,competence:'2026-11',page:0,pageSize:5});
    const workspace=await api.workspace({companyId:company.id,competence:'2026-11'});
    return {matrixTotal:matrix.total,employeeFound:workspace.employees.some(e=>e.id===employee.id)};
  });
  assert.deepEqual(result,{matrixTotal:1,employeeFound:true});
  console.log('Worker do SQLite inicializou, gravou e leu registros no aplicativo empacotado.');
}finally{try{await app?.close();}finally{await rm(profile,{recursive:true,force:true});}}
