import assert from 'node:assert/strict';
import test from 'node:test';
import {HoleriteDatabase} from './database';
import {defaultSchedule,previewMonth} from '../src/shared/time';

test('matrix page bounds payload, preserves global filters and returns consistent totals',()=>{
 const db=new HoleriteDatabase(':memory:');
 try{
  const c=db.saveCompany({legalName:'Equipe',tradeName:'',cnpj:'',address:''});
  const people=Array.from({length:7},(_,i)=>db.saveEmployee({companyId:c.id,name:'Pessoa '+i,cpf:'',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true}));
  const days=previewMonth('2026-11',defaultSchedule(),0);
  db.attendance.saveMatrix(people.flatMap(e=>days.map(day=>({employeeId:e.id,competence:'2026-11',day}))));
  db.attendance.close(people[0].id,'2026-11');
  const first=db.attendance.matrixPage({companyId:c.id,competence:'2026-11',page:0,pageSize:3});
  const next=db.attendance.matrixPage({companyId:c.id,competence:'2026-11',page:1,pageSize:3});
  assert.equal(first.total,7);assert.equal(first.rows.length,3);assert.equal(first.closed,1);
  assert.equal(new Set([...first.rows,...next.rows].map(r=>r.employeeId)).size,6);
  const found=db.attendance.matrixPage({companyId:c.id,competence:'2026-11',page:0,pageSize:3,search:'Pessoa 6'});
  assert.equal(found.total,1);assert.equal(found.rows[0].employeeId,people[6].id);
  const closed=db.attendance.matrixPage({companyId:c.id,competence:'2026-11',page:0,pageSize:3,status:'closed'});
  assert.equal(closed.total,1);assert.equal(closed.rows[0].employeeId,people[0].id);
 }finally{db.close();}
});
