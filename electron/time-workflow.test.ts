import assert from 'node:assert/strict';
import test from 'node:test';
import {HoleriteDatabase} from './database';
import {defaultSchedule,previewMonth} from '../src/shared/time';

const setup=()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Exemplo',tradeName:'',cnpj:'',address:''});
  const employee=db.saveEmployee({companyId:company.id,name:'Ana',cpf:'12345678909',role:'Operadora',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
  return {db,company,employee};
};
test('optional module stays disabled until explicitly enabled, never touches payroll',()=>{
  const {db,company,employee}=setup();
  assert.equal(db.attendance.getConfig(company.id).enabled,false);
  assert.throws(()=>db.attendance.getSheet(employee.id,'2026-11'),/Ative o módulo/);
  assert.equal(db.snapshot().payrolls.length,0);
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
