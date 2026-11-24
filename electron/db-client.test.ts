import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import {DatabaseClient} from './db-client';
import type {Company,Employee,StateSnapshot} from '../src/shared/types';
import type {MatrixPageResult} from './attendance';
import {defaultSchedule,previewMonth} from '../src/shared/time';

test('real worker serializes writes, retains actor and restricts viewer, and reopens the same file',async()=>{
 const dir=mkdtempSync(join(process.cwd(),'.db-worker-test-'));
 const workerPath=join(dir,'worker.cjs'),databasePath=join(dir,'base.sqlite');
 let db:DatabaseClient|undefined;
 try{
  buildSync({entryPoints:['electron/db-worker.ts'],outfile:workerPath,bundle:true,platform:'node',target:'node24',format:'cjs',external:['exceljs']});
  db=new DatabaseClient(workerPath,databasePath);await db.ready;
  await db.call('auth-setup',{name:'Admin',pin:'123456'});
  const c=await db.call<Company>('save-company',{legalName:'Empresa',tradeName:'',cnpj:'',address:''});
  const e=await db.call<Employee>('save-employee',{companyId:c.id,name:'Pessoa',cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true});
  const day=previewMonth('2026-11',defaultSchedule(),0)[0];
  const write=db.call('time-save-matrix',{changes:[{employeeId:e.id,competence:'2026-11',day}]});
  const read=db.call<MatrixPageResult>('time-matrix-page',{companyId:c.id,competence:'2026-11',page:0,pageSize:5});
  assert.equal(await write,1);assert.equal((await read).rows[0].days[0].date,day.date);
  const audit=await db.call<{rows:Array<{actor_name:string}>}>('time-audit-page',{employeeId:e.id,competence:'2026-11',page:0,pageSize:50});
  assert.equal(audit.rows[0].actor_name,'Admin');
  await db.call('auth-add-user',{name:'Consulta',pin:'654321',role:'viewer'});
  await db.call('auth-logout');await db.call('auth-login',{name:'Consulta',pin:'654321'});
  await assert.rejects(db.call('time-save-matrix',{changes:[{employeeId:e.id,competence:'2026-11',day}]}),/permissão/i);
  await assert.rejects(db.call('time-generate-team',{companyId:c.id,competence:'2026-11',include:true}),/permissão/i);
  assert.equal((await db.call<MatrixPageResult>('time-matrix-page',{companyId:c.id,competence:'2026-11',page:0,pageSize:5})).total,1);
  await db.close();db=new DatabaseClient(workerPath,databasePath);await db.ready;
  await assert.rejects(db.call('workspace',{companyId:c.id,competence:'2026-11'}),/autenticação/i);
  await db.call('auth-login',{name:'Admin',pin:'123456'});
  assert.equal((await db.call<StateSnapshot>('workspace',{companyId:c.id,competence:'2026-11'})).employees.length,1);
 }finally{try{await db?.close();}finally{rmSync(dir,{recursive:true,force:true});}}
});
