import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {assessMonth,defaultSchedule,previewMonth,validateDay,validateSchedule,validMonth,weekday,workedMinutes,diagnosePointDays} from '../src/shared/time';
import type {PointDay,PointSummary,WorkSchedule,PointIssue} from '../src/shared/time';

export interface TimeConfig {enabled:boolean;variationMinutes:number;schedule:WorkSchedule;}
export interface TimeSheet {employeeId:string;companyId:string;competence:string;status:'draft'|'closed';revision:number;days:PointDay[];summary:PointSummary;issues:PointIssue[];closedAt:string|null;}
export interface MatrixChange {employeeId:string;competence:string;day:PointDay;expectedRevision?:number;}
type Row=Record<string,unknown>;
const now=()=>new Date().toISOString();
const json=<T>(raw:unknown)=>JSON.parse(String(raw)) as T;
function requiredId(id:string){if(!id||typeof id!=='string'||id.length>50)throw new Error('Identificador inválido.');return id;}
export class AttendanceStore {
  private auditActor:string|null=null;
  setAuditActor(id:string|null):void {this.auditActor=id;}
  constructor(private db:DatabaseSync){
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_configs (
        company_id TEXT PRIMARY KEY REFERENCES companies(id),enabled INTEGER NOT NULL DEFAULT 1,
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
      CREATE TABLE IF NOT EXISTS time_attachments (
        id TEXT PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),date TEXT NOT NULL,
        filename TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_point_attachments_employee ON time_attachments(employee_id,date);
      CREATE TABLE IF NOT EXISTS time_import_mappings (company_id TEXT NOT NULL REFERENCES companies(id),headers_json TEXT NOT NULL,mapping_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(company_id,headers_json));
      CREATE TABLE IF NOT EXISTS time_import_batches (
        id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),
        filename TEXT NOT NULL,content_hash TEXT NOT NULL,processed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const auditColumns=new Set((this.db.prepare('PRAGMA table_info(time_audit)').all() as Row[]).map(row=>String(row.name)));
    if(!auditColumns.has('actor_id'))this.db.exec('ALTER TABLE time_audit ADD COLUMN actor_id TEXT;');
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_time_import_company_hash ON time_import_batches(company_id,content_hash);
      CREATE INDEX IF NOT EXISTS idx_time_import_company_history ON time_import_batches(company_id,created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS idx_time_audit_page ON time_audit(employee_id,competence,created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS idx_time_sheets_employee_closed ON time_sheets(employee_id,status,competence);
      CREATE INDEX IF NOT EXISTS idx_time_days_month_employee ON time_days(competence,employee_id,date);`);
    // Backwards-compatible migration of the opt-in version: point is now the core.
    this.db.exec('UPDATE time_configs SET enabled=1 WHERE enabled<>1;');
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
    return row?{enabled:true,variationMinutes:Number(row.variation_minutes),schedule:json<WorkSchedule>(row.schedule_json)}:
      {enabled:true,variationMinutes:0,schedule:defaultSchedule()};
  }
  setConfig(companyId:string,config:TimeConfig):TimeConfig {
    const current=this.getConfig(companyId);
    if(config.enabled!==true)throw new Error('Controle de ponto é o módulo principal e não pode ser desativado.');
    if(!Number.isInteger(config.variationMinutes)||
       config.variationMinutes<0||config.variationMinutes>10)throw new Error('Configuração de ponto inválida.');
    const schedule=validateSchedule(config.schedule??current.schedule);
    this.db.prepare(`INSERT INTO time_configs(company_id,enabled,variation_minutes,schedule_json,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET enabled=excluded.enabled,
      variation_minutes=excluded.variation_minutes,schedule_json=excluded.schedule_json,updated_at=excluded.updated_at`
    ).run(companyId,1,config.variationMinutes,JSON.stringify(schedule),now());
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
  private requireEnabled(companyId:string){this.getConfig(companyId);}
  private dayFrom(row:Row):PointDay{return {
      date:String(row.date),kind:String(row.kind) as PointDay['kind'],source:String(row.source) as PointDay['source'],
      start:String(row.start),breakStart:String(row.break_start),breakEnd:String(row.break_end),end:String(row.end),notes:String(row.notes)
    };}
  private readDays(employeeId:string,competence:string):PointDay[] {
    return (this.db.prepare('SELECT * FROM time_days WHERE employee_id=? AND competence=? ORDER BY date').all(employeeId,competence) as Row[]).map(row=>this.dayFrom(row));
  }
  getClosedSchedule(employeeId:string,competence:string):WorkSchedule {
    const row=this.db.prepare("SELECT closed_snapshot_json FROM time_sheets WHERE employee_id=? AND competence=? AND status='closed'").get(employeeId,competence) as Row|undefined;
    if(!row?.closed_snapshot_json)throw new Error('Ficha ainda não fechada.');
    return json<{schedule:WorkSchedule}>(row.closed_snapshot_json).schedule;
  }
  bankBalance(employeeId:string,competence:string):number {
    const employee=this.employee(employeeId);
    this.requireEnabled(String(employee.company_id));
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const row=this.db.prepare("SELECT COALESCE(SUM(COALESCE(json_extract(closed_snapshot_json,'$.summary.bankMinutes'),0)),0) AS balance FROM time_sheets WHERE employee_id=? AND status='closed' AND competence<=?").get(employeeId,competence) as Row;
    return Number(row.balance);
  }
  getSheet(employeeId:string,competence:string):TimeSheet {
    const employee=this.employee(employeeId);
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const companyId=String(employee.company_id);
    this.requireEnabled(companyId);
    const row=this.db.prepare('SELECT * FROM time_sheets WHERE employee_id=? AND competence=?').get(employeeId,competence) as Row|undefined;
    const days=this.readDays(employeeId,competence);
    const snapshot=row?.closed_snapshot_json?json<{summary:PointSummary}>(row.closed_snapshot_json):null;
    const issueSchedule=row?.closed_snapshot_json
      ?json<{schedule:WorkSchedule}>(row.closed_snapshot_json).schedule:this.getSchedule(employeeId);
    return {employeeId,companyId,competence,status:row?.status==='closed'?'closed':'draft',revision:Number(row?.revision??0),
      days,issues:diagnosePointDays(days,issueSchedule,competence),summary:snapshot?.summary??assessMonth(days,this.getSchedule(employeeId),Number(employee.salary_cents)),
      closedAt:row?.closed_at?String(row.closed_at):null};
  }
  matrix(companyId:string,competence:string,page?:{offset:number;size:number}):Array<TimeSheet&{employeeName:string}> {
    this.requireEnabled(companyId);
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const config=this.getConfig(companyId);
    const size=page?Math.max(1,Math.min(250,Math.trunc(page.size))):-1;
    const offset=page?Math.max(0,Math.trunc(page.offset)):0;
    const employees=this.db.prepare(`SELECT e.id,e.name,e.salary_cents,es.schedule_json,s.status,s.revision,s.closed_at,s.closed_snapshot_json
      FROM employees e LEFT JOIN time_employee_schedules es ON es.employee_id=e.id
      LEFT JOIN time_sheets s ON s.employee_id=e.id AND s.competence=?
      WHERE e.company_id=? AND e.active=1 ORDER BY e.name,e.id LIMIT ? OFFSET ?`).all(competence,companyId,size,offset) as Row[];
    const groups=new Map<string,PointDay[]>();
    if(!employees.length)return [];
    const daysQuery=page?`SELECT d.* FROM (SELECT id FROM employees WHERE company_id=? AND active=1 ORDER BY name,id LIMIT ? OFFSET ?) e JOIN time_days d ON d.employee_id=e.id AND d.competence=? ORDER BY d.employee_id,d.date`:`SELECT d.* FROM employees e JOIN time_days d ON d.employee_id=e.id AND d.competence=? WHERE e.company_id=? AND e.active=1 ORDER BY e.id,d.date`;
    const daysStatement=this.db.prepare(daysQuery);
    const records=page?daysStatement.iterate(companyId,size,offset,competence):daysStatement.iterate(competence,companyId);
    for(const row of records){
      const id=String(row.employee_id);const list=groups.get(id)??[];list.push(this.dayFrom(row));groups.set(id,list);
    }
    return employees.map(row=>{
      const employeeId=String(row.id),days=groups.get(employeeId)??[];
      const snapshot=row.closed_snapshot_json?json<{summary:PointSummary;schedule:WorkSchedule}>(row.closed_snapshot_json):null;
      const schedule=snapshot?.schedule??(row.schedule_json?json<WorkSchedule>(row.schedule_json):config.schedule);
      return {employeeId,companyId,competence,employeeName:String(row.name),status:row.status==='closed'?'closed':'draft',revision:Number(row.revision??0),days,issues:diagnosePointDays(days,schedule,competence),summary:snapshot?.summary??assessMonth(days,schedule,Number(row.salary_cents)),closedAt:row.closed_at?String(row.closed_at):null};
    });
  }
  *matrixBatches(companyId:string,competence:string,size=100):IterableIterator<Array<TimeSheet&{employeeName:string}>>{
    const batchSize=Number.isSafeInteger(size)?Math.max(1,Math.min(250,size)):100;
    for(let offset=0;;offset+=batchSize){
      const batch=this.matrix(companyId,competence,{offset,size:batchSize});if(!batch.length)return;
      yield batch;if(batch.length<batchSize)return;
    }
  }
  overview(companyId:string,competence:string):{total:number;closed:number}{
    this.requireEnabled(companyId);if(!validMonth(competence))throw new Error('Competência inválida.');
    const row=this.db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN s.status='closed' THEN 1 ELSE 0 END),0) AS closed
      FROM employees e LEFT JOIN time_sheets s ON s.employee_id=e.id AND s.competence=? WHERE e.company_id=? AND e.active=1`).get(competence,companyId) as Row;
    return {total:Number(row.total),closed:Number(row.closed)};
  }
  private audit(employeeId:string,competence:string,action:string,before:unknown,after:unknown,reason='',date:string|null=null){
    this.db.prepare('INSERT INTO time_audit(id,employee_id,competence,date,action,before_json,after_json,reason,created_at,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),employeeId,competence,date,
      action,before?JSON.stringify(before):null,after?JSON.stringify(after):null,reason,now(),this.auditActor);
  }
  auditHistory(employeeId:string,competence:string):Row[]{
    this.employee(employeeId);
    return this.db.prepare('SELECT ta.date,ta.action,ta.before_json,ta.after_json,ta.reason,ta.created_at,ta.actor_id,op.name AS actor_name FROM time_audit ta LEFT JOIN time_operators op ON ta.actor_id=op.id WHERE ta.employee_id=? AND ta.competence=? ORDER BY ta.created_at DESC LIMIT 300').all(employeeId,competence) as Row[];
  }
  auditPage(employeeId:string,competence:string,page:number,pageSize=50):{rows:Row[];total:number}{
    this.employee(employeeId);if(!validMonth(competence))throw new Error('Competência inválida.');
    const size=Number.isSafeInteger(pageSize)?Math.min(200,Math.max(1,pageSize)):50;
    const total=Number((this.db.prepare('SELECT COUNT(*) AS n FROM time_audit WHERE employee_id=? AND competence=?').get(employeeId,competence) as Row).n);
    const offset=(Number.isSafeInteger(page)?Math.min(Math.ceil(total/size),Math.max(0,page)):0)*size;
    const rows=this.db.prepare('SELECT ta.date,ta.action,ta.reason,ta.created_at,op.name AS actor_name FROM time_audit ta LEFT JOIN time_operators op ON ta.actor_id=op.id WHERE ta.employee_id=? AND ta.competence=? ORDER BY ta.created_at DESC,ta.id DESC LIMIT ? OFFSET ?').all(employeeId,competence,size,offset) as Row[];
    return {rows,total};
  }
  saveMatrix(changes:MatrixChange[],overwriteImported=false):number {
    if(!Array.isArray(changes)||!changes.length)throw new Error('Informe os dias para salvar.');
    const members=new Map<string,{companyId:string;revision:number}>();
    const keys=new Set<string>();
    const employeeCompanies=new Map<string,string>(),checkedCompanies=new Set<string>();
    const readSource=this.db.prepare('SELECT source FROM time_days WHERE employee_id=? AND competence=? AND date=?');
    const readState=this.db.prepare('SELECT revision,status FROM time_sheets WHERE employee_id=? AND competence=?');
    for(const item of changes){
      if(!validMonth(item.competence)||!item.day.date.startsWith(item.competence+'-'))throw new Error('Data fora da competência.');
      validateDay(item.day);
      const key=item.employeeId+'|'+item.competence+'|'+item.day.date;
      if(keys.has(key))throw new Error('Registro repetido no lote.');
      keys.add(key);
      let companyId=employeeCompanies.get(item.employeeId);
      if(companyId===undefined){companyId=String(this.employee(item.employeeId).company_id);employeeCompanies.set(item.employeeId,companyId);}
      if(!checkedCompanies.has(companyId)){this.requireEnabled(companyId);checkedCompanies.add(companyId);}
      const group=item.employeeId+'|'+item.competence;
      if(!members.has(group)){
        const old=readState.get(item.employeeId,item.competence) as Row|undefined;
        if(old?.status==='closed')throw new Error('Ficha fechada. Solicite reabertura antes de alterar.');
        members.set(group,{companyId,revision:Number(old?.revision??0)});
      }
      if(item.expectedRevision!==undefined&&item.expectedRevision!==members.get(group)?.revision)
        throw new Error('Ficha alterada por outra operação. Recarregue os dados.');
      const current=readSource.get(item.employeeId,item.competence,item.day.date) as Row|undefined;
      if(current&&current.source!=='suggested'&&item.day.source==='imported'&&!overwriteImported)
        throw new Error('Marcação real já existente em '+item.day.date+'. Use substituição explícita para alterar.');
    }
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const createSheet=this.db.prepare(`INSERT INTO time_sheets(employee_id,company_id,competence,revision,updated_at) VALUES(?,?,?,0,?) ON CONFLICT(employee_id,competence) DO NOTHING`);
      const updateRevision=this.db.prepare('UPDATE time_sheets SET revision=revision+1,updated_at=? WHERE employee_id=? AND competence=?');
      for(const [group,member] of members){
        const [employeeId,competence]=group.split('|');
        createSheet.run(employeeId,member.companyId,competence,now());
        const latest=readState.get(employeeId,competence) as Row;
        if(latest.status==='closed'||Number(latest.revision)!==member.revision)
          throw new Error('Ficha modificada enquanto era salva.');
      }
      const readDay=this.db.prepare('SELECT * FROM time_days WHERE employee_id=? AND competence=? AND date=?');
      const writeDay=this.db.prepare(`INSERT INTO time_days(employee_id,competence,date,kind,source,start,break_start,break_end,end,notes,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,competence,date) DO UPDATE SET
          kind=excluded.kind,source=excluded.source,start=excluded.start,break_start=excluded.break_start,
          break_end=excluded.break_end,end=excluded.end,notes=excluded.notes,updated_at=excluded.updated_at`);
      const writeAudit=this.db.prepare('INSERT INTO time_audit(id,employee_id,competence,date,action,before_json,after_json,reason,created_at,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
      for(const {employeeId,competence,day} of changes){
        const old=readDay.get(employeeId,competence,day.date) as Row|undefined;
        writeDay.run(employeeId,competence,day.date,day.kind,day.source,day.start,day.breakStart,day.breakEnd,day.end,day.notes,now());
        writeAudit.run(randomUUID(),employeeId,competence,day.date,old?'change':'create',old?JSON.stringify(old):null,JSON.stringify(day),'',now(),this.auditActor);
      }
      for(const group of members.keys()){
        const [id,competence]=group.split('|');
        updateRevision.run(now(),id,competence);
      }
      this.db.exec('COMMIT;');
      return changes.length;
    }catch(e){this.db.exec('ROLLBACK;');throw e;}
  }
  reviewSuggestions(employeeIds:string[],competence:string):{reviewed:number;employees:number} {
    if(!Array.isArray(employeeIds)||!employeeIds.length||!validMonth(competence))
      throw new Error('Informe os funcionários e a competência para conferência em lote.');
    const ids=[...new Set(employeeIds.map(requiredId))];
    // A single transaction guarantees that one team's batch review is not partially applied.
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      let reviewed=0,employees=0;
      for(const employeeId of ids){
        const employee=this.employee(employeeId);
        this.requireEnabled(String(employee.company_id));
        const sheet=this.getSheet(employeeId,competence);
        // Closed historical sheets remain immutable; they can be reopened explicitly.
        if(sheet.status==='closed')continue;
        const pending=sheet.days.filter(day=>day.source==='suggested');
        if(!pending.length)continue;
        const stamp=now();
        this.db.prepare(`UPDATE time_days SET source='reviewed',updated_at=?
          WHERE employee_id=? AND competence=? AND source='suggested'`).run(stamp,employeeId,competence);
        this.db.prepare(`UPDATE time_sheets SET revision=revision+1,updated_at=?
          WHERE employee_id=? AND competence=? AND status='draft'`).run(stamp,employeeId,competence);
        this.audit(employeeId,competence,'bulk-review',
          {source:'suggested',dates:pending.map(day=>day.date)},
          {source:'reviewed',dates:pending.map(day=>day.date)},
          'Conferência administrativa em lote; horários gerados preservados como origem, sujeito à assinatura impressa.');
        reviewed+=pending.length;employees++;
      }
      this.db.exec('COMMIT;');
      return {reviewed,employees};
    }catch(error){this.db.exec('ROLLBACK;');throw error;}
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
    // Missing or generated-only rows no longer block administrative closure.
    // Unreviewed suggestions remain visible, but are excluded from payroll calculations.
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

  getImportMapping(companyId:string,headers:string[]):Record<string,string>|null {
    this.requireEnabled(companyId);
    const row=this.db.prepare('SELECT mapping_json FROM time_import_mappings WHERE company_id=? AND headers_json=?')
      .get(companyId,JSON.stringify(headers)) as Row|undefined;
    return row?json<Record<string,string>>(row.mapping_json):null;
  }
  saveImportMapping(companyId:string,headers:string[],mapping:Record<string,string>):void {
    this.requireEnabled(companyId);
    if(!Array.isArray(headers)||headers.length>50||!headers.length||Object.values(mapping).some(value=>!headers.includes(value)))
      throw new Error('Mapeamento inválido para as colunas da planilha.');
    this.db.prepare('INSERT INTO time_import_mappings(company_id,headers_json,mapping_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(company_id,headers_json) DO UPDATE SET mapping_json=excluded.mapping_json,updated_at=excluded.updated_at')
      .run(companyId,JSON.stringify(headers),JSON.stringify(mapping),now());
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
  importPage(companyId:string,page:number,pageSize=50):{rows:Row[];total:number}{
    this.requireEnabled(companyId);
    const size=Number.isSafeInteger(pageSize)?Math.min(200,Math.max(1,pageSize)):50;
    const total=Number((this.db.prepare('SELECT COUNT(*) AS n FROM time_import_batches WHERE company_id=?').get(companyId) as Row).n);
    const offset=(Number.isSafeInteger(page)?Math.min(Math.ceil(total/size),Math.max(0,page)):0)*size;
    const rows=this.db.prepare('SELECT filename,processed,created_at FROM time_import_batches WHERE company_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(companyId,size,offset) as Row[];
    return {rows,total};
  }
  /** Anexos locais no SQLite: acompanham backup e não fazem upload. */
  addAttachment(employeeId:string,date:string,filename:string,mime:string,content:Uint8Array):
    {id:string;employeeId:string;date:string;filename:string;mime:string;size:number;createdAt:string} {
    const person=this.employee(employeeId);
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!validMonth(date.slice(0,7))||!content||content.byteLength<5||content.byteLength>10*1024*1024)
      throw new Error('Data ou arquivo de anexo inválido (até 10 MB).');
    this.requireEnabled(String(person.company_id));
    const ext=filename.toLowerCase().split('.').pop();
    const allowed:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
    if(!ext||allowed[ext]!==mime||filename.length>180||/[\\/\\\\]/.test(filename))
      throw new Error('Anexe somente PDF, PNG, JPEG ou WebP.');
    const bytes=Buffer.from(content);
    if((ext==='pdf'&&bytes.subarray(0,5).toString()!=='%PDF-')||
      (ext==='png'&&bytes.subarray(0,4).toString('hex')!=='89504e47')||
      ((ext==='jpg'||ext==='jpeg')&&bytes.subarray(0,3).toString('hex')!=='ffd8ff')||
      (ext==='webp'&&(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')))
      throw new Error('O conteúdo não corresponde ao formato do arquivo.');
    const id=randomUUID(),createdAt=now();
    this.db.prepare('INSERT INTO time_attachments VALUES(?,?,?,?,?,?,?)').run(id,employeeId,date,filename,mime,bytes,createdAt);
    this.audit(employeeId,date.slice(0,7),'attach',null,{id,filename,size:bytes.length},'Documento de justificativa',date);
    return {id,employeeId,date,filename,mime,size:bytes.length,createdAt};
  }
  listAttachments(employeeId:string,competence:string):Array<{id:string;employeeId:string;date:string;filename:string;mime:string;size:number;createdAt:string}> {
    this.employee(employeeId);
    if(!validMonth(competence))throw new Error('Competência inválida.');
    const rows=this.db.prepare('SELECT id,employee_id,date,filename,mime,length(content) AS size,created_at FROM time_attachments WHERE employee_id=? AND date>=? AND date<=? ORDER BY date,created_at')
      .all(employeeId,competence+'-01',competence+'-31') as Row[];
    return rows.map(row=>({id:String(row.id),employeeId:String(row.employee_id),date:String(row.date),filename:String(row.filename),mime:String(row.mime),size:Number(row.size),createdAt:String(row.created_at)}));
  }
  getAttachment(employeeId:string,id:string):{filename:string;mime:string;content:Buffer} {
    this.employee(employeeId);
    const row=this.db.prepare('SELECT filename,mime,content FROM time_attachments WHERE id=? AND employee_id=?').get(requiredId(id),employeeId) as Row|undefined;
    if(!row)throw new Error('Anexo não encontrado para este funcionário.');
    return {filename:String(row.filename),mime:String(row.mime),content:Buffer.from(row.content as Uint8Array)};
  }
  removeAttachment(employeeId:string,id:string):void {
    const attachment=this.getAttachment(employeeId,id);
    const row=this.db.prepare('SELECT date FROM time_attachments WHERE id=?').get(id) as Row;
    this.db.prepare('DELETE FROM time_attachments WHERE id=? AND employee_id=?').run(id,employeeId);
    this.audit(employeeId,String(row.date).slice(0,7),'detach',{id,filename:attachment.filename},null,'Anexo removido',String(row.date));
  }

}
