import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import {readFile,stat} from 'node:fs/promises';
import {extname} from 'node:path';

export type CellRow=Record<string,unknown>;
export interface SheetRows {headers:string[];rows:CellRow[];lineNumbers:number[];sheetName:string;}
export function cellText(value:unknown):string {
  if(value==null)return '';
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==='object'){
    if('result' in value)return cellText(value.result);
    if('text' in value)return cellText(value.text);
    if('richText' in value)return (value.richText as Array<{text:string}>).map(v=>v.text).join('');
    if('hyperlink' in value && 'text' in value)return cellText(value.text);
  }
  return String(value).trim();
}
export const normalizeHeader=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function detectCsvEncoding(bytes:Buffer):string {
  if(bytes[0]===0xff&&bytes[1]===0xfe)return 'utf16-le';
  if(bytes[0]===0xfe&&bytes[1]===0xff)return 'utf16-be';
  try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);return 'utf8';}
  catch{return 'win1252';}
}
export async function readSheet(path:string,requestedSheet?:string,limit=30000):Promise<SheetRows>{
  const ext=extname(path).toLowerCase();
  if(ext!=='.csv'&&ext!=='.xlsx')throw new Error('Selecione uma planilha CSV ou XLSX.');
  const meta=await stat(path);
  if(meta.size===0||meta.size>30*1024*1024)throw new Error('A planilha deve ter até 30 MB.');
  let heads:unknown[]=[],records:unknown[][]=[],sheetName='Planilha';
  if(ext==='.csv'){
    if(requestedSheet)throw new Error('Um pacote de várias abas exige arquivo XLSX.');
    const data=await readFile(path);
    const encoding=detectCsvEncoding(data);
    const content=iconv.decode(data,encoding).replace(/^\uFEFF/,'');
    const result=Papa.parse<string[]>(content,{skipEmptyLines:'greedy',delimiter:'',quoteChar:'"',escapeChar:'"',dynamicTyping:false});
    if(result.errors.length)throw new Error('CSV inválido: '+result.errors.slice(0,3).map(e=>'linha '+((e.row??0)+1)+': '+e.message).join('; '));
    const [first,...rest]=result.data;
    heads=first??[];records=rest;
  }else{
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet=requestedSheet?workbook.worksheets.find(w=>normalizeHeader(w.name)===normalizeHeader(requestedSheet)):workbook.worksheets[0];
    if(!sheet)throw new Error('Aba '+(requestedSheet||'inicial')+' não localizada no arquivo.');
    sheetName=sheet.name;
    for(let i=1;i<=sheet.rowCount;i++){
      const row=sheet.getRow(i),cells=Array.from({length:Math.min(sheet.columnCount,210)},(_,col)=>row.getCell(col+1).value);
      if(i===1)heads=cells;
      else records.push(cells);
    }
  }
  if(heads.length>210)throw new Error('Limite de 210 colunas por planilha.');
  const headers=heads.map(cellText);
  if(!headers.length||headers.some(h=>!h)||new Set(headers.map(normalizeHeader)).size!==headers.length)
    throw new Error('Cabeçalhos vazios ou repetidos. Verifique a primeira linha.');
  const rows:CellRow[]=[],lineNumbers:number[]=[];
  for(let i=0;i<records.length;i++){
    const values=records[i];
    if(!values.some(cell=>cellText(cell)))continue;
    rows.push(Object.fromEntries(headers.map((key,j)=>[key,values[j]])));
    lineNumbers.push(i+2);
    if(rows.length>limit)throw new Error('Limite de '+limit.toLocaleString('pt-BR')+' linhas por arquivo.');
  }
  if(!rows.length)throw new Error('Nenhuma linha preenchida encontrada.');
  return {headers,rows,lineNumbers,sheetName};
}
