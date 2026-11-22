import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {assessMonth,defaultSchedule,previewMonth,validateDay,validateSchedule,validMonth,weekday,workedMinutes} from '../src/shared/time';
import type {PointDay,PointSummary,WorkSchedule} from '../src/shared/time';

export interface TimeConfig {enabled:boolean;variationMinutes:number;schedule:WorkSchedule;}
export interface TimeSheet {employeeId:string;companyId:string;competence:string;status:'draft'|'closed';revision:number;days:PointDay[];summary:PointSummary;closedAt:string|null;}
export interface MatrixChange {employeeId:string;competence:string;day:PointDay;expectedRevision?:number;}
type Row=Record<string,unknown>;
const now=()=>new Date().toISOString();
const json=<T>(raw:unknown)=>JSON.parse(String(raw)) as T;
function requiredId(id:string){if(!id||typeof id!=='string'||id.length>50)throw new Error('Identificador inválido.');return id;}
export class AttendanceStore {
  constructor(private db:DatabaseSync){
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_configs (
        company_id TEXT PRIMARY KEY REFERENCES companies(id),enabled INTEGER NOT NULL DEFAULT 0,
        variation_minutes INTEGER NOT NULL DEFAULT 0,schedule_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS time_employee_schedules (
        employee_id TEXT PRIMARY KEY REFERENCES employees(id),schedule_json TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS time_sheets (
        employee_id TEXT NOT NULL REFERENCES employees(id),company_id TEXT NOT NULL REFERENCES companies(id),
        competence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','closed')),
        revision INTEGER NOT NULL DEFAULT 0,closed_at TEXT,closed_snapshot_json TEXT,
        updated_at TEXT NOT NULL,PRIMARY KEY(employee_id,competence)
      );
      CREATE INDEX IF NOT EXISTS idx_time_sheets_company ON time_sheets(company_id,competence,status);
      CREATE TABLE IF NOT EXISTS time_days (
        employee_id TEXT NOT NULL,competence TEXT NOT NULL,date TEXT NOT NULL,
        kind TEXT NOT NULL,source TEXT NOT NULL,
        start TEXT NOT NULL DEFAULT '',break_start TEXT NOT NULL DEFAULT '',
        break_end TEXT NOT NULL DEFAULT '',end TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,
        PRIMARY KEY(employee_id,competence,date),
        FOREIGN KEY(employee_id,competence) REFERENCES time_sheets(employee_id,competence) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS time_audit (
        id TEXT PRIMARY KEY,employee_id TEXT NOT NULL,competence TEXT NOT NULL,date TEXT,
        action TEXT NOT NULL,before_json TEXT,after_json TEXT,reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_time_audit_person ON time_audit(employee_id,competence,created_at);
      CREATE TABLE IF NOT EXISTS time_import_batches (
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),
        filename TEXT NOT NULL,content_hash TEXT NOT NULL,processed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
  private employee(id:string):Row {
    const value=this.db.prepare('SELECT * FROM employees WHERE id=?').get(requiredId(id)) as Row|undefined;
    if(!value)throw new Error('Funcionário não encontrado.');
    return value;
  }
  getConfig(companyId:string):TimeConfig {
    const company=this.db.prepare('SELECT id FROM companies WHERE id=?').get(requiredId(companyId));
    if(!company)throw new Error('Empresa não encontrada.');
    const row=this.db.prepare('SELECT * FROM time_configs WHERE company_id=?').get(companyId) as Row|undefined;
    return row?{enabled:!!row.enabled,variationMinutes:Number(row.variation_minutes),schedule:json<WorkSchedule>(row.schedule_json)}:
      {enabled:false,variationMinutes:0,schedule:defaultSchedule()};
  }
  setConfig(companyId:string,config:TimeConfig):TimeConfig {
    const current=this.getConfig(companyId);
    if(typeof config.enabled!=='boolean'||!Number.isInteger(config.variationMinutes)||
       config.variationMinutes<0||config.variationMinutes>10)throw new Error('Configuração de ponto inválida.');
    const schedule=validateSchedule(config.schedule??current.schedule);
    this.db.prepare(`INSERT INTO time_configs(company_id,enabled,variation_minutes,schedule_json,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET enabled=excluded.enabled,
      variation_minutes=excluded.variation_minutes,schedule_json=excluded.schedule_json,updated_at=excluded.updated_at`
    ).run(companyId,config.enabled?1:0,config.variationMinutes,JSON.stringify(schedule),now());
    return this.getConfig(companyId);
  }
  getSchedule(employeeId:string):WorkSchedule {
    const employee=this.employee(employeeId);
    const row=this.db.prepare('SELECT schedule_json FROM time_employee_schedules WHERE employee_id=?').get(employeeId) as Row|undefined;
    return row?json<WorkSchedule>(row.schedule_json):this.getConfig(String(employee.company_id)).schedule;
  }
  setSchedule(employeeId:string,schedule:WorkSchedule):WorkSchedule {
    const employee=this.employee(employeeId);
    this.requireEnabled(String(employee.company_id));
    validateSchedule(schedule);
    this.db.prepare(`INSERT INTO time_employee_schedules(employee_id,schedule_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(employee_id) DO UPDATE SET schedule_json=excluded.schedule_json,updated_at=excluded.updated_at`
    ).run(employeeId,JSON.stringify(schedule),now());
    return this.getSchedule(employeeId);
  }
  private requireEnabled(companyId:string){if(!this.getConfig(companyId).enabled)throw new Error('Ative o módulo de ponto nas configurações da empresa.');}
  private readDays(employeeId:string,competence:string):PointDay[] {
    return (this.db.prepare('SELECT * FROM time_days WHERE employee_id=? AND competence=? ORDER BY date')
      .all(employeeId,competence) as Row[]).map(row=>({
      date:String(row.date),kind:String(row.kind) as PointDay['kind'],source:String(row.source) as PointDay['source'],
      start:String(row.start),breakStart:String(row.break_start),breakEnd:String(row.break_end),end:String(row.end),notes:String(row.notes)
    }));
  }
  getClosedSchedule(employeeId:string,competence:string):WorkSchedule {
    const sheet=this.getSheet(employeeId,competence);
    if(sheet.status!=='closed')throw new Error('Ficha ainda não fechada.');
    const row=this.db.prepare('SELECT closed_snapshot_json FROM time_sheets WHERE employee_id=? AND competence=?')
      .get(employeeId,competence) as Row;
    return json<{schedule:WorkSchedule}>(row.closed_snapshot_json).schedule;
  }
  bankBalance(employeeId:string,competence:string):number {
    const employee=this.employee(employeeId);
    this.requireEnabled(String(employee.company_id));
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const rows=this.db.prepare("SELECT closed_snapshot_json FROM time_sheets WHERE employee_id=? AND status='closed' AND competence<=?")
      .all(employeeId,competence) as Row[];
    return rows.reduce((total,row)=>total+Number(json<{summary:PointSummary}>(row.closed_snapshot_json).summary.bankMinutes||0),0);
  }
  getSheet(employeeId:string,competence:string):TimeSheet {
    const employee=this.employee(employeeId);
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const companyId=String(employee.company_id);
    this.requireEnabled(companyId);
    const row=this.db.prepare('SELECT * FROM time_sheets WHERE employee_id=? AND competence=?').get(employeeId,competence) as Row|undefined;
    const days=this.readDays(employeeId,competence);
    const snapshot=row?.closed_snapshot_json?json<{summary:PointSummary}>(row.closed_snapshot_json):null;
    return {employeeId,companyId,competence,status:row?.status==='closed'?'closed':'draft',revision:Number(row?.revision??0),
      days,summary:snapshot?.summary??assessMonth(days,this.getSchedule(employeeId),Number(employee.salary_cents)),
      closedAt:row?.closed_at?String(row.closed_at):null};
  }
  matrix(companyId:string,competence:string):Array<TimeSheet&{employeeName:string}> {
    this.requireEnabled(companyId);
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const employees=this.db.prepare('SELECT id,name FROM employees WHERE company_id=? AND active=1 ORDER BY name').all(companyId) as Row[];
    return employees.map(row=>({...this.getSheet(String(row.id),competence),employeeName:String(row.name)}));
  }
  private audit(employeeId:string,competence:string,action:string,before:unknown,after:unknown,reason='',date:string|null=null){
    this.db.prepare('INSERT INTO time_audit VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),employeeId,competence,date,
      action,before?JSON.stringify(before):null,after?JSON.stringify(after):null,reason,now());
  }
  auditHistory(employeeId:string,competence:string):Row[]{
    this.employee(employeeId);
    return this.db.prepare('SELECT date,action,before_json,after_json,reason,created_at FROM time_audit WHERE employee_id=? AND competence=? ORDER BY created_at DESC LIMIT 300').all(employeeId,competence) as Row[];
  }
  saveMatrix(changes:MatrixChange[],overwriteImported=false):number {
    if(!Array.isArray(changes)||!changes.length||changes.length>500)throw new Error('Informe de 1 a 500 dias.');
    const members=new Map<string,{companyId:string;revision:number}>();
    const keys=new Set<string>();
    for(const item of changes){
      if(!validMonth(item.competence)||!item.day.date.startsWith(item.competence+'-'))throw new Error('Data fora da competência.');
      validateDay(item.day);
      const key=item.employeeId+'|'+item.competence+'|'+item.day.date;
      if(keys.has(key))throw new Error('Registro repetido no lote.');
      keys.add(key);
      const employee=this.employee(item.employeeId);
      const companyId=String(employee.company_id);
      this.requireEnabled(companyId);
      const group=item.employeeId+'|'+item.competence;
      if(!members.has(group)){
        const old=this.getSheet(item.employeeId,item.competence);
        if(old.status==='closed')throw new Error('Ficha fechada. Solicite reabertura antes de alterar.');
        members.set(group,{companyId,revision:old.revision});
      }
      if(item.expectedRevision!==undefined&&item.expectedRevision!==members.get(group)?.revision)
        throw new Error('Ficha alterada por outra operação. Recarregue os dados.');
      const current=this.db.prepare('SELECT source FROM time_days WHERE employee_id=? AND competence=? AND date=?')
        .get(item.employeeId,item.competence,item.day.date) as Row|undefined;
      if(current?.source==='imported'&&item.day.source==='imported'&&!overwriteImported)
        throw new Error('Marcação importada já existente em '+item.day.date+'.');
    }
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for(const [group,member] of members){
        const [employeeId,competence]=group.split('|');
        this.db.prepare(`INSERT INTO time_sheets(employee_id,company_id,competence,revision,updated_at)
          VALUES(?,?,?,0,?) ON CONFLICT(employee_id,competence) DO NOTHING`).run(employeeId,member.companyId,competence,now());
        const latest=this.db.prepare('SELECT revision,status FROM time_sheets WHERE employee_id=? AND competence=?').get(employeeId,competence) as Row;
        if(latest.status==='closed'||Number(latest.revision)!==member.revision)
          throw new Error('Ficha modificada enquanto era salva.');
      }
      for(const {employeeId,competence,day} of changes){
        const old=this.db.prepare('SELECT * FROM time_days WHERE employee_id=? AND competence=? AND date=?')
          .get(employeeId,competence,day.date) as Row|undefined;
        this.db.prepare(`INSERT INTO time_days(employee_id,competence,date,kind,source,start,break_start,break_end,end,notes,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,competence,date) DO UPDATE SET
          kind=excluded.kind,source=excluded.source,start=excluded.start,break_start=excluded.break_start,
          break_end=excluded.break_end,end=excluded.end,notes=excluded.notes,updated_at=excluded.updated_at`
        ).run(employeeId,competence,day.date,day.kind,day.source,day.start,day.breakStart,day.breakEnd,day.end,day.notes,now());
        this.audit(employeeId,competence,old?'change':'create',old,day,'',day.date);
      }
      for(const group of members.keys()){
        const [id,competence]=group.split('|');
        this.db.prepare('UPDATE time_sheets SET revision=revision+1,updated_at=? WHERE employee_id=? AND competence=?')
          .run(now(),id,competence);
      }
      this.db.exec('COMMIT;');
      return changes.length;
    }catch(e){this.db.exec('ROLLBACK;');throw e;}
  }
  autofill(employeeId:string,competence:string):TimeSheet {
    const sheet=this.getSheet(employeeId,competence);
    if(sheet.status==='closed')throw new Error('Ficha fechada.');
    const existing=new Set(sheet.days.map(d=>d.date));
    const config=this.getConfig(sheet.companyId);
    const rows=previewMonth(competence,this.getSchedule(employeeId),config.variationMinutes)
      .filter(day=>!existing.has(day.date)).map(day=>({employeeId,competence,day,expectedRevision:sheet.revision}));
    // Reopening or refreshing never overwrites actual / imported punches.
    if(rows.length)this.saveMatrix(rows);
    return this.getSheet(employeeId,competence);
  }
  close(employeeId:string,competence:string):TimeSheet {
    const sheet=this.getSheet(employeeId,competence);
    if(sheet.status==='closed')return sheet;
    const schedule=this.getSchedule(employeeId);
    const dates=previewMonth(competence,schedule,0);
    const recorded=new Map(sheet.days.map(d=>[d.date,d]));
    for(const date of dates){
      if(!schedule.weekdays.includes(weekday(date.date)))continue;
      const day=recorded.get(date.date);
      if(!day||day.source==='suggested'||(day.kind==='work'&&!day.start))
        throw new Error('Dia '+date.date+' sem marcação real ou ocorrência confirmada.');
    }
    if(sheet.summary.suggestedDays && !sheet.days.every(day=>day.source!=='suggested'||day.kind!=='work'))
      throw new Error('Existem marcações sugeridas ainda não confirmadas.');
    const snapshot={summary:sheet.summary,schedule,days:sheet.days,salaryCents:Number(this.employee(employeeId).salary_cents)};
    const result=this.db.prepare(`UPDATE time_sheets SET status='closed',closed_at=?,closed_snapshot_json=?,
      revision=revision+1,updated_at=? WHERE employee_id=? AND competence=? AND revision=? AND status='draft'`
    ).run(now(),JSON.stringify(snapshot),now(),employeeId,competence,sheet.revision);
    if(Number(result.changes)!==1)throw new Error('Ficha mudou durante o fechamento.');
    this.audit(employeeId,competence,'close',null,snapshot);
    return this.getSheet(employeeId,competence);
  }
  reopen(employeeId:string,competence:string,reason:string):TimeSheet {
    if(typeof reason!=='string'||reason.trim().length<8)throw new Error('Justificativa de reabertura obrigatória (mínimo 8 caracteres).');
    const sheet=this.getSheet(employeeId,competence);
    if(sheet.status!=='closed')throw new Error('Ficha não está fechada.');
    const payroll=this.db.prepare("SELECT status,details_json FROM payrolls WHERE employee_id=? AND competence=? AND kind='monthly'")
      .get(employeeId,competence) as Row|undefined;
    if(payroll&&String(payroll.details_json).includes('ponto-'+competence+'-'))
      throw new Error('Remova a integração com o holerite antes de reabrir esta ficha.');
    this.db.prepare(`UPDATE time_sheets SET status='draft',closed_at=NULL,closed_snapshot_json=NULL,
      revision=revision+1,updated_at=? WHERE employee_id=? AND competence=?`).run(now(),employeeId,competence);
    this.audit(employeeId,competence,'reopen',null,null,reason.trim());
    return this.getSheet(employeeId,competence);
  }
  hasImportedHash(companyId:string,hash:string):boolean {
    return !!this.db.prepare('SELECT id FROM time_import_batches WHERE company_id=? AND content_hash=?').get(companyId,hash);
  }
  recordImport(companyId:string,filename:string,hash:string,processed:number){
    this.requireEnabled(companyId);
    if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isInteger(processed)||processed<1)throw new Error('Importação inválida.');
    if(this.db.prepare('SELECT id FROM time_import_batches WHERE company_id=? AND content_hash=?').get(companyId,hash))
      throw new Error('Este mesmo arquivo já foi importado. Verifique o histórico antes de repetir.');
    this.db.prepare('INSERT INTO time_import_batches VALUES(?,?,?,?,?,?)')
      .run(randomUUID(),companyId,filename.slice(0,200),hash,processed,now());
  }
  importHistory(companyId:string):Row[]{
    this.requireEnabled(companyId);
    return this.db.prepare('SELECT filename,processed,created_at FROM time_import_batches WHERE company_id=? ORDER BY created_at DESC LIMIT 30')
      .all(companyId) as Row[];
  }
}
