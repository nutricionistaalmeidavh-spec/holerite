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
  days.find(day=>day.date==='2026-11-03')!.end='18:00';
  db.attendance.saveMatrix(days.map(day=>({employeeId:employee.id,competence:'2026-11',day})));
  db.attendance.close(employee.id,'2026-11');
  // Even a direct monthly-editor submission cannot silently omit the closed point results.
  const record=db.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'});
  assert.equal(record.kind,'monthly');
  assert.equal(record.employeeId,employee.id);
  assert.equal(record.details.items.filter(item=>item.code==='HEXTRA').length,1);
  const linked=db.applyTimeToPayroll(employee.id,'2026-11');
  assert.equal(linked.id,record.id);
  assert.equal(linked.details.items.filter(item=>item.code==='HEXTRA').length,1);
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

test('bulk review confirms generated monthly rows in one action and retains their provenance',()=>{
  const {db,company,employee}=setup();
  db.attendance.setConfig(company.id,{enabled:true,variationMinutes:7,schedule:defaultSchedule()});
  const generated=db.attendance.autofill(employee.id,'2026-11');
  const expected=generated.days.find(x=>x.date==='2026-11-03')!;
  assert.equal(expected.source,'suggested');
  assert.equal(generated.summary.workedMinutes,0);
  const result=db.attendance.reviewSuggestions([employee.id],'2026-11');
  assert.equal(result.reviewed,30);
  assert.equal(result.employees,1);
  const sheet=db.attendance.getSheet(employee.id,'2026-11');
  assert.equal(sheet.days.find(x=>x.date==='2026-11-03')?.source,'reviewed');
  assert.equal(sheet.days.find(x=>x.date==='2026-11-03')?.start,expected.start);
  assert.ok(sheet.summary.workedMinutes>0);
  assert.equal(sheet.summary.suggestedDays,0);
  assert.equal(db.attendance.reviewSuggestions([employee.id],'2026-11').reviewed,0);
  const audit=db.attendance.auditHistory(employee.id,'2026-11');
  assert.ok(audit.some(x=>x.action==='bulk-review'));
  db.close();
});

test('bulk review does not overwrite manual or imported records in a team',()=>{
  const {db,company,employee}=setup();
  const teammate=db.saveEmployee({companyId:company.id,name:'Outra',cpf:'98765432100',role:'Auxiliar',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
  db.attendance.autofill(employee.id,'2026-11');
  db.attendance.autofill(teammate.id,'2026-11');
  const original=db.attendance.getSheet(employee.id,'2026-11');
  const manual={...original.days.find(x=>x.date==='2026-11-03')!,source:'manual' as const,start:'07:30'};
  db.attendance.saveMatrix([{employeeId:employee.id,competence:'2026-11',day:manual}]);
  const output=db.attendance.reviewSuggestions([employee.id,teammate.id],'2026-11');
  assert.equal(output.employees,2);
  assert.equal(output.reviewed,59);
  assert.deepEqual(db.attendance.getSheet(employee.id,'2026-11').days.find(x=>x.date==='2026-11-03'),manual);
  assert.equal(db.attendance.getSheet(teammate.id,'2026-11').days.find(x=>x.date==='2026-11-03')?.source,'reviewed');
  db.close();
});

test('closing and monthly slip do not require daily confirmations or a prior closed sheet',()=>{
  const {db,employee}=setup();
  db.attendance.autofill(employee.id,'2026-11');
  const unreviewed=db.attendance.getSheet(employee.id,'2026-11');
  assert.ok(unreviewed.summary.suggestedDays>0);
  const slip=db.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'});
  assert.equal(slip.kind,'monthly');
  assert.ok(!slip.details.items.some(x=>x.code==='HEXTRA'));
  const updated=db.applyTimeToPayroll(employee.id,'2026-11');
  assert.equal(updated.id,slip.id);
  const closed=db.attendance.close(employee.id,'2026-11');
  assert.equal(closed.status,'closed');
  assert.equal(closed.summary.workedMinutes,0);
  assert.ok(closed.summary.suggestedDays>0);
  db.close();
});
