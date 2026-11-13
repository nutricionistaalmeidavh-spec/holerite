import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { registerUpdateFlow } from './updates';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HoleriteDatabase } from './database';
import { receiptHTML } from './receipt';
import type {PayrollRecord} from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;
let storage: HoleriteDatabase;

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
function bindIPC() {
  const bind=(name:string, fn:(arg:any)=>any)=>{
    ipcMain.handle('holerites:'+name, (event,arg:unknown)=>{
      if (!mainWindow || event.sender!==mainWindow.webContents) throw new Error('Origem não autorizada.');
      return fn(arg);
    });
  };
  bind('snapshot',()=>storage.snapshot());
  bind('save-company',v=>storage.saveCompany(v));
  bind('save-employee',v=>storage.saveEmployee(v));
  bind('save-payroll',v=>storage.savePayroll(v));
  bind('finalize',v=>storage.finalizePayroll(v));
  bind('mark-paid',v=>storage.markPaid(v));
  bind('delete-draft',v=>storage.deleteDraft(v));
  bind('export-pdf',(id:string)=>printWindow(storage.getPayroll(id),'pdf'));
  bind('print',(id:string)=>printWindow(storage.getPayroll(id),'print'));
  bind('export-backup',async()=>{
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Backup da base local',defaultPath:`ArtiSys-Holerites-backup-${new Date().toISOString().slice(0,10)}.sqlite`,filters:[{name:'SQLite',extensions:['sqlite']}]});
    if(result.canceled || !result.filePath) return false;
    // Backup online consistente, inclusive se o arquivo estiver em WAL.
    await storage.backupTo(result.filePath);
    return true;
  });
  bind('export-csv',async()=>{
    const result=await dialog.showSaveDialog(mainWindow!,{title:'Exportar resumo da folha',defaultPath:'holerites.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled || !result.filePath) return false;
    const records=storage.snapshot().payrolls;
    const quote=(s:unknown)=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const rows=[['Competência','Empresa','Funcionário','CPF','Status','Bruto','Descontos','Líquido'],...records.map(p=>[p.competence,p.details.company.legalName,p.details.employee.name,p.details.employee.cpf,p.status,p.details.totals.grossCents/100,p.details.totals.deductionCents/100,p.details.totals.netCents/100])];
    await writeFile(result.filePath,'\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n'),'utf8');
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
      },
      onAvailable: listener => { autoUpdater.on('update-available', listener); },
      onDownloaded: listener => { autoUpdater.on('update-downloaded', listener); },
      onError: listener => { autoUpdater.on('error', listener); },
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
  bindIPC();
  await createMain();
  checkUpdatesAtStartup();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0) void createMain();});
}).catch(err=>{dialog.showErrorBox('Erro ao iniciar ArtiSys Holerites',String(err));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('before-quit',()=>{storage?.close();});
