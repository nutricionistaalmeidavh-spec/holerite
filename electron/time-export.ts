import ExcelJS from 'exceljs';
import {open,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {AttendanceStore} from './attendance';
import type {Employee} from '../src/shared/types';

export type TimeExportFormat='csv'|'xlsx'|'template';
const headers=['Funcionário','CPF','Matrícula','Data','Tipo','Entrada','Saída almoço','Retorno almoço','Saída','Observações','Origem','Situação ficha'];
const protect=(value:unknown):string=>{
  const text=String(value??'');
  return /^[\s]*[=+@\-\t\r]/.test(text)?"'"+text:text;
};
export async function exportTimeFile(input:{store:AttendanceStore;employees:Employee[];companyId:string;
  competence:string;format:TimeExportFormat;filePath:string}):Promise<number> {
  const {store,employees,companyId,competence,format,filePath}=input;
  if(!['csv','xlsx','template'].includes(format))throw new Error('Formato não suportado.');
  const persons=new Map(employees.filter(e=>e.companyId===companyId).map(e=>[e.id,e]));
  function* rows(){
    if(format==='template')return;
    for(const batch of store.matrixBatches(companyId,competence,100))for(const sheet of batch)for(const day of sheet.days){
      const e=persons.get(sheet.employeeId);
      yield [e?.name||'',e?.cpf||'',e?.registration||'',day.date,day.kind,
        day.start,day.breakStart,day.breakEnd,day.end,day.notes,day.source,sheet.status];
    }
  }
  const temporary=filePath+'.'+randomUUID()+'.tmp';
  let count=0;
  try{
    if(format==='csv'){
      const quote=(s:unknown)=>'"'+protect(s).replace(/"/g,'""')+'"';
      const output=await open(temporary,'wx');
      try{
        let buffer='\uFEFF'+headers.map(quote).join(';')+'\r\n';
        for(const row of rows()){
          buffer+=row.map(quote).join(';')+'\r\n';count++;
          if(count%512===0){await output.writeFile(buffer,'utf8');buffer='';}
        }
        if(buffer)await output.writeFile(buffer,'utf8');
      }finally{await output.close();}
    }else{
      const book=new ExcelJS.stream.xlsx.WorkbookWriter({filename:temporary,useStyles:true,useSharedStrings:false});
      book.creator='ArtiSys Holerites';
      let sheetIndex=0,rowsOnSheet=0;
      const newSheet=()=>{
        const sheet=book.addWorksheet(++sheetIndex===1?'Ponto':'Ponto '+sheetIndex,{views:[{state:'frozen',ySplit:1,xSplit:1}]});
        sheet.columns=headers.map((header,index)=>({key:'c'+index,width:index===0?29:index===9?38:17}));
        const title=sheet.addRow(headers);title.font={bold:true};title.alignment={vertical:'middle'};title.commit();
        rowsOnSheet=0;return sheet;
      };
      let sheet=newSheet();
      for(const row of rows()){
        if(rowsOnSheet>=1048575){sheet.commit();sheet=newSheet();}
        sheet.addRow(row.map(protect)).commit();rowsOnSheet++;count++;
      }
      sheet.commit();await book.commit();
    }
    await rename(temporary,filePath);return count;
  }finally{await rm(temporary,{force:true});}
}
