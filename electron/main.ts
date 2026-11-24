import {filterReportRows} from '../src/shared/workspace-scope';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { registerUpdateFlow } from './updates';
import { mkdir, readFile, writeFile, mkdtemp, rm, open } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import { join, basename, extname } from 'node:path';
import { HoleriteDatabase } from './database';
import { receiptHTML } from './receipt';
import {pointReceiptHTML,pointReceiptBatchHTML} from './point-receipt';
import {TimeImporter} from './time-import';
import {exportTimeFile} from './time-export';
import type {PayrollRecord} from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;
let storage: HoleriteDatabase;
let timeImporter: TimeImporter;

const formatFilename = (p: PayrollRecord) => {
  const name = p.details.employee.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,45);
  return `Holerite-${name}-${p.competence}.pdf`;
};
async function printWindow(p: PayrollRecord, action:'pdf'|'print'): Promise<boolean> {
  const window=new BrowserWindow({show:false,width:800,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try {
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHTML(p)));
    if (action==='pdf') {
      const selection=await dialog.showSaveDialog(mainWindow!,{title:'Salvar holerite',defaultPath:formatFilename(p),filters:[{name:'PDF',extensions:['pdf']}]});
      if (selection.canceled || !selection.filePath) return false;
      const pdf=await window.webContents.printToPDF({pageSize:'A4',printBackground:true});
      await writeFile(selection.filePath,pdf);
      return true;
    }
    await new Promise<void>((resolve,reject)=>{
      window.webContents.print({silent:false,printBackground:true},(success,reason)=>{
        if (success || reason==='Print job canceled') resolve();
        else reject(new Error(reason || 'Falha na impressão.'));
      });
    });
    return true;
  } finally {if (!window.isDestroyed()) window.destroy();}
}
async function printTime(employeeId:string,competence:string,action:'pdf'|'print'):Promise<boolean>{
  const sheet=storage.attendance.getSheet(employeeId,competence);
  const employee=storage.getEmployee(employeeId),company=storage.getCompany(employee.companyId);
  const html=pointReceiptHTML(sheet,employee,company);
  const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try {
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    if(action==='pdf'){
      const name=employee.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9-]/gi,'-').slice(0,40);
      const selection=await dialog.showSaveDialog(mainWindow!,{title:'Salvar ficha de ponto',defaultPath:'Ficha-Ponto-'+name+'-'+competence+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
      if(selection.canceled||!selection.filePath)return false;
      const data=await window.webContents.printToPDF({pageSize:'A4',printBackground:true,landscape:true});
      await writeFile(selection.filePath,data);return true;
    }
    await new Promise<void>((resolve,reject)=>window.webContents.print({silent:false,printBackground:true},(success,reason)=>{
      if(success||reason==='Print job canceled')resolve();
      else reject(new Error(reason||'Falha ao imprimir ficha.'));
    }));
    return true;
  }finally{if(!window.isDestroyed())window.destroy();}
}

