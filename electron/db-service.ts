import {HoleriteDatabase} from './database';
import {TimeImporter} from './time-import';
import {exportTimeFile} from './time-export';
import {pointReceiptHTML,pointReceiptBatchHTML} from './point-receipt';
import {open,rename,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const publicMethods=new Set(['auth-state','auth-setup','auth-login','auth-logout']);
const quote=(value:unknown)=>{const s=String(value??'');return '"'+(/^[=+@-]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
async function csv(filePath:string,header:string[],rows:Iterable<unknown[]>){
  const temporary=filePath+'.'+randomUUID()+'.tmp';
  try{
    const file=await open(temporary,'wx');
    try{
      let buffer='\uFEFF'+header.map(quote).join(';')+'\r\n',count=0;
      for(const row of rows){buffer+=row.map(quote).join(';')+'\r\n';if(++count%256===0){await file.writeFile(buffer,'utf8');buffer='';}}
      if(buffer)await file.writeFile(buffer,'utf8');
    }finally{await file.close();}
    await rename(temporary,filePath);
  }finally{await rm(temporary,{force:true});}
}
export function createDatabaseService(path:string){
  const storage=new HoleriteDatabase(path);
  const timeImporter=new TimeImporter(storage.attendance,companyId=>storage.listEmployees(companyId));
  const handlers=new Map<string,(v:any)=>unknown>();
  const bind=(name:string,fn:(arg:any)=>unknown)=>handlers.set(name,fn);
  bind('auth-state',()=>storage.access.state());
bind('auth-setup',(v:any)=>storage.access.setup(v.name,v.pin));
bind('auth-login',(v:any)=>storage.access.login(v.name,v.pin));
bind('auth-logout',()=>{storage.access.logout();storage.attendance.setAuditActor(null);});
bind('auth-users',()=>storage.access.listUsers());
bind('auth-add-user',(v:any)=>storage.access.addUser(v.name,v.pin,v.role));
bind('snapshot',()=>storage.snapshot());
bind('workspace',(v:any)=>storage.workspace(v.companyId,v.competence));
bind('payroll-page',(v:any)=>storage.payrollPage(v));
bind('time-overview',(v:any)=>storage.attendance.overview(v.companyId,v.competence));
bind('save-company',v=>storage.saveCompany(v));
bind('save-employee',v=>storage.saveEmployee(v));
bind('generate-monthly-batch',v=>storage.generateMonthlyBatch(v));
bind('save-payroll',v=>storage.savePayroll(v));
bind('finalize',v=>storage.finalizePayroll(v));
bind('mark-paid',v=>storage.markPaid(v));
bind('delete-draft',v=>storage.deleteDraft(v));
bind('time-config',(id:string)=>storage.attendance.getConfig(id));
bind('time-set-config',(v:any)=>storage.attendance.setConfig(v.companyId,v.config));
bind('time-schedule',(id:string)=>storage.attendance.getSchedule(id));
bind('time-set-schedule',(v:any)=>storage.attendance.setSchedule(v.employeeId,v.schedule));
bind('time-sheet',(v:any)=>storage.attendance.getSheet(v.employeeId,v.competence));
bind('time-matrix',(v:any)=>storage.attendance.matrix(v.companyId,v.competence));
bind('time-audit',(v:any)=>storage.attendance.auditHistory(v.employeeId,v.competence));
bind('time-audit-page',(v:any)=>storage.attendance.auditPage(v.employeeId,v.competence,v.page,v.pageSize));
bind('time-import-page',(v:any)=>storage.attendance.importPage(v.companyId,v.page,v.pageSize));
bind('time-autofill',(v:any)=>storage.attendance.autofill(v.employeeId,v.competence));
bind('time-bulk-review',(v:any)=>storage.attendance.reviewSuggestions(v.employeeIds,v.competence));
bind('time-save-matrix',(v:any)=>storage.attendance.saveMatrix(v.changes,v.overwriteImported===true));
bind('time-close',(v:any)=>storage.attendance.close(v.employeeId,v.competence));
bind('time-reopen',(v:any)=>storage.attendance.reopen(v.employeeId,v.competence,v.reason));
bind('time-apply-payroll',(v:any)=>storage.applyTimeToPayroll(v.employeeId,v.competence));
bind('time-import-preview',(v:any)=>timeImporter.preview(v.token,v.mapping));
bind('time-import-commit',(v:any)=>timeImporter.commit(v.token,v.mapping,v.allowReplace===true));
bind('time-import-history',(id:string)=>storage.attendance.importHistory(id));
bind('time-bank-balance',(v:any)=>storage.attendance.bankBalance(v.employeeId,v.competence));
bind('time-attachment-list',(v:any)=>storage.attendance.listAttachments(v.employeeId,v.competence));
bind('time-attachment-remove',(v:any)=>storage.attendance.removeAttachment(v.employeeId,v.id));
  bind('time-matrix-page',v=>storage.attendance.matrixPage(v));
  bind('time-generate-team',v=>{
    const ids=storage.attendance.teamIds(v.companyId,v.competence);
    if(!ids.length)throw new Error('Não há funcionários com ficha editável nesta competência.');
    for(const id of ids)storage.attendance.autofill(id,v.competence);
    return v.include?storage.attendance.reviewSuggestions(ids,v.competence):{reviewed:0,employees:ids.length};
  });
  bind('time-review-team',v=>{
    const ids=storage.attendance.teamIds(v.companyId,v.competence);
    return ids.length?storage.attendance.reviewSuggestions(ids,v.competence):{reviewed:0,employees:0};
  });
  bind('export-pdf',(id:string)=>storage.getPayroll(id));
  bind('print',(id:string)=>storage.getPayroll(id));
  const timePrint=(v:any)=>{
    const sheet=storage.attendance.getSheet(v.employeeId,v.competence);
    const employee=storage.getEmployee(v.employeeId),company=storage.getCompany(employee.companyId);
    return {html:pointReceiptHTML(sheet,employee,company),name:employee.name};
  };
  bind('time-print',timePrint);bind('time-export-pdf',timePrint);
  const batchPrint=async(v:any)=>{
    const available=storage.listEmployees(v.companyId).filter(e=>e.active);
    const ids:string[]=v.employeeIds.length?[...new Set<string>(v.employeeIds)]:available.map(e=>e.id);
    if(!ids.length)throw new Error('Selecione pelo menos um funcionário.');
    const byId=new Map(available.map(e=>[e.id,e]));
    const employees=ids.map(id=>{const e=byId.get(id);if(!e)throw new Error('Funcionário não pertence à empresa.');return e;});
    const company=storage.getCompany(v.companyId),wanted=new Set(ids);
    const sheets=new Map<string,ReturnType<typeof storage.attendance.getSheet>>();
    for(const batch of storage.attendance.matrixBatches(v.companyId,v.competence))for(const sheet of batch)if(wanted.has(sheet.employeeId))sheets.set(sheet.employeeId,sheet);
    await writeFile(v.filePath,pointReceiptBatchHTML(employees.map(employee=>({employee,company,sheet:sheets.get(employee.id)!}))),'utf8');
  };
  bind('time-print-batch',batchPrint);bind('time-export-batch-pdf',batchPrint);
  bind('time-import-choose',v=>timeImporter.choose(v.companyId,v.path));
  bind('time-export-matrix',v=>exportTimeFile({store:storage.attendance,employees:storage.listEmployees(v.companyId),...v}));
  bind('time-attachment-add',v=>storage.attendance.addAttachment(v.employeeId,v.date,v.filename,v.mime,v.bytes));
  bind('time-attachment-save',v=>storage.attendance.getAttachment(v.employeeId,v.id));
  bind('export-backup',v=>storage.backupTo(v.filePath));
  bind('export-csv',v=>{
    storage.getCompany(v.companyId);
    function* rows(){for(const p of storage.payrollExport(v))yield [p.competence,p.details.company.legalName,p.details.employee.name,p.details.employee.cpf,p.status,p.details.totals.grossCents/100,p.details.totals.deductionCents/100,p.details.totals.netCents/100];}
    return csv(v.filePath,['Competência','Empresa','Funcionário','CPF','Status','Bruto','Descontos','Líquido'],rows());
  });
  bind('time-export-report',v=>{
    const people=new Map(storage.listEmployees(v.companyId).map(e=>[e.id,e]));
    const ids=v.employeeIds===undefined?null:new Set<string>(v.employeeIds);
    function* rows(){for(const batch of storage.attendance.matrixBatches(v.companyId,v.competence))for(const s of batch){
      if(ids&&!ids.has(s.employeeId))continue;
      const p=people.get(s.employeeId);
      yield [s.employeeName,p?.sector||'',p?.jobSite||'',p?.costCenter||'',s.competence,s.summary.workedMinutes,s.summary.overtimeMinutes,s.summary.nightMinutes,s.summary.lateMinutes,s.summary.absences,s.summary.bankMinutes,s.summary.dsrCents??0];
    }}
    return csv(v.filePath,['Funcionário','Setor','Obra','Centro de custo','Competência','Minutos trabalhados','Minutos extras','Minutos noturnos','Minutos de atraso','Faltas','Saldo banco (min)','DSR estimado em centavos'],rows());
  });
  function authorize(name:string){if(!publicMethods.has(name))storage.access.requireAccess(name);}
  return {async run(name:string,arg:unknown){
    if(name==='authorize'){authorize(String(arg));return;}
    const handler=handlers.get(name);if(!handler)throw new Error('Operação inválida.');
    authorize(name);
    storage.attendance.setAuditActor(storage.access.state().operator?.id??null);
    return await handler(arg);
  },close:()=>storage.close()};
}
