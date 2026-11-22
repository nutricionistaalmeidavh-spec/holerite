import ExcelJS from 'exceljs';
import {writeFile} from 'node:fs/promises';
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
  const sheets=format==='template'?[]:store.matrix(companyId,competence);
  const rows=sheets.flatMap(sheet=>sheet.days.map(day=>{
    const e=persons.get(sheet.employeeId);
    return [e?.name||'',e?.cpf||'',e?.registration||'',day.date,day.kind,
      day.start,day.breakStart,day.breakEnd,day.end,day.notes,day.source,sheet.status];
  }));
  if(format==='csv'){
    const quote=(s:unknown)=>'"'+protect(s).replace(/"/g,'""')+'"';
    const output='\uFEFF'+[headers,...rows].map(row=>row.map(quote).join(';')).join('\r\n');
    await writeFile(filePath,output,'utf8');return rows.length;
  }
  const book=new ExcelJS.Workbook();
  book.creator='ArtiSys Holerites';
  const sheet=book.addWorksheet('Ponto');
  sheet.addRow(headers);
  sheet.getRow(1).font={bold:true};
  sheet.getRow(1).alignment={vertical:'middle'};
  sheet.views=[{state:'frozen',ySplit:1,xSplit:1}];
  sheet.columns=headers.map((header,index)=>({key:'c'+index,width:index===0?29:index===9?38:17}));
  for(const row of rows)sheet.addRow(row.map(protect));
  await book.xlsx.writeFile(filePath);
  return rows.length;
}
