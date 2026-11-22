import assert from 'node:assert/strict';
import test from 'node:test';
import {HoleriteDatabase} from './database';
import {defaultSchedule,previewMonth} from '../src/shared/time';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const setup=()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Exemplo',tradeName:'',cnpj:'',address:''});
  const employee=db.saveEmployee({companyId:company.id,name:'Ana',cpf:'12345678909',role:'Operadora',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
  return {db,company,employee};
};
test('controle de ponto is enabled as core for every company, including a newly registered company',()=>{
  const {db,company,employee}=setup();
  assert.equal(db.attendance.getConfig(company.id).enabled,true);
  const sheet=db.attendance.getSheet(employee.id,'2026-11');
  assert.equal(sheet.status,'draft');
  assert.equal(sheet.days.length,0);
  assert.throws(()=>db.attendance.setConfig(company.id,{enabled:false,variationMinutes:0,schedule:defaultSchedule()}),/principal|obrigatóri|desativar/i);
  assert.equal(db.snapshot().payrolls.length,0);
  db.close();
});

test('monthly holerite is only started after checking and closing the point sheet',()=>{
  const {db,employee}=setup();
  assert.throws(()=>db.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'}),/ponto|fechad/i);
  assert.throws(()=>db.generateMonthlyBatch({companyId:employee.companyId,competence:'2026-11',taxMode:'automatic'}),/ponto|fechad/i);
  const days=previewMonth('2026-11',defaultSchedule(),0).map(day=>day.kind==='work'?{...day,source:'manual' as const}:day);
  db.attendance.saveMatrix(days.map(day=>({employeeId:employee.id,competence:'2026-11',day})));
  db.attendance.close(employee.id,'2026-11');
  const record=db.applyTimeToPayroll(employee.id,'2026-11');
  assert.equal(record.kind,'monthly');
  assert.equal(record.employeeId,employee.id);
  db.close();
});
test('monthly timesheet persists manual marks, preserves edits when regenerating suggestions and closes',()=>{
  const {db,company,employee}=setup();
  const schedule=defaultSchedule();
  db.attendance.setConfig(company.id,{enabled:true,variationMinutes:7,schedule});
  const preview=db.attendance.autofill(employee.id,'2026-11');
  assert.equal(preview.days.length,30);
  assert.equal(preview.days[0].source,'suggested');
  const days=previewMonth('2026-11',schedule,0).map(day=>day.kind==='work'?{...day,source:'manual' as const}:day);
  db.attendance.saveMatrix(days.map(day=>({employeeId:employee.id,competence:'2026-11',day,expectedRevision:preview.revision})));
  const before=db.attendance.getSheet(employee.id,'2026-11');
  const after=db.attendance.autofill(employee.id,'2026-11');
  assert.deepEqual(after.days,before.days);
  assert.equal(db.attendance.close(employee.id,'2026-11').status,'closed');
  assert.throws(()=>db.attendance.saveMatrix([{employeeId:employee.id,competence:'2026-11',day:days[0]}]),/fechada/i);
  db.close();
});
test('closed point merges only into monthly draft, idempotently, preserving recurring entries',()=>{
  const {db,company,employee}=setup();
  const schedule=defaultSchedule();
  db.attendance.setConfig(company.id,{enabled:true,variationMinutes:0,schedule});
  const days=previewMonth('2026-11',schedule).map(day=>day.kind==='work'?{...day,source:'manual' as const}:day);
  const day=days.find(x=>x.date==='2026-11-03')!;
  day.end='18:00';
  db.attendance.saveMatrix(days.map(day=>({employeeId:employee.id,competence:'2026-11',day})));
  db.attendance.close(employee.id,'2026-11');
  const slip=db.applyTimeToPayroll(employee.id,'2026-11');
  assert.ok(slip.details.items.some(x=>x.code==='HEXTRA'));
  const again=db.applyTimeToPayroll(employee.id,'2026-11');
  assert.equal(slip.id,again.id);
  assert.equal(again.details.items.filter(x=>x.code==='HEXTRA').length,1);
  db.finalizePayroll(slip.id);
  assert.throws(()=>db.applyTimeToPayroll(employee.id,'2026-11'),/finalizado/i);
  db.close();
});

test('upgrading a database with disabled legacy opt-in enables point without losing schedule settings',()=>{
  const dir=mkdtempSync(join(tmpdir(),'point-core-'));
  const path=join(dir,'database.sqlite');
  try{
    const db=new HoleriteDatabase(path);
    const company=db.saveCompany({legalName:'Obras',tradeName:'',cnpj:'',address:''});
    const employee=db.saveEmployee({companyId:company.id,name:'Trabalhador',cpf:'',role:'Auxiliar',
      admissionDate:'2026-01-01',salaryCents:220000,dependents:0,active:true});
    db.attendance.setConfig(company.id,{enabled:true,variationMinutes:7,schedule:defaultSchedule()});
    db.close();
    const legacy=new DatabaseSync(path);
    legacy.prepare('UPDATE time_configs SET enabled=0 WHERE company_id=?').run(company.id);
    legacy.close();
    const upgraded=new HoleriteDatabase(path);
    assert.equal(upgraded.attendance.getConfig(company.id).enabled,true);
    assert.equal(upgraded.attendance.getConfig(company.id).variationMinutes,7);
    assert.equal(upgraded.attendance.getSheet(employee.id,'2026-11').status,'draft');
    upgraded.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
