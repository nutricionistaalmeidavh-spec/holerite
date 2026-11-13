const {app,BrowserWindow}=require('electron');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
app.commandLine.appendSwitch('no-sandbox');
app.whenReady().then(async()=>{
 const [htmlPath,pdfPath]=process.argv.slice(-2);
 if(!htmlPath||!pdfPath)throw new Error('Expected HTML and PDF paths');
 const w=new BrowserWindow({show:false,width:980,height:1260,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 try{
  await w.loadFile(path.resolve(htmlPath));
  await w.webContents.executeJavaScript('document.fonts.ready');
  const pdf=await w.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});
  await writeFile(path.resolve(pdfPath),pdf);
  console.log('PDF_CREATED',pdfPath,pdf.length);
 }finally{w.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
