import assert from 'node:assert/strict';
import test from 'node:test';
import {HoleriteDatabase} from './database';
import {defaultSchedule,previewMonth} from '../src/shared/time';

test('workspace and history are scoped by company and history is paginated without losing older records',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const make=(name:string)=>db.saveCompany({legalName:name,tradeName:'',cnpj:'',address:''});
  const a=make('A'),b=make('B');
  const person=(companyId:string,name:string)=>db.saveEmployee({companyId,name,cpf:'',role:'Auxiliar',admissionDate:'2024-01-01',salaryCents:300000,dependents:0,active:true});
  const ana=person(a.id,'Álvaro'),other=person(b.id,'Outra');
  for(const competence of ['2025-01','2025-02','2026-11'])db.savePayroll({employeeId:ana.id,competence,taxMode:'manual',entries:[]});
  db.savePayroll({employeeId:other.id,competence:'2026-11',taxMode:'manual',entries:[]});
  const workspace=db.workspace(a.id,'2026-11');
  assert.deepEqual(workspace.employees.map(e=>e.id),[ana.id]);
  assert.ok(workspace.payrolls.every(p=>p.companyId===a.id));
  const first=db.payrollPage({companyId:a.id,search:'álvaro',page:0,pageSize:2});
  const second=db.payrollPage({companyId:a.id,search:'álvaro',page:1,pageSize:2});
  assert.equal(first.total,3);assert.equal(first.rows.length,2);assert.equal(second.rows.length,1);
  assert.equal(new Set([...first.rows,...second.rows].map(p=>p.id)).size,3);
  assert.equal(db.payrollPage({companyId:a.id,competence:'2026-11',page:0,pageSize:2}).total,1);
 }finally{db.close();}
});

test('more than 500 employees are visible, and batch matrix is equivalent to individual sheets',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const c=db.saveCompany({legalName:'Equipe grande',tradeName:'',cnpj:'',address:''});
  const people=Array.from({length:510},(_,i)=>db.saveEmployee({companyId:c.id,name:'Pessoa '+String(i).padStart(4,'0'),cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true}));
  db.attendance.autofill(people[0].id,'2026-11');
  db.attendance.reviewSuggestions([people[0].id],'2026-11');
  db.attendance.close(people[0].id,'2026-11');
  const matrix=db.attendance.matrix(c.id,'2026-11');
  assert.equal(matrix.length,510);
  const {employeeName,...sheet}=matrix[0];assert.deepEqual(sheet,db.attendance.getSheet(people[0].id,'2026-11'));
  assert.deepEqual(db.attendance.overview(c.id,'2026-11'),{total:510,closed:1});
 }finally{db.close();}
});

test('large writes exceed the former 30,000-day artificial ceiling and keep one transaction',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const c=db.saveCompany({legalName:'Lote',tradeName:'',cnpj:'',address:''});
  const people=Array.from({length:1001},(_,i)=>db.saveEmployee({companyId:c.id,name:'Pessoa '+i,cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true}));
  const days=previewMonth('2026-10',defaultSchedule(),0);
  const changes=people.flatMap(e=>days.map(day=>({employeeId:e.id,competence:'2026-10',day})));
  assert.equal(db.attendance.saveMatrix(changes),31031);
  assert.equal(db.attendance.getSheet(people.at(-1)!.id,'2026-10').days.length,31);
 }finally{db.close();}
});

test('audit and import history can reach records beyond the former caps',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const c=db.saveCompany({legalName:'Histórico',tradeName:'',cnpj:'',address:''});
  const e=db.saveEmployee({companyId:c.id,name:'Pessoa',cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true});
  const day=previewMonth('2026-11',defaultSchedule(),0)[0];
  for(let i=0;i<305;i++)db.attendance.saveMatrix([{employeeId:e.id,competence:'2026-11',day:{...day,notes:'Revisão '+i}}]);
  const last=db.attendance.auditPage(e.id,'2026-11',6,50);
  assert.equal(last.total,305);assert.equal(last.rows.length,5);
  for(let i=0;i<55;i++)db.attendance.recordImport(c.id,'Arquivo '+i,i.toString(16).padStart(64,'0'),1);
  assert.equal(db.attendance.importPage(c.id,1,50).rows.length,5);
  assert.equal(db.attendance.importPage(c.id,1,50).total,55);
 }finally{db.close();}
});

test('more than 100 recurring and payroll items can be persisted without a commercial quota',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const c=db.saveCompany({legalName:'Rubricas',tradeName:'',cnpj:'',address:''});
  const entries=Array.from({length:125},(_,i)=>({id:'r'+i,code:'R'+i,description:'Rubrica '+i,kind:'earning' as const,amountCents:100,inssBase:false,irBase:false,fgtsBase:false}));
  const e=db.saveEmployee({companyId:c.id,name:'Pessoa',cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true,recurringEntries:entries});
  assert.equal(e.recurringEntries?.length,125);
  const p=db.savePayroll({employeeId:e.id,competence:'2026-11',taxMode:'manual',entries});
  assert.equal(p.details.items.length,126);
 }finally{db.close();}
});
