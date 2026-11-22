import ExcelJS from 'exceljs';
import {readFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {basename,extname} from 'node:path';
import {AttendanceStore} from './attendance';
import type {MatrixChange} from './attendance';
import type {Employee} from '../src/shared/types';
import type {PointDay,DayKind} from '../src/shared/time';
import {KINDS,validDate,validateDay} from '../src/shared/time';

export type ImportField='employee'|'cpf'|'registration'|'date'|'kind'|'start'|'breakStart'|'breakEnd'|'end'|'notes';
export type ImportMapping=Partial<Record<ImportField,string>>;
export interface ImportChoice {token:string;filename:string;headers:string[];suggestedMapping:ImportMapping;count:number;}
export interface ImportPreview {accepted:number;errors:string[];samples:Array<{employee:string;date:string;kind:string;start:string;end:string}>;}
type Pending={companyId:string;filename:string;hash:string;headers:string[];rows:Array<Record<string,unknown>>;};
const ALIASES:Record<ImportField,string[]>={
  employee:['funcionario','funcionário','colaborador','empregado','nome'],
  cpf:['cpf','documento'],registration:['matricula','matrícula','registro'],
  date:['data','dia','date'],kind:['tipo','ocorrencia','ocorrência','situacao','situação'],
  start:['entrada','entrada 1','inicio','início','entrada manha','entrada manhã'],
  breakStart:['saida almoco','saída almoço','intervalo saida','intervalo saída','saida 1','saída 1'],
  breakEnd:['retorno almoco','retorno almoço','volta almoco','volta almoço','intervalo entrada','entrada 2'],
  end:['saida','saída','saida final','saída final','saida 2','saída 2'],
  notes:['observacoes','observações','obs','justificativa']
};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').trim();
function mapHeaders(headers:string[]):ImportMapping {
  const mapping:ImportMapping={};
  for(const [field,aliases] of Object.entries(ALIASES)){
    const matched=headers.find(header=>aliases.some(alias=>norm(header)===norm(alias)));
    if(matched)mapping[field as ImportField]=matched;
  }
  return mapping;
}
export function parseImportDate(value:unknown):string {
  if(value instanceof Date&&!Number.isNaN(value.getTime())){
    const d=String(value.getUTCDate()).padStart(2,'0'),m=String(value.getUTCMonth()+1).padStart(2,'0');
    return value.getUTCFullYear()+'-'+m+'-'+d;
  }
  if(typeof value==='number'&&value>30000&&value<100000){
    const ms=Date.UTC(1899,11,30)+Math.floor(value)*86400000;
    return new Date(ms).toISOString().slice(0,10);
  }
  const str=String(value??'').trim();
  if(validDate(str))return str;
  const match=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(str);
  if(!match)return '';
  const date=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
  return validDate(date)?date:'';
}
export function parseImportTime(value:unknown):string {
  if(value instanceof Date&&!Number.isNaN(value.getTime()))
    return String(value.getUTCHours()).padStart(2,'0')+':'+String(value.getUTCMinutes()).padStart(2,'0');
  if(typeof value==='number'&&value>=0&&value<1){
    const min=Math.round(value*1440)%1440;
    return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
  }
  const str=String(value??'').trim();
  if(!str)return '';
  const match=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(str);
  if(!match)return str;
  return match[1].padStart(2,'0')+':'+match[2];
}
function parseKind(value:unknown):DayKind {
  const key=norm(String(value||'trabalho'));
  if(['falta','ausencia','ausente'].includes(key))return 'absence';
  if(['ferias'].includes(key))return 'vacation';
  if(['feriado'].includes(key))return 'holiday';
  if(['folga','sabado','domingo','descanso'].includes(key))return 'rest';
  if(['afastado','afastamento','licenca'].includes(key))return 'leave';
  if(['trabalho','trabalhado','normal',''].includes(key))return 'work';
  if(KINDS.includes(key as DayKind))return key as DayKind;
  throw new Error('Ocorrência desconhecida: '+String(value));
}
function textOf(value:unknown):string {
  if(value&&typeof value==='object'){
    if('result' in value)return textOf(value.result);
    if('text' in value)return String(value.text);
    if('richText' in value)return (value.richText as Array<{text:string}>).map(t=>t.text).join('');
  }
  return String(value??'').trim();
}
export class TimeImporter {
  private pending=new Map<string,Pending>();
  constructor(private store:AttendanceStore,private employees:()=>Employee[]){}
  async choose(companyId:string,path:string):Promise<ImportChoice> {
    if(!this.store.getConfig(companyId).enabled)throw new Error('Módulo de ponto desativado.');
    const ext=extname(path).toLowerCase();
    if(!['.xlsx','.csv'].includes(ext))throw new Error('Selecione uma planilha XLSX ou CSV.');
    const info=await stat(path);
    if(info.size>10*1024*1024||info.size===0)throw new Error('Arquivo deve ter no máximo 10 MB.');
    const data=await readFile(path),hash=createHash('sha256').update(data).digest('hex');
    const book=new ExcelJS.Workbook();
    if(ext==='.csv'){
      const first=data.subarray(0,2048).toString('utf8').split(/\r?\n/)[0]||'';
      const delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
      await book.csv.readFile(path,{parserOptions:{delimiter}});
    }else await book.xlsx.readFile(path);
    const sheet=book.worksheets[0];
    if(!sheet)throw new Error('Planilha vazia.');
    const headers:string[]=[];
    const first=sheet.getRow(1);
    const count=Math.min(sheet.columnCount,50);
    for(let c=1;c<=count;c++)headers.push(textOf(first.getCell(c).value)||'Coluna '+c);
    if(!headers.length||new Set(headers).size!==headers.length)throw new Error('Cabeçalhos vazios ou repetidos.');
    const rows:Array<Record<string,unknown>>=[];
    for(let index=2;index<=sheet.rowCount;index++){
      const row=sheet.getRow(index);
      const obj=Object.fromEntries(headers.map((h,i)=>[h,row.getCell(i+1).value]));
      if(Object.values(obj).every(v=>!textOf(v)))continue;
      rows.push(obj);
      if(rows.length>500)throw new Error('Importação limitada a 500 linhas por arquivo. Divida a planilha.');
    }
    if(!rows.length)throw new Error('Não há linhas de ponto para importar.');
    const token=randomUUID();
    this.pending.set(token,{companyId,filename:basename(path),hash,headers,rows});
    return {token,filename:basename(path),headers,suggestedMapping:mapHeaders(headers),count:rows.length};
  }
  private rows(token:string,mapping:ImportMapping){
    const p=this.pending.get(token);
    if(!p)throw new Error('Prévia de importação expirada.');
    if(!mapping.date||(!mapping.employee&&!mapping.cpf&&!mapping.registration))
      throw new Error('Associe Data e pelo menos uma identificação do funcionário.');
    const validColumns=new Set(p.headers);
    if(Object.values(mapping).some(v=>v&&!validColumns.has(v)))throw new Error('Coluna inexistente no arquivo.');
    const employees=this.employees().filter(e=>e.companyId===p.companyId);
    const matches=(row:Record<string,unknown>):Employee=>{
      const identifier=(f:ImportField)=>mapping[f]?textOf(row[mapping[f]!]):'';
      const cpf=identifier('cpf').replace(/\D/g,'');
      const registration=norm(identifier('registration'));
      const name=norm(identifier('employee'));
      let found=cpf?employees.filter(e=>e.cpf.replace(/\D/g,'')===cpf):[];
      if(!found.length&&registration)found=employees.filter(e=>norm(e.registration||'')===registration);
      if(!found.length&&name)found=employees.filter(e=>norm(e.name)===name);
      if(found.length!==1)throw new Error(found.length?'Funcionário ambíguo':'Funcionário não localizado');
      return found[0];
    };
    const accepted:MatrixChange[]=[],errors:string[]=[],seen=new Set<string>();
    p.rows.forEach((row,i)=>{
      try{
        const employee=matches(row);
        const at=(field:ImportField)=>mapping[field]?row[mapping[field]!]:undefined;
        const date=parseImportDate(at('date'));
        if(!validDate(date))throw new Error('Data inválida');
        const kind=parseKind(at('kind'));
        const times=(['start','breakStart','breakEnd','end'] as const).map(field=>kind==='work'?parseImportTime(at(field)):'');
        const day:PointDay={date,kind,source:'imported',start:times[0],breakStart:times[1],
          breakEnd:times[2],end:times[3],notes:textOf(at('notes')).slice(0,500)};
        validateDay(day);
        const competence=date.slice(0,7),key=employee.id+'|'+date;
        if(seen.has(key))throw new Error('Dia duplicado nesta planilha');
        seen.add(key);
        accepted.push({employeeId:employee.id,competence,day});
      }catch(error){errors.push('Linha '+(i+2)+': '+(error instanceof Error?error.message:String(error)));}
    });
    return {pending:p,accepted,errors};
  }
  preview(token:string,mapping:ImportMapping):ImportPreview {
    const {accepted,errors}=this.rows(token,mapping);
    return {accepted:accepted.length,errors,samples:accepted.slice(0,8).map(item=>{
      const e=this.employees().find(e=>e.id===item.employeeId);
      return {employee:e?.name||'',date:item.day.date,kind:item.day.kind,start:item.day.start,end:item.day.end};
    })};
  }
  commit(token:string,mapping:ImportMapping,allowReplace=false):{imported:number} {
    const {pending,accepted,errors}=this.rows(token,mapping);
    if(errors.length)throw new Error('Corrija as linhas inválidas antes de importar: '+errors.slice(0,4).join('; '));
    if(!accepted.length)throw new Error('Nenhuma linha válida.');
    if(this.store.hasImportedHash(pending.companyId,pending.hash))throw new Error('Este arquivo já foi importado.');
    const imported=this.store.saveMatrix(accepted,allowReplace);
    this.store.recordImport(pending.companyId,pending.filename,pending.hash,imported);
    this.pending.delete(token);
    return {imported};
  }
}
