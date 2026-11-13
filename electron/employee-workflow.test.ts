import assert from 'node:assert/strict';
import test from 'node:test';
import {HoleriteDatabase} from './database';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const entry = {id:'bonus',code:'BON',description:'Adicional recorrente',kind:'earning' as const,amountCents:12000,inssBase:true,irBase:true,fgtsBase:true};
const employeeInput = (companyId:string, name:string, cpf:string) => ({
  companyId,name,cpf,role:'Operador',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true
});

test('persist complete employee profile and retain it after database reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'holerites-profile-'));
  const path=join(dir,'test.sqlite');
  try{
    let db=new HoleriteDatabase(path);
    const company=db.saveCompany({legalName:'Empresa Modelo Ltda',tradeName:'Modelo',cnpj:'',address:''});
    const employee=db.saveEmployee({...employeeInput(company.id,'Ana Modelo','12345678909'),
      registration:'M-0042',pis:'12345678901',workHours:'44 horas semanais',
      bankName:'Banco de exemplo',bankBranch:'1234',bankAccount:'9999-0',pixKey:'ana@example.test',
      recurringEntries:[entry]});
    assert.equal(employee.registration,'M-0042');
    db.close();
    db=new HoleriteDatabase(path);
    const recovered=db.getEmployee(employee.id);
    assert.equal(recovered.pis,'12345678901');
    assert.equal(recovered.bankAccount,'9999-0');
    assert.deepEqual(recovered.recurringEntries,[entry]);
    db.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('migration adds new employee fields without deleting old data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'holerites-legacy-employees-'));
  const path=join(dir,'legacy.sqlite');
  try{
    const legacy=new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE companies(id TEXT PRIMARY KEY,legal_name TEXT NOT NULL,trade_name TEXT NOT NULL,cnpj TEXT NOT NULL,address TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE employees(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,cpf TEXT NOT NULL,role TEXT NOT NULL,admission_date TEXT NOT NULL,salary_cents INTEGER NOT NULL,dependents INTEGER NOT NULL,active INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE payrolls(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),employee_id TEXT NOT NULL REFERENCES employees(id),competence TEXT NOT NULL,status TEXT NOT NULL,paid_at TEXT,details_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(employee_id,competence));
      INSERT INTO companies VALUES('company','Empregador','Empregador','','','2026-01-01');
      INSERT INTO employees VALUES('employee','company','Legado','12345678909','Auxiliar','2025-01-01',300000,0,1,'2025-01-01');
    `);
    legacy.close();
    const db=new HoleriteDatabase(path);
    assert.equal(db.getEmployee('employee').name,'Legado');
    assert.equal(db.getEmployee('employee').registration,'');
    assert.deepEqual(db.getEmployee('employee').recurringEntries,[]);
    db.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('reject duplicate CPF and registration within the same company',()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
  db.saveEmployee({...employeeInput(company.id,'Primeira','12345678909'),registration:'01'});
  assert.throws(()=>db.saveEmployee(employeeInput(company.id,'Segunda','12345678909')),/CPF.*cadastrad/i);
  assert.throws(()=>db.saveEmployee({...employeeInput(company.id,'Terceira',''),registration:'01'}),/matrícula.*cadastrad/i);
  db.close();
});

test('generate month in batch only for active missing employees and reuse recurring entries',()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
  const first=db.saveEmployee({...employeeInput(company.id,'Ana','12345678909'),recurringEntries:[entry]});
  const second=db.saveEmployee(employeeInput(company.id,'Bruno',''));
  db.saveEmployee({...employeeInput(company.id,'Inativo',''),active:false});
  const manual=db.savePayroll({employeeId:first.id,competence:'2026-11',entries:[],taxMode:'manual'});
  const count=db.generateMonthlyBatch({companyId:company.id,competence:'2026-11',taxMode:'automatic'});
  assert.deepEqual(count,{created:1,skipped:1});
  assert.equal(db.snapshot().payrolls.length,2);
  const fresh=db.getPayroll(db.snapshot().payrolls.find(p=>p.employeeId===second.id)!.id);
  assert.equal(fresh.details.totals.grossCents,300000);
  assert.equal(db.getPayroll(manual.id).details.totals.grossCents,300000);
  assert.deepEqual(db.generateMonthlyBatch({companyId:company.id,competence:'2026-11',taxMode:'automatic'}),{created:0,skipped:2});
  const next=db.generateMonthlyBatch({companyId:company.id,competence:'2026-12',taxMode:'automatic'});
  assert.deepEqual(next,{created:2,skipped:0});
  const newSlip=db.snapshot().payrolls.find(p=>p.employeeId===first.id&&p.competence==='2026-12')!;
  assert.equal(newSlip.details.totals.grossCents,312000);
  assert.ok(newSlip.details.items.some(i=>i.code==='BON'&&i.amountCents===12000));
  db.saveEmployee({...employeeInput(company.id,'Ana','12345678909'),id:first.id,registration:'NOVO',salaryCents:450000,recurringEntries:[]});
  assert.equal(db.getPayroll(newSlip.id).details.totals.grossCents,312000);
  db.close();
});

test('invalid batch competence must not create partial documents',()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
  db.saveEmployee(employeeInput(company.id,'Ana','12345678909'));
  assert.throws(()=>db.generateMonthlyBatch({companyId:company.id,competence:'2025-12',taxMode:'automatic'}),/2026|competência/i);
  assert.equal(db.snapshot().payrolls.length,0);
  db.close();
});

test('legacy employee edits preserve existing extra fields when omitted',()=>{
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
  const original=db.saveEmployee({...employeeInput(company.id,'Ana','12345678909'),
    registration:'M-31',bankAccount:'0001-9',recurringEntries:[entry]});
  db.saveEmployee({...employeeInput(company.id,'Ana Atualizada','12345678909'),id:original.id,salaryCents:360000});
  const current=db.getEmployee(original.id);
  assert.equal(current.registration,'M-31');
  assert.equal(current.bankAccount,'0001-9');
  assert.equal(current.salaryCents,360000);
  assert.deepEqual(current.recurringEntries,[entry]);
  db.close();
});
