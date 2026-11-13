import assert from 'node:assert/strict';
import test from 'node:test';
import { HoleriteDatabase } from './database';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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

test('migrates legacy SQLite receipts without destroying historical data or blocking special receipts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'artisys-holerites-migration-'));
  try{
    const filename=join(dir,'legacy.sqlite');
    const previous=new DatabaseSync(filename);
    previous.exec(`
      CREATE TABLE companies(id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT NOT NULL, cnpj TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE employees(id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), name TEXT NOT NULL, cpf TEXT NOT NULL, role TEXT NOT NULL, admission_date TEXT NOT NULL, salary_cents INTEGER NOT NULL, dependents INTEGER NOT NULL, active INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE payrolls(id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), employee_id TEXT NOT NULL REFERENCES employees(id), competence TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','finalized','paid')),paid_at TEXT, details_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(employee_id, competence));
      INSERT INTO companies VALUES('old-c','Empresa Histórica','Histórica','','','2026-01-01');
      INSERT INTO employees VALUES('old-e','old-c','Registro Existente','','Analista','2025-01-01',300000,0,1,'2026-01-01');
      INSERT INTO payrolls VALUES('old-p','old-c','old-e','2026-11','finalized',NULL,'{}','2026-11-01','2026-11-01');
    `);
    previous.close();
    const store=new HoleriteDatabase(filename);
    assert.equal(store.getPayroll('old-p').kind,'monthly');
    assert.equal(store.getPayroll('old-p').status,'finalized');
    assert.equal(store.snapshot().companies.length,1);
    const vacation=store.savePayroll({employeeId:'old-e',competence:'2026-11',kind:'vacation',taxMode:'automatic',entries:[],
      options:{vacation:{startDate:'2026-11-10',days:30,soldDays:0,acquisitionStart:'2025-01-01'}}});
    assert.equal(vacation.kind,'vacation');
    assert.equal(store.snapshot().payrolls.length,2);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('13th installments have one entry per employee and year even with differing competence',()=>{
  const {store,employee}=createExample();
  const original=store.savePayroll({employeeId:employee.id,competence:'2026-08',kind:'thirteenth-first',taxMode:'automatic',entries:[],options:{thirteenth:{months:12,advanceCents:0}}});
  assert.equal(original.kind,'thirteenth-first');
  assert.throws(()=>store.savePayroll({employeeId:employee.id,competence:'2026-11',kind:'thirteenth-first',taxMode:'automatic',entries:[],options:{thirteenth:{months:12,advanceCents:0}}}),/já existe/i);
  store.close();
});
