import ExcelJS from 'exceljs';
import {readFile, stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {basename, extname} from 'node:path';
import type {EmployeeInput} from '../src/shared/types';
import {HoleriteDatabase} from './database';
import {parseImportDate} from './time-import';

export type EmployeeImportField='name'|'cpf'|'registration'|'role'|'admissionDate'|'salary'|'dependents'|'active'|'sector'|'jobSite'|'costCenter'|'pis'|'workHours';
export type EmployeeImportMapping=Partial<Record<EmployeeImportField,string>>;
export interface EmployeeImportChoice {token:string;filename:string;count:number;headers:string[];suggestedMapping:EmployeeImportMapping;}
export interface EmployeeImportPreview {created:number;skipped:number;errors:string[];samples:Array<{name:string;cpf:string;registration:string;role:string;admissionDate:string}>;}
type Pending={companyId:string;filename:string;headers:string[];rows:Array<Record<string,unknown>>};
export const EMPLOYEE_IMPORT_COLUMNS:ReadonlyArray<{key:EmployeeImportField;label:string;aliases:string[]}>= [
  {key:'name',label:'Nome completo *',aliases:['nome','nome completo','funcionário','funcionario','colaborador']},
  {key:'cpf',label:'CPF',aliases:['cpf','documento']},
  {key:'registration',label:'Matrícula',aliases:['matrícula','matricula','registro']},
  {key:'role',label:'Cargo *',aliases:['cargo','função','funcao']},
  {key:'admissionDate',label:'Admissão *',aliases:['admissão','admissao','data de admissão','data admissao']},
  {key:'salary',label:'Salário mensal (R$) *',aliases:['salário','salario','salário mensal','salario base','salario mensal','salário-base']},
  {key:'dependents',label:'Dependentes',aliases:['dependentes','dependentes irrf']},
  {key:'active',label:'Situação',aliases:['situação','situacao','ativo','status']},
  {key:'sector',label:'Setor',aliases:['setor','departamento']},
  {key:'jobSite',label:'Obra/local de trabalho',aliases:['obra','local de trabalho']},
  {key:'costCenter',label:'Centro de custo',aliases:['centro de custo','centro custo']},
  {key:'pis',label:'PIS/NIS',aliases:['pis','nis','pis/nis']},
  {key:'workHours',label:'Jornada contratual',aliases:['jornada','jornada contratual','horas semanais']}
];
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function asText(value:unknown):string {
  if(value===null||value===undefined)return '';
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==='object'){
    if('result' in value)return asText(value.result);
    if('text' in value)return asText(value.text);
    if('richText' in value)return (value.richText as Array<{text:string}>).map(t=>t.text).join('');
  }
  return String(value).trim();
}
function salaryCents(value:unknown):number {
  const raw=asText(value).replace(/R\$/gi,'').replace(/\s/g,'');
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  const n=Number(normalized);
  const cents=Math.round(n*100);
  if(!raw||!Number.isFinite(n)||n<=0||!Number.isSafeInteger(cents)||cents>10000000000)
    throw new Error('Salário inválido: informe valor mensal positivo em reais');
  return cents;
}
function dateOf(value:unknown):string {
  const parsed=parseImportDate(value);
  if(!parsed)throw new Error('Data de admissão inválida');
  return parsed;
}
function cellId(value:unknown,length:number):string {
  const digits=asText(value).replace(/\D/g,'');
  return typeof value==='number'&&digits.length>0&&digits.length<length?digits.padStart(length,'0'):digits;
}
export class EmployeeImporter {
  private pending=new Map<string,Pending>();
  constructor(private db:HoleriteDatabase){}
  async choose(companyId:string,path:string):Promise<EmployeeImportChoice>{
    this.db.getCompany(companyId);
    const ext=extname(path).toLowerCase();
    if(ext!=='.csv'&&ext!=='.xlsx')throw new Error('Selecione um arquivo CSV ou XLSX.');
    const info=await stat(path);
    if(!info.size||info.size>30*1024*1024)throw new Error('Arquivo inválido ou maior que 30 MB.');
    const workbook=new ExcelJS.Workbook();
    if(ext==='.csv'){
      const data=await readFile(path);
      const first=data.subarray(0,4096).toString('utf8').split(/\r?\n/)[0]||'';
      const delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
      await workbook.csv.readFile(path,{parserOptions:{delimiter}});
    }else await workbook.xlsx.readFile(path);
    const sheet=workbook.worksheets[0];
    if(!sheet)throw new Error('Planilha vazia.');
    const headers=Array.from({length:Math.min(sheet.columnCount,50)},(_,index)=>asText(sheet.getRow(1).getCell(index+1).value));
    if(!headers.length||headers.some(h=>!h)||new Set(headers).size!==headers.length)
      throw new Error('A primeira linha deve conter cabeçalhos únicos e preenchidos.');
    const rows:Array<Record<string,unknown>>=[];
    for(let i=2;i<=sheet.rowCount;i++){
      const excelRow=sheet.getRow(i);
      const cells=Object.fromEntries(headers.map((h,index)=>[h,excelRow.getCell(index+1).value]));
      if(Object.values(cells).every(v=>!asText(v)))continue;
      rows.push(cells);
      if(rows.length>30000)throw new Error('Limite de 30.000 funcionários por arquivo.');
    }
    if(!rows.length)throw new Error('Nenhum funcionário encontrado.');
    const suggestedMapping:EmployeeImportMapping={};
    for(const field of EMPLOYEE_IMPORT_COLUMNS){
      const found=headers.find(h=>field.aliases.some(alias=>normalize(alias)===normalize(h)));
      if(found)suggestedMapping[field.key]=found;
    }
    this.pending.clear();
    const token=randomUUID();
    this.pending.set(token,{companyId,filename:basename(path),headers,rows});
    return {token,filename:basename(path),count:rows.length,headers,suggestedMapping};
  }
  private prepare(token:string,mapping:EmployeeImportMapping){
    const p=this.pending.get(token);
    if(!p)throw new Error('Importação expirada. Selecione novamente o arquivo.');
    if(!mapping.name||!mapping.role||!mapping.admissionDate||!mapping.salary||(!mapping.cpf&&!mapping.registration))
      throw new Error('Mapeie nome, cargo, admissão, salário e CPF ou matrícula.');
    if(Object.values(mapping).some(column=>column&&!p.headers.includes(column)))
      throw new Error('Mapeamento contém colunas inexistentes.');
    const existing=this.db.snapshot().employees.filter(e=>e.companyId===p.companyId);
    const seenCpf=new Set<string>(),seenRegistration=new Set<string>();
    const ready:EmployeeInput[]=[],errors:string[]=[];
    let skipped=0;
    p.rows.forEach((row,index)=>{
      try{
        const at=(key:EmployeeImportField)=>mapping[key]?row[mapping[key]!]:undefined;
        const val=(key:EmployeeImportField)=>asText(at(key));
        const cpf=cellId(at('cpf'),11),registration=val('registration');
        if(!cpf&&!registration)throw new Error('Informe CPF ou matrícula');
        if(cpf&&cpf.length!==11)throw new Error('CPF deve conter 11 dígitos');
        if(registration.length>40)throw new Error('Matrícula maior que 40 caracteres');
        if(cpf&&seenCpf.has(cpf)||registration&&seenRegistration.has(normalize(registration)))
          throw new Error('Funcionário duplicado neste arquivo');
        if(cpf)seenCpf.add(cpf);
        if(registration)seenRegistration.add(normalize(registration));
        const cpfMatch=cpf?existing.find(e=>e.cpf===cpf):undefined;
        const registrationMatch=registration?existing.find(e=>normalize(e.registration||'')===normalize(registration)):undefined;
        if(cpfMatch&&registrationMatch&&cpfMatch.id!==registrationMatch.id)
          throw new Error('CPF e matrícula pertencem a funcionários diferentes');
        if(cpfMatch||registrationMatch){skipped++;return;}
        const dependentsText=val('dependents');
        const dependents=dependentsText?Number(dependentsText):0;
        if(!Number.isInteger(dependents)||dependents<0||dependents>30)throw new Error('Dependentes inválidos');
        const status=normalize(val('active'));
        const active=!['inativo','inativa','nao','0','false','desligado'].includes(status);
        const name=val('name'),role=val('role');
        if(!name||name.length>150)throw new Error('Nome obrigatório (até 150 caracteres)');
        if(!role||role.length>150)throw new Error('Cargo obrigatório (até 150 caracteres)');
        const admissionDate=dateOf(at('admissionDate'));
        const salary=salaryCents(at('salary'));
        const pis=cellId(at('pis'),11);
        if(pis&&pis.length!==11)throw new Error('PIS/NIS deve conter 11 dígitos');
        ready.push({companyId:p.companyId,name,cpf,registration,role,admissionDate,salaryCents:salary,
          dependents,active,sector:val('sector'),jobSite:val('jobSite'),costCenter:val('costCenter'),pis,
          workHours:val('workHours')});
      }catch(error){
        errors.push('Linha '+(index+2)+': '+(error instanceof Error?error.message:String(error)));
      }
    });
    return {ready,skipped,errors};
  }
  preview(token:string,mapping:EmployeeImportMapping):EmployeeImportPreview{
    const {ready,skipped,errors}=this.prepare(token,mapping);
    return {created:ready.length,skipped,errors,samples:ready.slice(0,8).map(e=>({
      name:e.name,cpf:e.cpf,registration:e.registration||'',role:e.role,admissionDate:e.admissionDate
    }))};
  }
  commit(token:string,mapping:EmployeeImportMapping):{created:number;skipped:number}{
    const {ready,skipped,errors}=this.prepare(token,mapping);
    if(errors.length)throw new Error('Corrija os dados inválidos: '+errors.slice(0,4).join('; '));
    if(!ready.length)throw new Error('Nenhum funcionário novo para importar.');
    const created=this.db.importEmployeeBatch(ready);
    this.pending.delete(token);
    return {created,skipped};
  }
}