async function printTimeBatch(companyId:string,competence:string,employeeIds:string[],action:'pdf'|'print'):Promise<boolean>{
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence))throw new Error('Competência inválida.');
  const available=storage.listEmployees(companyId).filter(employee=>employee.active);
  const ids=employeeIds.length?[...new Set(employeeIds)]:available.map(employee=>employee.id);
  if(!ids.length)throw new Error('Selecione pelo menos um funcionário.');
  const byId=new Map(available.map(e=>[e.id,e]));
  const employees=ids.map(id=>{
    const employee=byId.get(id);
    if(!employee)throw new Error('Funcionário não pertence à empresa.');
    return employee;
  });
  const company=storage.getCompany(companyId);
  const sheets=new Map(storage.attendance.matrix(companyId,competence).map(sheet=>[sheet.employeeId,sheet]));
  const html=pointReceiptBatchHTML(employees.map(employee=>({employee,company,sheet:sheets.get(employee.id)!})));
  const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const temporary=await mkdtemp(join(tmpdir(),'artisys-ponto-'));
  try {
    const file=join(temporary,'fichas.html');await writeFile(file,html,'utf8');await win.loadFile(file);
    if(action==='pdf'){
      const selection=await dialog.showSaveDialog(mainWindow!,{title:'Salvar fichas da equipe',defaultPath:'Fichas-Ponto-Equipe-'+competence+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
      if(selection.canceled||!selection.filePath)return false;
      await writeFile(selection.filePath,await win.webContents.printToPDF({pageSize:'A4',printBackground:true,landscape:true}));
    }else await new Promise<void>((resolve,reject)=>win.webContents.print({silent:false,printBackground:true},(success,reason)=>{
      if(success||reason==='Print job canceled')resolve();
      else reject(new Error(reason||'Falha na impressão em lote.'));
    }));
    return true;
  }finally{if(!win.isDestroyed())win.destroy();await rm(temporary,{recursive:true,force:true});}
}
function bindIPC() {
  const bind=(name:string, fn:(arg:any)=>any)=>{
    ipcMain.handle('holerites:'+name, (event,arg:unknown)=>{
      if (!mainWindow || event.sender!==mainWindow.webContents) throw new Error('Origem não autorizada.');
      const publicMethods=new Set(['auth-state','auth-setup','auth-login','auth-logout']);
      if(!publicMethods.has(name)){
        storage.access.requireAccess(name);
        storage.attendance.setAuditActor(storage.access.state().operator?.id??null);
      }
      return fn(arg);
    });
  };
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
  bind('export-pdf',(id:string)=>printWindow(storage.getPayroll(id),'pdf'));
  bind('print',(id:string)=>printWindow(storage.getPayroll(id),'print'));
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
  bind('time-import-choose',async(companyId:string)=>{
    const select=await dialog.showOpenDialog(mainWindow!,{title:'Importar planilha de ponto',properties:['openFile'],filters:[{name:'Planilhas',extensions:['csv','xlsx']}]});
    if(select.canceled||!select.filePaths[0])return null;
    return timeImporter.choose(companyId,select.filePaths[0]);
  });
  bind('time-import-preview',(v:any)=>timeImporter.preview(v.token,v.mapping));
  bind('time-import-commit',(v:any)=>timeImporter.commit(v.token,v.mapping,v.allowReplace===true));
  bind('time-import-history',(id:string)=>storage.attendance.importHistory(id));
  bind('time-bank-balance',(v:any)=>storage.attendance.bankBalance(v.employeeId,v.competence));
  bind('time-export-matrix',async(v:any)=>{
    const format=v?.format;
    if(!['csv','xlsx','template'].includes(format))throw new Error('Formato inválido.');
    const ext=format==='csv'?'csv':'xlsx';
    const dialogResult=await dialog.showSaveDialog(mainWindow!,{
      title:format==='template'?'Salvar modelo de planilha':'Exportar matriz de ponto',
      defaultPath:format==='template'?'Modelo-Controle-Ponto.xlsx':'Controle-Ponto-'+v.competence+'.'+ext,
      filters:[{name:ext.toUpperCase(),extensions:[ext]}]
    });
    if(dialogResult.canceled||!dialogResult.filePath)return false;
    await exportTimeFile({store:storage.attendance,employees:storage.listEmployees(v.companyId),
      companyId:v.companyId,competence:v.competence,format,filePath:dialogResult.filePath});
    return true;
  });
  bind('time-export-pdf',(v:any)=>printTime(v.employeeId,v.competence,'pdf'));
  bind('time-print',(v:any)=>printTime(v.employeeId,v.competence,'print'));


  bind('time-attachment-list',(v:any)=>storage.attendance.listAttachments(v.employeeId,v.competence));
  bind('time-attachment-add',async(v:any)=>{
    const selected=await dialog.showOpenDialog(mainWindow!,{title:'Anexar atestado ou justificativa',properties:['openFile'],
      filters:[{name:'Documentos',extensions:['pdf','png','jpg','jpeg','webp']}]});
    if(selected.canceled||!selected.filePaths[0])return null;
    const path=selected.filePaths[0],extension=extname(path).toLowerCase();
    const mime:Record<string,string>={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
    if(!mime[extension])throw new Error('Formato de anexo inválido.');
    const bytes=await readFile(path);
    return storage.attendance.addAttachment(v.employeeId,v.date,basename(path),mime[extension],bytes);
  });
  bind('time-attachment-save',async(v:any)=>{
    const item=storage.attendance.getAttachment(v.employeeId,v.id);
    const selected=await dialog.showSaveDialog(mainWindow!,{title:'Salvar anexo',defaultPath:item.filename});
    if(selected.canceled||!selected.filePath)return false;
    await writeFile(selected.filePath,item.content);return true;
  });
  bind('time-attachment-remove',(v:any)=>storage.attendance.removeAttachment(v.employeeId,v.id));
  bind('time-export-report',async(v:any)=>{
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Exportar indicadores de ponto',defaultPath:'Indicadores-Ponto-'+v.competence+'.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled||!result.filePath)return false;
    const people=new Map(storage.listEmployees(v.companyId).map(e=>[e.id,e]));
    const sheets=filterReportRows(storage.attendance.matrix(v.companyId,v.competence),v.employeeIds);
    const rows=[['Funcionário','Setor','Obra','Centro de custo','Competência','Minutos trabalhados','Minutos extras','Minutos noturnos','Minutos de atraso','Faltas','Saldo banco (min)','DSR estimado em centavos'],
      ...sheets.map(s=>{
        const p=people.get(s.employeeId);
        return [s.employeeName,p?.sector||'',p?.jobSite||'',p?.costCenter||'',s.competence,String(s.summary.workedMinutes),String(s.summary.overtimeMinutes),String(s.summary.nightMinutes),String(s.summary.lateMinutes),String(s.summary.absences),String(s.summary.bankMinutes),String(s.summary.dsrCents??0)];
      })];
    const quote=(value:string)=>'"'+(/^[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
    await writeFile(result.filePath,'\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n'),'utf8');
    return true;
  });
  bind('time-export-batch-pdf',(v:any)=>printTimeBatch(v.companyId,v.competence,v.employeeIds??[],'pdf'));
  bind('time-print-batch',(v:any)=>printTimeBatch(v.companyId,v.competence,v.employeeIds??[],'print'));
  bind('export-backup',async()=>{
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Backup da base local',defaultPath:`ArtiSys-Holerites-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'SQLite',extensions:['sqlite']}]});
    if(result.canceled || !result.filePath) return false;
    // Backup online consistente, inclusive se o arquivo estiver em WAL.
    await storage.backupTo(result.filePath);
    return true;
  });
  bind('export-csv',async(v:any)=>{
    if(typeof v?.companyId!=='string'||!v.companyId)throw new Error('Selecione a empresa antes de exportar.');
    storage.getCompany(v.companyId);
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Exportar resumo da folha',defaultPath:'holerites.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled || !result.filePath) return false;
    const records=storage.payrollExport(v);
    const quote=(s:unknown)=>{const value=String(s??'');return '"'+(/^[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';};
    const file=await open(result.filePath,'w');
    try{
      const header=['Competência','Empresa','Funcionário','CPF','Status','Bruto','Descontos','Líquido'];
      await file.writeFile('\uFEFF'+header.map(quote).join(';')+'\r\n','utf8');
      let buffer='',count=0;
      for(const p of records){
        buffer+=[p.competence,p.details.company.legalName,p.details.employee.name,p.details.employee.cpf,p.status,p.details.totals.grossCents/100,p.details.totals.deductionCents/100,p.details.totals.netCents/100].map(quote).join(';')+'\r\n';
        if(++count%256===0){await file.writeFile(buffer,'utf8');buffer='';}
      }
      if(buffer)await file.writeFile(buffer,'utf8');
    }finally{await file.close();}
    return true;
  });
}
async function createMain() {
  mainWindow=new BrowserWindow({title:'ArtiSys Holerites',width:1380,height:900,minWidth:1024,minHeight:680,backgroundColor:'#f5f7fb',show:false,
    webPreferences:{preload:join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.once('ready-to-show',()=>mainWindow?.show());
  if(app.isPackaged) await mainWindow.loadFile(join(__dirname,'../dist/index.html'));
  else await mainWindow.loadURL('http://127.0.0.1:5173');
}

function checkUpdatesAtStartup() {
  const check = registerUpdateFlow(
    {packaged: app.isPackaged, platform: process.platform},
    {
      configureManual: () => {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.allowPrerelease = false;
        autoUpdater.on('download-progress', progress => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setProgressBar(Math.max(0, Math.min(1, progress.percent / 100)));
          }
        });
      },
      onAvailable: listener => { autoUpdater.on('update-available', listener); },
      onDownloaded: listener => {
        autoUpdater.on('update-downloaded', info => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
          void listener(info);
        });
      },
      onError: listener => {
        autoUpdater.on('error', error => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
          listener(error);
        });
      },
      check: () => autoUpdater.checkForUpdates(),
      download: () => autoUpdater.downloadUpdate(),
      install: () => autoUpdater.quitAndInstall(false, true)
    },
    {
      confirmDownload: async version => {
        const window = mainWindow;
        if (!window || window.isDestroyed()) return false;
        const choice = await dialog.showMessageBox(window, {
          type: 'info',
          title: 'Atualização disponível',
          message: `ArtiSys Holerites ${version} está disponível.`,
          detail: `Versão instalada: ${app.getVersion()}. Deseja baixar a atualização agora?`,
          buttons: ['Baixar atualização', 'Agora não'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        });
        return choice.response === 0;
      },
      confirmInstall: async version => {
        const window = mainWindow;
        if (!window || window.isDestroyed()) return false;
        const choice = await dialog.showMessageBox(window, {
          type: 'info',
          title: 'Atualização pronta',
          message: `ArtiSys Holerites ${version} foi baixado.`,
          detail: 'Para instalar, o aplicativo será fechado e reaberto. Seus dados locais serão preservados.',
          buttons: ['Instalar agora', 'Depois'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        });
        return choice.response === 0;
      },
      downloadFailed: async () => {
        const window = mainWindow;
        if (!window || window.isDestroyed()) return;
        await dialog.showMessageBox(window, {
          type: 'warning',
          title: 'Atualização não baixada',
          message: 'Não foi possível baixar a atualização.',
          detail: 'Confira sua conexão e tente novamente na próxima abertura. O sistema continua funcionando normalmente.',
          buttons: ['OK'],
          noLink: true
        });
      }
    }
  );
  void check();
}

app.whenReady().then(async()=>{
  const directory=app.getPath('userData');
  await mkdir(directory,{recursive:true});
  storage=new HoleriteDatabase(join(directory,'holerites.sqlite'));
  timeImporter=new TimeImporter(storage.attendance,companyId=>storage.listEmployees(companyId));
  bindIPC();
  await createMain();
  checkUpdatesAtStartup();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) void createMain();});
}).catch(err=>{dialog.showErrorBox('Erro ao iniciar ArtiSys Holerites',String(err));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('before-quit',()=>{storage?.close();});
