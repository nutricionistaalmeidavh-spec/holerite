import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { registerUpdateFlow } from './updates';
import { mkdir, readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import { join, basename, extname } from 'node:path';
import {DatabaseClient} from './db-client';
import { receiptHTML } from './receipt';
import type {PayrollRecord} from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;
let db:DatabaseClient;

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
  const {html,name:employeeName}=await db.call<{html:string;name:string}>(action==='pdf'?'time-export-pdf':'time-print',{employeeId,competence});
  const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try {
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    if(action==='pdf'){
      const name=employeeName.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9-]/gi,'-').slice(0,40);
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
  const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const temporary=await mkdtemp(join(tmpdir(),'artisys-ponto-'));
  try {
    const file=join(temporary,'fichas.html');await db.call(action==='pdf'?'time-export-batch-pdf':'time-print-batch',{companyId,competence,employeeIds,filePath:file});await win.loadFile(file);
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
    ipcMain.handle('holerites:'+name, async(event,arg:unknown)=>{
      if (!mainWindow || event.sender!==mainWindow.webContents) throw new Error('Origem não autorizada.');
      return await fn(arg);
    });
  };
  bind('auth-state',v=>db.call('auth-state',v));
  bind('auth-setup',v=>db.call('auth-setup',v));
  bind('auth-login',v=>db.call('auth-login',v));
  bind('auth-logout',v=>db.call('auth-logout',v));
  bind('auth-users',v=>db.call('auth-users',v));
  bind('auth-add-user',v=>db.call('auth-add-user',v));
  bind('snapshot',v=>db.call('snapshot',v));
  bind('workspace',v=>db.call('workspace',v));
  bind('payroll-page',v=>db.call('payroll-page',v));
  bind('time-overview',v=>db.call('time-overview',v));
  bind('save-company',v=>db.call('save-company',v));
  bind('save-employee',v=>db.call('save-employee',v));
  bind('generate-monthly-batch',v=>db.call('generate-monthly-batch',v));
  bind('save-payroll',v=>db.call('save-payroll',v));
  bind('finalize',v=>db.call('finalize',v));
  bind('mark-paid',v=>db.call('mark-paid',v));
  bind('delete-draft',v=>db.call('delete-draft',v));
  bind('export-pdf',async(id:string)=>printWindow(await db.call<PayrollRecord>('export-pdf',id),'pdf'));
  bind('print',async(id:string)=>printWindow(await db.call<PayrollRecord>('print',id),'print'));
  bind('time-config',v=>db.call('time-config',v));
  bind('time-set-config',v=>db.call('time-set-config',v));
  bind('time-schedule',v=>db.call('time-schedule',v));
  bind('time-set-schedule',v=>db.call('time-set-schedule',v));
  bind('time-sheet',v=>db.call('time-sheet',v));
  bind('time-matrix',v=>db.call('time-matrix',v));
  bind('time-matrix-page',v=>db.call('time-matrix-page',v));
  bind('time-generate-team',v=>db.call('time-generate-team',v));
  bind('time-review-team',v=>db.call('time-review-team',v));
  bind('time-audit',v=>db.call('time-audit',v));
  bind('time-audit-page',v=>db.call('time-audit-page',v));
  bind('time-import-page',v=>db.call('time-import-page',v));
  bind('time-autofill',v=>db.call('time-autofill',v));
  bind('time-bulk-review',v=>db.call('time-bulk-review',v));
  bind('time-save-matrix',v=>db.call('time-save-matrix',v));
  bind('time-close',v=>db.call('time-close',v));
  bind('time-reopen',v=>db.call('time-reopen',v));
  bind('time-apply-payroll',v=>db.call('time-apply-payroll',v));
  bind('time-import-choose',async(companyId:string)=>{
    await db.call('authorize','time-import-choose');
    const select=await dialog.showOpenDialog(mainWindow!,{title:'Importar planilha de ponto',properties:['openFile'],filters:[{name:'Planilhas',extensions:['csv','xlsx']}]});
    if(select.canceled||!select.filePaths[0])return null;
    return db.call('time-import-choose',{companyId,path:select.filePaths[0]});
  });
  bind('time-import-preview',v=>db.call('time-import-preview',v));
  bind('time-import-commit',v=>db.call('time-import-commit',v));
  bind('time-import-history',v=>db.call('time-import-history',v));
  bind('time-bank-balance',v=>db.call('time-bank-balance',v));
  bind('time-export-matrix',async(v:any)=>{
    await db.call('authorize','time-export-matrix');
    const format=v?.format;
    if(!['csv','xlsx','template'].includes(format))throw new Error('Formato inválido.');
    const ext=format==='csv'?'csv':'xlsx';
    const dialogResult=await dialog.showSaveDialog(mainWindow!,{
      title:format==='template'?'Salvar modelo de planilha':'Exportar matriz de ponto',
      defaultPath:format==='template'?'Modelo-Controle-Ponto.xlsx':'Controle-Ponto-'+v.competence+'.'+ext,
      filters:[{name:ext.toUpperCase(),extensions:[ext]}]
    });
    if(dialogResult.canceled||!dialogResult.filePath)return false;
    await db.call('time-export-matrix',{companyId:v.companyId,competence:v.competence,format,filePath:dialogResult.filePath});
    return true;
  });
  bind('time-export-pdf',(v:any)=>printTime(v.employeeId,v.competence,'pdf'));
  bind('time-print',(v:any)=>printTime(v.employeeId,v.competence,'print'));


  bind('time-attachment-list',v=>db.call('time-attachment-list',v));
  bind('time-attachment-add',async(v:any)=>{
    await db.call('authorize','time-attachment-add');
    const selected=await dialog.showOpenDialog(mainWindow!,{title:'Anexar atestado ou justificativa',properties:['openFile'],
      filters:[{name:'Documentos',extensions:['pdf','png','jpg','jpeg','webp']}]});
    if(selected.canceled||!selected.filePaths[0])return null;
    const path=selected.filePaths[0],extension=extname(path).toLowerCase();
    const mime:Record<string,string>={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
    if(!mime[extension])throw new Error('Formato de anexo inválido.');
    if((await stat(path)).size>10*1024*1024)throw new Error('Anexo deve ter até 10 MB.');
    const bytes=await readFile(path);
    return db.call('time-attachment-add',{employeeId:v.employeeId,date:v.date,filename:basename(path),mime:mime[extension],bytes});
  });
  bind('time-attachment-save',async(v:any)=>{
    const item=await db.call<{filename:string;content:Uint8Array}>('time-attachment-save',v);
    const selected=await dialog.showSaveDialog(mainWindow!,{title:'Salvar anexo',defaultPath:item.filename});
    if(selected.canceled||!selected.filePath)return false;
    await writeFile(selected.filePath,item.content);return true;
  });
  bind('time-attachment-remove',v=>db.call('time-attachment-remove',v));
  bind('time-export-report',async(v:any)=>{
    await db.call('authorize','time-export-report');
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Exportar indicadores de ponto',defaultPath:'Indicadores-Ponto-'+v.competence+'.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled||!result.filePath)return false;
    await db.call('time-export-report',{companyId:v.companyId,competence:v.competence,employeeIds:v.employeeIds,filePath:result.filePath});
    return true;
  });
  bind('time-export-batch-pdf',(v:any)=>printTimeBatch(v.companyId,v.competence,v.employeeIds??[],'pdf'));
  bind('time-print-batch',(v:any)=>printTimeBatch(v.companyId,v.competence,v.employeeIds??[],'print'));
  bind('export-backup',async()=>{
    await db.call('authorize','export-backup');
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Backup da base local',defaultPath:`ArtiSys-Holerites-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'SQLite',extensions:['sqlite']}]});
    if(result.canceled || !result.filePath) return false;
    // Backup online consistente, inclusive se o arquivo estiver em WAL.
    await db.call('export-backup',{filePath:result.filePath});
    return true;
  });
  bind('export-csv',async(v:any)=>{
    await db.call('authorize','export-csv');
    if(typeof v?.companyId!=='string'||!v.companyId)throw new Error('Selecione a empresa antes de exportar.');
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Exportar resumo da folha',defaultPath:'holerites.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled || !result.filePath) return false;
    await db.call('export-csv',{companyId:v.companyId,competence:v.competence,kind:v.kind,status:v.status,search:v.search,filePath:result.filePath});
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
  db=new DatabaseClient(join(__dirname,'db-worker.js'),join(directory,'holerites.sqlite'));
  await db.ready;
  bindIPC();
  await createMain();
  checkUpdatesAtStartup();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) void createMain();});
}).catch(err=>{dialog.showErrorBox('Erro ao iniciar ArtiSys Holerites',String(err));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
let closing=false,closed=false;
app.on('before-quit',event=>{
  if(closed||!db)return;
  event.preventDefault();if(closing)return;closing=true;
  void db.close().catch(error=>console.error('Falha ao encerrar banco:',error)).finally(()=>{closed=true;app.quit();});
});
