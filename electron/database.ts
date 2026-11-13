import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { calculatePayroll } from '../src/shared/payroll';
import {calculateSpecialPayroll} from '../src/shared/special';
import type {PayrollKind} from '../src/shared/special';
import type {Company, CompanyInput, Employee, EmployeeInput, MonthlyBatchInput, MonthlyBatchResult, PayrollDetails, PayrollInput, PayrollRecord, PayrollStatus, StateSnapshot} from '../src/shared/types';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const required = (value: unknown, label: string, limit=150): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw new Error(`${label} obrigatório (até ${limit} caracteres).`);
  return value.trim();
};
const optional = (value: unknown, label: string, limit=150): string => {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${label} inválido.`);
  return value.trim();
};
const cents = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000_000_00) throw new Error(`${label} inválido.`);
  return value;
};
const digits = (value: string) => value.replace(/\D/g,'');
const parseJSON = <T>(value: unknown): T => JSON.parse(String(value)) as T;

export class HoleriteDatabase {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, {timeout: 5000});
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT NOT NULL,
        cnpj TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL, cpf TEXT NOT NULL, role TEXT NOT NULL, admission_date TEXT NOT NULL,
        salary_cents INTEGER NOT NULL CHECK(salary_cents > 0),
        dependents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payrolls (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
        employee_id TEXT NOT NULL REFERENCES employees(id), competence TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'monthly' CHECK(kind IN ('monthly','vacation','thirteenth-first','thirteenth-second','termination')),
        status TEXT NOT NULL CHECK(status IN ('draft','finalized','paid')),
        paid_at TEXT, details_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(employee_id, competence, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_payroll_company_competence ON payrolls(company_id, competence);
    `);
    this.migrateEmployeeProfiles();
    this.migrateOldPayrolls();
  }
  private migrateEmployeeProfiles() {
    // Migração aditiva: os cadastros e recibos antigos permanecem intocados.
    const cols=new Set((this.db.prepare('PRAGMA table_info(employees)').all() as Row[]).map(c=>String(c.name)));
    const added=[
      ['registration',"TEXT NOT NULL DEFAULT ''"],
      ['pis',"TEXT NOT NULL DEFAULT ''"],
      ['work_hours',"TEXT NOT NULL DEFAULT ''"],
      ['bank_name',"TEXT NOT NULL DEFAULT ''"],
      ['bank_branch',"TEXT NOT NULL DEFAULT ''"],
      ['bank_account',"TEXT NOT NULL DEFAULT ''"],
      ['pix_key',"TEXT NOT NULL DEFAULT ''"],
      ['recurring_entries_json',"TEXT NOT NULL DEFAULT '[]'"]
    ] as const;
    for(const [name,definition] of added) if(!cols.has(name)) this.db.exec(`ALTER TABLE employees ADD COLUMN ${name} ${definition};`);
  }
  private migrateOldPayrolls() {
    const cols=this.db.prepare('PRAGMA table_info(payrolls)').all() as Row[];
    if(cols.some(c=>c.name==='kind'))return;
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.exec(`CREATE TABLE payrolls_v2 (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id),
        employee_id TEXT NOT NULL REFERENCES employees(id), competence TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'monthly' CHECK(kind IN ('monthly','vacation','thirteenth-first','thirteenth-second','termination')),
        status TEXT NOT NULL CHECK(status IN ('draft','finalized','paid')),
        paid_at TEXT, details_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(employee_id, competence, kind));
        INSERT INTO payrolls_v2(id,company_id,employee_id,competence,kind,status,paid_at,details_json,created_at,updated_at)
        SELECT id,company_id,employee_id,competence,'monthly',status,paid_at,details_json,created_at,updated_at FROM payrolls;
        DROP TABLE payrolls;
        ALTER TABLE payrolls_v2 RENAME TO payrolls;
        CREATE INDEX IF NOT EXISTS idx_payroll_company_competence ON payrolls(company_id, competence);`);
      this.db.exec('COMMIT;');
    } catch(error){this.db.exec('ROLLBACK;');throw error;}
  }
  close() {this.db.close();}
  async backupTo(path: string): Promise<void> { await backup(this.db, path); }
  private companyFrom(row: Row): Company {
    return {id:String(row.id),legalName:String(row.legal_name),tradeName:String(row.trade_name),cnpj:String(row.cnpj),address:String(row.address),createdAt:String(row.created_at)};
  }
  private employeeFrom(row: Row): Employee {
    return {id:String(row.id),companyId:String(row.company_id),name:String(row.name),cpf:String(row.cpf),role:String(row.role),admissionDate:String(row.admission_date),registration:String(row.registration??''),pis:String(row.pis??''),workHours:String(row.work_hours??''),bankName:String(row.bank_name??''),bankBranch:String(row.bank_branch??''),bankAccount:String(row.bank_account??''),pixKey:String(row.pix_key??''),recurringEntries:parseJSON<Employee['recurringEntries']>(row.recurring_entries_json??'[]'),salaryCents:Number(row.salary_cents),dependents:Number(row.dependents),active:!!row.active,createdAt:String(row.created_at)};
  }
  private payrollFrom(row: Row): PayrollRecord {
    return {id:String(row.id),companyId:String(row.company_id),employeeId:String(row.employee_id),competence:String(row.competence),kind:String(row.kind??'monthly') as PayrollKind,status:String(row.status) as PayrollStatus,paidAt:row.paid_at ? String(row.paid_at):null,details:parseJSON<PayrollDetails>(row.details_json),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};
  }
  snapshot(): StateSnapshot {
    return {
      companies: (this.db.prepare('SELECT * FROM companies ORDER BY legal_name').all() as Row[]).map(r=>this.companyFrom(r)),
      employees: (this.db.prepare('SELECT * FROM employees ORDER BY name').all() as Row[]).map(r=>this.employeeFrom(r)),
      payrolls: (this.db.prepare('SELECT * FROM payrolls ORDER BY competence DESC, created_at DESC').all() as Row[]).map(r=>this.payrollFrom(r))
    };
  }
  getCompany(id:string): Company {
    const row=this.db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Empresa não encontrada.');
    return this.companyFrom(row);
  }
  getEmployee(id:string): Employee {
    const row=this.db.prepare('SELECT * FROM employees WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Funcionário não encontrado.');
    return this.employeeFrom(row);
  }
  getPayroll(id:string): PayrollRecord {
    const row=this.db.prepare('SELECT * FROM payrolls WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('Holerite não encontrado.');
    return this.payrollFrom(row);
  }
  saveCompany(input: CompanyInput & {id?:string}): Company {
    if (!input || typeof input !== 'object') throw new Error('Dados da empresa inválidos.');
    const legalName=required(input.legalName,'Razão social');
    const tradeName=optional(input.tradeName,'Nome fantasia');
    const cnpj=digits(optional(input.cnpj,'CNPJ',20));
    if (cnpj && cnpj.length!==14) throw new Error('O CNPJ deve conter 14 dígitos.');
    const address=optional(input.address,'Endereço',250);
    const id=input.id ? required(input.id,'ID',50):randomUUID();
    const previous=input.id ? this.getCompany(id) : null;
    const createdAt=previous?.createdAt ?? now();
    this.db.prepare(`INSERT INTO companies(id,legal_name,trade_name,cnpj,address,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET legal_name=excluded.legal_name, trade_name=excluded.trade_name, cnpj=excluded.cnpj, address=excluded.address`
    ).run(id,legalName,tradeName,cnpj,address,createdAt);
    return this.getCompany(id);
  }
  saveEmployee(input: EmployeeInput & {id?:string}): Employee {
    if (!input || typeof input !== 'object') throw new Error('Dados do funcionário inválidos.');
    const companyId=required(input.companyId,'Empresa',50);
    this.getCompany(companyId);
    const name=required(input.name,'Nome do funcionário');
    const cpf=digits(optional(input.cpf,'CPF',20));
    if (cpf && cpf.length!==11) throw new Error('O CPF deve conter 11 dígitos.');
    const role=required(input.role,'Cargo');
    const admissionDate=required(input.admissionDate,'Admissão',10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(admissionDate) || Number.isNaN(Date.parse(admissionDate))) throw new Error('Data de admissão inválida.');
    const salaryCents=cents(input.salaryCents,'Salário');
    if (salaryCents === 0) throw new Error('O salário deve ser positivo.');
    const dependents=input.dependents;
    if (!Number.isInteger(dependents) || dependents<0 || dependents>30) throw new Error('Número de dependentes inválido.');
    if (typeof input.active !== 'boolean') throw new Error('Situação do funcionário inválida.');
    const id=input.id ? required(input.id,'ID',50):randomUUID();
    const previous=input.id ? this.getEmployee(id) : null;
    const registration=optional(input.registration??previous?.registration??'','Matrícula',40);
    const pis=digits(optional(input.pis??previous?.pis??'','PIS/NIS',20));
    if(pis && pis.length!==11) throw new Error('PIS/NIS deve conter 11 dígitos.');
    const workHours=optional(input.workHours??previous?.workHours??'','Jornada',100);
    const bankName=optional(input.bankName??previous?.bankName??'','Banco',100);
    const bankBranch=optional(input.bankBranch??previous?.bankBranch??'','Agência',30);
    const bankAccount=optional(input.bankAccount??previous?.bankAccount??'','Conta',50);
    const pixKey=optional(input.pixKey??previous?.pixKey??'','Chave Pix',120);
    const recurringEntries=input.recurringEntries??previous?.recurringEntries??[];
    if(!Array.isArray(recurringEntries)||recurringEntries.length>100) throw new Error('Rubricas recorrentes inválidas.');
    calculatePayroll({salaryCents,dependents,competence:'2026-11',taxMode:'manual',entries:recurringEntries});
    if(cpf && this.db.prepare('SELECT id FROM employees WHERE company_id=? AND cpf=? AND id<>?').get(companyId,cpf,id))
      throw new Error('CPF já cadastrado nesta empresa.');
    if(registration && this.db.prepare('SELECT id FROM employees WHERE company_id=? AND registration=? AND id<>?').get(companyId,registration,id))
      throw new Error('Matrícula já cadastrada nesta empresa.');
    const createdAt=previous?.createdAt ?? now();
    this.db.prepare(`INSERT INTO employees(
      id,company_id,name,cpf,role,admission_date,salary_cents,dependents,active,created_at,
      registration,pis,work_hours,bank_name,bank_branch,bank_account,pix_key,recurring_entries_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,name=excluded.name,cpf=excluded.cpf,
      role=excluded.role,admission_date=excluded.admission_date,salary_cents=excluded.salary_cents,
      dependents=excluded.dependents,active=excluded.active,registration=excluded.registration,
      pis=excluded.pis,work_hours=excluded.work_hours,bank_name=excluded.bank_name,
      bank_branch=excluded.bank_branch,bank_account=excluded.bank_account,pix_key=excluded.pix_key,
      recurring_entries_json=excluded.recurring_entries_json`
    ).run(id,companyId,name,cpf,role,admissionDate,salaryCents,dependents,input.active ? 1:0,createdAt,
      registration,pis,workHours,bankName,bankBranch,bankAccount,pixKey,JSON.stringify(recurringEntries));
    return this.getEmployee(id);
  }
  savePayroll(input: PayrollInput): PayrollRecord {
    if (!input || typeof input !== 'object') throw new Error('Dados da folha inválidos.');
    const employee=this.getEmployee(required(input.employeeId,'Funcionário',50));
    const company=this.getCompany(employee.companyId);
    const id=input.id ? required(input.id,'ID',50) : randomUUID();
    const original=input.id ? this.getPayroll(id) : null;
    if (original && original.status !== 'draft') throw new Error('Holerite finalizado não pode ser alterado. Apenas rascunhos são editáveis.');
    if (original && original.employeeId !== employee.id) throw new Error('Não é permitido alterar o funcionário de uma folha existente.');
    const salaryCents=input.salaryOverrideCents == null ? employee.salaryCents : cents(input.salaryOverrideCents,'Salário do holerite');
    const kind=input.kind??'monthly';
    if(!['monthly','vacation','thirteenth-first','thirteenth-second','termination'].includes(kind))throw new Error('Tipo de folha inválido.');
    if(original && original.kind!==kind)throw new Error('Não é possível alterar o tipo de uma folha existente.');
    const calculation=kind==='monthly' ? calculatePayroll({salaryCents,competence:input.competence,dependents:employee.dependents,entries:input.entries,taxMode:input.taxMode}) :
      calculateSpecialPayroll({salaryCents,competence:input.competence,admissionDate:employee.admissionDate,dependents:employee.dependents,entries:input.entries,taxMode:input.taxMode,kind,options:input.options??{}});
    const details: PayrollDetails = {...calculation,salaryCents,kind,options:input.options,employee:{...employee},company:{...company},competence:input.competence,taxMode:input.taxMode};
    const already=this.db.prepare('SELECT id FROM payrolls WHERE employee_id=? AND competence=? AND kind=?').get(employee.id,input.competence,kind) as Row | undefined;
    if (already && String(already.id)!==id) throw new Error('Já existe um holerite para este funcionário nesta competência.');
    if(kind==='thirteenth-first'||kind==='thirteenth-second'){
      const other=this.db.prepare("SELECT id FROM payrolls WHERE employee_id=? AND kind=? AND substr(competence,1,4)=? AND id<>?").get(employee.id,kind,input.competence.slice(0,4),id) as Row|undefined;
      if(other)throw new Error('Já existe esta parcela do 13º para o funcionário no mesmo ano.');
    }
    const updatedAt=now();
    this.db.prepare(`INSERT INTO payrolls(id,company_id,employee_id,competence,kind,status,paid_at,details_json,created_at,updated_at)
      VALUES(?,?,?,?,?,'draft',NULL,?,?,?)
      ON CONFLICT(id) DO UPDATE SET competence=excluded.competence, details_json=excluded.details_json, updated_at=excluded.updated_at`
    ).run(id,company.id,employee.id,input.competence,kind,JSON.stringify(details),original?.createdAt ?? updatedAt,updatedAt);
    return this.getPayroll(id);
  }
  generateMonthlyBatch(input:MonthlyBatchInput):MonthlyBatchResult {
    if(!input || typeof input!=='object') throw new Error('Dados do lote inválidos.');
    const companyId=required(input.companyId,'Empresa',50);
    this.getCompany(companyId);
    const competence=required(input.competence,'Competência',7);
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error('Competência inválida.');
    if(input.taxMode!=='manual'&&input.taxMode!=='automatic') throw new Error('Modo tributário inválido.');
    if(input.taxMode==='automatic'&&!competence.startsWith('2026-'))
      throw new Error('Cálculo automático disponível apenas para competências de 2026.');
    const rows=this.db.prepare('SELECT * FROM employees WHERE company_id=? AND active=1 ORDER BY name').all(companyId) as Row[];
    let created=0,skipped=0;
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for(const row of rows) {
        const employee=this.employeeFrom(row);
        const existing=this.db.prepare("SELECT id FROM payrolls WHERE employee_id=? AND competence=? AND kind='monthly'").get(employee.id,competence);
        if(existing){skipped++;continue;}
        this.savePayroll({employeeId:employee.id,competence,kind:'monthly',taxMode:input.taxMode,entries:employee.recurringEntries??[]});
        created++;
      }
      this.db.exec('COMMIT;');
      return {created,skipped};
    } catch(error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }
  finalizePayroll(id:string): PayrollRecord {
    const record=this.getPayroll(required(id,'ID',50));
    if (record.status !== 'draft') throw new Error('Somente rascunhos podem ser finalizados.');
    this.db.prepare("UPDATE payrolls SET status='finalized',updated_at=? WHERE id=?").run(now(),id);
    return this.getPayroll(id);
  }
  markPaid(id:string): PayrollRecord {
    const record=this.getPayroll(required(id,'ID',50));
    if (record.status !== 'finalized') throw new Error('Finalize o holerite antes de registrar o pagamento.');
    const date=now();
    this.db.prepare("UPDATE payrolls SET status='paid',paid_at=?,updated_at=? WHERE id=?").run(date,date,id);
    return this.getPayroll(id);
  }
  deleteDraft(id:string): void {
    const record=this.getPayroll(required(id,'ID',50));
    if (record.status !== 'draft') throw new Error('Somente rascunhos podem ser excluídos.');
    this.db.prepare('DELETE FROM payrolls WHERE id=?').run(id);
  }
}
