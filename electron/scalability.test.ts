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
