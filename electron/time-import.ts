import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {basename} from 'node:path';
import {AttendanceStore} from './attendance';
import type {MatrixChange} from './attendance';
import type {Employee} from '../src/shared/types';
import type {PointDay,DayKind} from '../src/shared/time';
import {KINDS,validDate,validateDay} from '../src/shared/time';
import {readSheet,cellText,normalizeHeader} from './import-sheet';
import type {CellRow,SheetRows} from './import-sheet';

export type ImportField='employee'|'cpf'|'registration'|'date'|'kind'|'start'|'breakStart'|'breakEnd'|'end'|'notes';
export type ImportMapping=Partial<Record<ImportField,string>>;
export type TimeImportEdits=Record<number,Partial<Record<ImportField,string>>>;
export interface ImportChoice {token:string;filename:string;headers:string[];suggestedMapping:ImportMapping;count:number;layout?:'daily'|'monthly';sheetName?:string;}
export interface TimeImportRow {line:number;rowKey:number;status:'valid'|'error';message:string;values:Record<ImportField,string>;}
export interface ImportPreview {accepted:number;errors:string[];samples:Array<{employee:string;date:string;kind:string;start:string;end:string}>;
  rows:TimeImportRow[];totalRows:number;}
type Pending={companyId:string;filename:string;hash:string;headers:string[];rows:CellRow[];lines:number[];layout:'daily'|'monthly'};
const ALIASES:Record<ImportField,string[]>={
  employee:['funcionario','funcionário','colaborador','empregado','nome'],
  cpf:['cpf','documento'],registration:['matricula','matrícula','registro'],
  date:['data','dia','date'],kind:['tipo','ocorrencia','ocorrência','situacao','situação'],
  start:['entrada','entrada 1','inicio','início','entrada manha','entrada manhã','manha entrada','manhã entrada'],
  breakStart:['saida almoco','saída almoço','intervalo saida','intervalo saída','saida 1','saída 1','manha saida','manhã saída'],
  breakEnd:['retorno almoco','retorno almoço','volta almoco','volta almoço','intervalo entrada','entrada 2','tarde entrada'],
  end:['saida','saída','saida final','saída final','saida 2','saída 2','tarde saida','tarde saída'],
  notes:['observacoes','observações','obs','justificativa','exceções/observações','excecoes observacoes']
};
const norm=normalizeHeader;
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
  const str=cellText(value);
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
    const minutes=Math.round(value*1440)%1440;
    return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  const raw=cellText(value);
  if(!raw)return '';
  const match=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  return match?match[1].padStart(2,'0')+':'+match[2]:raw;
}
function parseKind(value:unknown):DayKind {
  const key=norm(cellText(value||'trabalho'));
  if(['falta','ausencia','ausente'].includes(key))return 'absence';
  if(['ferias'].includes(key))return 'vacation';
  if(['feriado'].includes(key))return 'holiday';
  if(['folga','sabado','domingo','descanso'].includes(key))return 'rest';
  if(['afastado','afastamento','licenca'].includes(key))return 'leave';
  if(['trabalho','trabalhado','normal',''].includes(key))return 'work';
  if(KINDS.includes(key as DayKind))return key as DayKind;
  throw new Error('Ocorrência desconhecida: '+cellText(value));
}
function expandMonthly(sheet:SheetRows):SheetRows {
  const competenceColumn=sheet.headers.find(h=>norm(h)==='competencia');
  if(!competenceColumn)return sheet;
  const dayColumns=sheet.headers.filter(h=>/^\d{1,2}\s+(entrada|saida|retorno|tipo|observacoes)/.test(norm(h).replace(/^(\d{1,2})/,'$1 ')));
  if(!dayColumns.length)return sheet;
  const rows:CellRow[]=[],lineNumbers:number[]=[];
  const identify=(r:CellRow,aliases:string[])=>{
    const key=sheet.headers.find(h=>aliases.some(a=>norm(h)===norm(a)));return key?r[key]:undefined;
  };
  for(let i=0;i<sheet.rows.length;i++){
    const source=sheet.rows[i],monthRaw=cellText(source[competenceColumn]);
    const month=/^\d{4}-\d{2}$/.test(monthRaw)?monthRaw:
      /^(\d{2})\/(\d{4})$/.test(monthRaw)?monthRaw.slice(3)+'-'+monthRaw.slice(0,2):monthRaw;
    for(let day=1;day<=31;day++){
      const dateNum=String(day).padStart(2,'0');
      const get=(kind:string)=>source[sheet.headers.find(h=>norm(h)===norm(dateNum+' '+kind))||''];
      const vals=[get('Entrada'),get('Saída almoço'),get('Retorno almoço'),get('Saída'),get('Tipo'),get('Observações')];
      if(!vals.some(v=>cellText(v)))continue;
      rows.push({'Funcionário':identify(source,['funcionário','funcionario','nome']),'CPF':identify(source,['cpf']),
        'Matrícula':identify(source,['matrícula','matricula']),'Data':month+'-'+dateNum,
        'Tipo':vals[4],'Entrada':vals[0],'Saída almoço':vals[1],'Retorno almoço':vals[2],
        'Saída':vals[3],'Observações':vals[5]});
      lineNumbers.push(sheet.lineNumbers[i]);
      if(rows.length>30000)throw new Error('Matriz excede 30.000 marcações.');
    }
  }
  if(!rows.length)throw new Error('Nenhuma marcação preenchida na matriz mensal.');
  const headers=['Funcionário','CPF','Matrícula','Data','Tipo','Entrada','Saída almoço','Retorno almoço','Saída','Observações'];
  return {headers,rows,lineNumbers,sheetName:sheet.sheetName};
}
export class TimeImporter {
  private pending=new Map<string,Pending>();
  constructor(private store:AttendanceStore,private employees:()=>Employee[]){}
  async choose(companyId:string,path:string,sheetName?:string):Promise<ImportChoice> {
    this.store.getConfig(companyId);
    const original=await readSheet(path,sheetName);
    const monthly=original.headers.some(h=>norm(h)==='competencia')&&original.headers.some(h=>/^\d{1,2}\s+/.test(h));
    const sheet=monthly?expandMonthly(original):original;
    const fileHash=createHash('sha256').update(await readFile(path)).update(sheet.sheetName).digest('hex');
    const token=randomUUID();
    this.pending.clear();
    this.pending.set(token,{companyId,filename:basename(path),hash:fileHash,headers:sheet.headers,rows:sheet.rows,lines:sheet.lineNumbers,
      layout:monthly?'monthly':'daily'});
    return {token,filename:basename(path),headers:sheet.headers,count:sheet.rows.length,
      suggestedMapping:(this.store.getImportMapping(companyId,sheet.headers) as ImportMapping|null)??mapHeaders(sheet.headers),
      layout:monthly?'monthly':'daily',sheetName:sheet.sheetName};
  }
  private prepare(token:string,mapping:ImportMapping,edits:TimeImportEdits={},allowReplace=false){
    const p=this.pending.get(token);
    if(!p)throw new Error('Prévia de importação expirada.');
    if(!mapping.date||(!mapping.employee&&!mapping.cpf&&!mapping.registration))
      throw new Error('Associe Data e pelo menos uma identificação do funcionário.');
    if(Object.values(mapping).some(value=>value&&!p.headers.includes(value)))throw new Error('Coluna inexistente no arquivo.');
    const employees=this.employees().filter(e=>e.companyId===p.companyId),accepted:MatrixChange[]=[],errors:string[]=[],display:TimeImportRow[]=[];
    const byCpf=new Map<string,Employee[]>(),byRegistration=new Map<string,Employee[]>(),byName=new Map<string,Employee[]>();
    const add=(map:Map<string,Employee[]>,key:string,e:Employee)=>{
      if(!key)return;
      const matches=map.get(key)||[];matches.push(e);map.set(key,matches);
    };
    for(const employee of employees){
      add(byCpf,employee.cpf.replace(/\D/g,''),employee);
      add(byRegistration,norm(employee.registration||''),employee);
      add(byName,norm(employee.name),employee);
    }
    const seen=new Set<string>(),sheets=new Map<string,ReturnType<AttendanceStore['getSheet']>>();
    for(let i=0;i<p.rows.length;i++){
      const row=p.rows[i],line=p.lines[i];
      const at=(field:ImportField)=>Object.prototype.hasOwnProperty.call(edits[i]||{},field)
        ?edits[i][field]:mapping[field]?row[mapping[field]!]:undefined;
      const identifier=(f:ImportField)=>cellText(at(f));
      const rawCpf=at('cpf'),cpfDigits=identifier('cpf').replace(/\D/g,'');
      const cpf=typeof rawCpf==='number'?cpfDigits.padStart(11,'0'):cpfDigits;
      const registration=norm(identifier('registration')),name=norm(identifier('employee'));
      const values={} as Record<ImportField,string>;
      for(const field of Object.keys(ALIASES) as ImportField[])values[field]=identifier(field);
      try{
        let matches=cpf?(byCpf.get(cpf)||[]):[];
        if(!matches.length&&registration)matches=byRegistration.get(registration)||[];
        if(!matches.length&&name)matches=byName.get(name)||[];
        if(matches.length!==1)throw new Error(matches.length?'Funcionário ambíguo':'Funcionário não localizado');
        const employee=matches[0],date=parseImportDate(at('date'));
        if(!validDate(date))throw new Error('Data inválida');
        const kind=parseKind(at('kind'));
        const times=(['start','breakStart','breakEnd','end'] as const).map(field=>kind==='work'?parseImportTime(at(field)):'');
        const day:PointDay={date,kind,source:'imported',start:times[0],breakStart:times[1],
          breakEnd:times[2],end:times[3],notes:identifier('notes').slice(0,500)};
        validateDay(day);
        const competence=date.slice(0,7),key=employee.id+'|'+date;
        if(seen.has(key))throw new Error('Dia duplicado nesta planilha');
        seen.add(key);
        const sheetKey=employee.id+'|'+competence;
        let target=sheets.get(sheetKey);
        if(!target){
          target=employee.createdAt?this.store.getSheet(employee.id,competence):
            {status:'draft',days:[]} as unknown as ReturnType<AttendanceStore['getSheet']>;
          sheets.set(sheetKey,target);
        }
        if(target.status==='closed')throw new Error('Ficha fechada: reabra antes de importar');
        const previous=target.days.find(d=>d.date===date);
        if(previous&&previous.source!=='suggested'&&!allowReplace)
          throw new Error('Já existe marcação real; habilite substituição explícita');
        accepted.push({employeeId:employee.id,competence,day});
              display.push({line,rowKey:i,status:'valid',message:'Pronto para importar',values});
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        errors.push('Linha '+line+': '+message);
                display.push({line,rowKey:i,status:'error',message,values});
      }
    }
    return {p,accepted,errors,display};
  }
  preview(token:string,mapping:ImportMapping,edits:TimeImportEdits={},offset=0,onlyErrors=false,allowReplace=false):ImportPreview {
    const {accepted,errors,display}=this.prepare(token,mapping,edits,allowReplace);
    const visible=onlyErrors?display.filter(row=>row.status==='error'):display;
    const people=this.employees();
    return {accepted:accepted.length,errors,totalRows:visible.length,rows:visible.slice(Math.max(0,offset),Math.max(0,offset)+20),
      samples:accepted.slice(0,8).map(item=>{
        const employee=people.find(e=>e.id===item.employeeId);
        return {employee:employee?.name||'',date:item.day.date,kind:item.day.kind,start:item.day.start,end:item.day.end};
      })};
  }
  commit(token:string,mapping:ImportMapping,allowReplace=false,allowPartial=false,edits:TimeImportEdits={}):{imported:number} {
    const pending=this.pending.get(token);
    if(!pending)throw new Error('Prévia de importação expirada.');
    if(this.store.hasImportedHash(pending.companyId,pending.hash))throw new Error('Este arquivo já foi importado.');
    const {p,accepted,errors}=this.prepare(token,mapping,edits,allowReplace);
    if(errors.length&&!allowPartial)throw new Error('Corrija linhas inválidas: '+errors.slice(0,4).join('; '));
    if(!accepted.length)throw new Error('Nenhuma marcação válida para importar.');
    if(this.store.hasImportedHash(p.companyId,p.hash))throw new Error('Este arquivo já foi importado.');
    const imported=this.store.atomicImport(()=>{
      const saved=this.store.saveMatrix(accepted,allowReplace);
      this.store.recordImport(p.companyId,p.filename,p.hash,saved);
      this.store.saveImportMapping(p.companyId,p.headers,mapping as Record<string,string>);
      return saved;
    });
    this.pending.delete(token);
    return {imported};
  }
}
