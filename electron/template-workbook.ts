import ExcelJS from 'exceljs';
import {EMPLOYEE_IMPORT_COLUMNS} from '../src/shared/employee-import-fields';

export type TemplateKind='employees'|'time'|'matrix'|'combined';
export const TIME_HEADERS=['Funcionário','CPF','Matrícula','Data','Tipo','Entrada','Saída almoço','Retorno almoço','Saída','Observações'];
export const EMPLOYEE_HEADERS=EMPLOYEE_IMPORT_COLUMNS.map(c=>c.label.replace(' *',''));
export const matrixHeaders=['Funcionário','CPF','Matrícula','Competência',
  ...Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0')).flatMap(d=>[
    d+' Entrada',d+' Saída almoço',d+' Retorno almoço',d+' Saída',d+' Tipo',d+' Observações'])];
const guide=[
  ['ORIENTAÇÕES PARA IMPORTAÇÃO - ARTISYS PONTO E FOLHA'],
  ['1. Preencha as abas fornecidas, sem mudar a primeira linha de cabeçalhos.'],
  ['2. Datas em DD/MM/AAAA ou AAAA-MM-DD; competência AAAA-MM; horários HH:MM.'],
  ['3. CPF e matrícula identificam funcionários. Formate CPF e PIS como TEXTO para conservar zeros.'],
  ['4. Salário em reais (ex.: 3500,50). Não inclua fórmulas nem dados de funcionários fictícios.'],
  ['5. Para funcionários novos, preencha Nome, Cargo, Admissão, Salário e CPF ou Matrícula.'],
  ['6. Na aba Ponto, utilize uma linha por funcionário/dia.'],
  ['7. Na Matriz mensal, utilize uma linha por funcionário/mês e colunas por dia.'],
  ['8. Importe o arquivo no sistema, confira a prévia e confirme somente quando estiver correto.'],
  ['9. Se o arquivo tiver as abas Funcionários e Ponto, use Importar pacote completo.'],
  ['10. Não há transmissão de dados; importações são feitas no computador local.']
];
function addHeaders(book:ExcelJS.Workbook,name:string,headers:string[]){
  const sheet=book.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF214055'}};
  sheet.getRow(1).height=29;
  sheet.getRow(1).alignment={vertical:'middle',wrapText:true};
  sheet.views=[{state:'frozen',ySplit:1,xSplit:Math.min(3,headers.length)}];
  sheet.columns=headers.map(h=>({width:Math.max(16,Math.min(33,h.length+5))}));
  sheet.autoFilter={from:'A1',to:{row:1,column:headers.length}};
  return sheet;
}
export function makeTemplate(kind:TemplateKind):ExcelJS.Workbook{
  const book=new ExcelJS.Workbook();
  book.creator='ArtiSys Ponto e Folha';
  if(kind==='employees'||kind==='combined')addHeaders(book,'Funcionários',EMPLOYEE_HEADERS);
  if(kind==='time'||kind==='combined')addHeaders(book,'Ponto',TIME_HEADERS);
  if(kind==='matrix')addHeaders(book,'Matriz mensal',matrixHeaders);
  const sheet=book.addWorksheet('Instruções');
  guide.forEach(line=>sheet.addRow(line));
  sheet.getColumn(1).width=115;
  sheet.getRow(1).font={bold:true};
  return book;
}
