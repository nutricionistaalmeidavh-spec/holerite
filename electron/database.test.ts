import assert from 'node:assert/strict';
import test from 'node:test';
import { HoleriteDatabase } from './database';

const createExample = () => {
  const store = new HoleriteDatabase(':memory:');
  const company = store.saveCompany({legalName:'Construtora Modelo Ltda',tradeName:'Modelo',cnpj:'11222333000181',address:'Rua Um'});
  const employee = store.saveEmployee({companyId:company.id,name:'Ana Exemplo',cpf:'12345678909',role:'Técnica',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
  return {store, company, employee};
};
test('persists company, employee and payroll with exactly one canonical calculation', () => {
  const {store,company,employee} = createExample();
  const record = store.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'});
  assert.equal(store.snapshot().payrolls.length, 1);
  assert.equal(record.details.company.legalName, company.legalName);
  assert.equal(record.details.totals.grossCents, 300000);
  assert.equal(record.details.totals.netCents, record.details.totals.grossCents - record.details.totals.deductionCents);
  assert.throws(() => store.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'}), /já existe/i);
  store.close();
});
test('finalized payroll is immutable and paid state is explicit', () => {
  const {store,employee}=createExample();
  const p=store.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'});
  const finalized=store.finalizePayroll(p.id);
  assert.equal(finalized.status,'finalized');
  assert.throws(() => store.savePayroll({id:p.id,employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'}), /finalizad|rascunho/i);
  const paid=store.markPaid(p.id);
  assert.equal(paid.status,'paid');
  assert.ok(paid.paidAt);
  assert.throws(() => store.deleteDraft(p.id), /rascunho/i);
  store.close();
});
test('saved receipt keeps a snapshot when employee salary changes', () => {
  const {store,employee}=createExample();
  const original=store.savePayroll({employeeId:employee.id,competence:'2026-11',entries:[],taxMode:'automatic'});
  store.finalizePayroll(original.id);
  store.saveEmployee({id:employee.id,companyId:employee.companyId,name:employee.name,cpf:employee.cpf,role:employee.role,admissionDate:employee.admissionDate,salaryCents:450000,dependents:0,active:true});
  assert.equal(store.getPayroll(original.id).details.employee.salaryCents,300000);
  assert.equal(store.getPayroll(original.id).details.totals.grossCents,300000);
  store.close();
});
