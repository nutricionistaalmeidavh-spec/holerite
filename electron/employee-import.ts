import {randomUUID} from 'node:crypto';
import {basename} from 'node:path';
import type {Employee,EmployeeInput} from '../src/shared/types';
import {HoleriteDatabase} from './database';
import {parseImportDate} from './time-import';
import {EMPLOYEE_IMPORT_COLUMNS} from '../src/shared/employee-import-fields';
import type {EmployeeImportField} from '../src/shared/employee-import-fields';
import {readSheet,cellText,normalizeHeader} from './import-sheet';
import type {CellRow} from './import-sheet';

export {EMPLOYEE_IMPORT_COLUMNS} from '../src/shared/employee-import-fields';
export type {EmployeeImportField} from '../src/shared/employee-import-fields';
export type EmployeeImportMapping=Partial<Record<EmployeeImportField,string>>;
export type EmployeeImportEdits=Record<number,Partial<Record<EmployeeImportField,string>>>;
export interface EmployeeImportChoice {token:string;filename:string;count:number;headers:string[];suggestedMapping:EmployeeImportMapping;sheetName:string;}
export interface EmployeeImportRow {line:number;status:'new'|'skipped'|'error';message:string;values:Record<EmployeeImportField,string>;}
export interface EmployeeImportPreview {
  created:number;skipped:number;errors:string[];totalRows:number;rows:EmployeeImportRow[];
  samples:Array<{name:string;cpf:string;registration:string;role:string;admissionDate:string}>;
}
type Pending={companyId:string;filename:string;headers:string[];rows:CellRow[];lines:number[];ids:string[]};
const norm=normalizeHeader;
function idOf(value:unknown,length:number):string{
  const digits=cellText(value).replace(/\D/g,'');
  return typeof value==='number'&&digits.length>0&&digits.length<length?digits.padStart(length,'0'):digits;
}
export function parseSalary(value:unknown):number {
  const raw=cellText(value).replace(/R\$/gi,'').replace(/\s/g,'');
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  const amount=Number(normalized),cents=Math.round(amount*100);
  if(!raw||!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(cents)||cents>10000000000)
    throw new Error('Salário inválido: informe valor mensal positivo em reais');
  return cents;
}
export class EmployeeImporter {
  private pending=new Map<string,Pending>();
  constructor(private db:HoleriteDatabase){}
  async choose(companyId:string,path:string,sheetName?:string):Promise<EmployeeImportChoice>{
    this.db.getCompany(companyId);
    const file=await readSheet(path,sheetName);
    const suggestedMapping:EmployeeImportMapping={};
    for(const field of EMPLOYEE_IMPORT_COLUMNS){
      const found=file.headers.find(h=>[field.label.replace(' *',''),...field.aliases].some(alias=>norm(alias)===norm(h)));
      if(found)suggestedMapping[field.key]=found;
    }
    this.pending.clear();
    const token=randomUUID();
    this.pending.set(token,{companyId,filename:basename(path),headers:file.headers,rows:file.rows,lines:file.lineNumbers,
      ids:file.rows.map(()=>randomUUID())});
    return {token,filename:basename(path),count:file.rows.length,headers:file.headers,suggestedMapping,sheetName:file.sheetName};
  }
  private prepare(token:string,mapping:EmployeeImportMapping,edits:EmployeeImportEdits={}){
    const p=this.pending.get(token);
    if(!p)throw new Error('Importação expirada. Selecione o arquivo novamente.');
    if(!mapping.name||!mapping.role||!mapping.admissionDate||!mapping.salary||(!mapping.cpf&&!mapping.registration))
      throw new Error('Mapeie nome, cargo, admissão, salário e CPF ou matrícula.');
    if(Object.values(mapping).some(key=>key&&!p.headers.includes(key)))
      throw new Error('Mapeamento contém colunas inexistentes.');
    if(Object.keys(edits).length>30000)throw new Error('Número excessivo de correções.');
    const existing=this.db.snapshot().employees.filter(e=>e.companyId===p.companyId);
    const byCpf=new Map(existing.filter(e=>e.cpf).map(e=>[e.cpf,e]));
    const byRegistration=new Map(existing.filter(e=>e.registration).map(e=>[norm(e.registration||''),e]));
    const seenCpf=new Set<string>(),seenRegistration=new Set<string>();
    const ready:Array<EmployeeInput&{id:string}>=[],errors:string[]=[],display:EmployeeImportRow[]=[];
    let skipped=0;
    p.rows.forEach((raw,index)=>{
      const line=p.lines[index];
      const at=(key:EmployeeImportField):unknown=>Object.prototype.hasOwnProperty.call(edits[line]||{},key)
        ?edits[line][key]:mapping[key]?raw[mapping[key]!]:undefined;
      const val=(key:EmployeeImportField)=>cellText(at(key));
      const values={} as Record<EmployeeImportField,string>;
      for(const field of EMPLOYEE_IMPORT_COLUMNS)values[field.key]=val(field.key);
      try{
        const cpf=idOf(at('cpf'),11),registration=val('registration');
        if(!cpf&&!registration)throw new Error('Informe CPF ou matrícula');
        if(cpf&&cpf.length!==11)throw new Error('CPF deve ter 11 dígitos');
        if(registration.length>40)throw new Error('Matrícula maior que 40 caracteres');
        if(cpf&&seenCpf.has(cpf)||registration&&seenRegistration.has(norm(registration)))
          throw new Error('Funcionário repetido na planilha');
        if(cpf)seenCpf.add(cpf);
        if(registration)seenRegistration.add(norm(registration));
        const cpfMatch=cpf?byCpf.get(cpf):undefined;
        const regMatch=registration?byRegistration.get(norm(registration)):undefined;
        if(cpfMatch&&regMatch&&cpfMatch.id!==regMatch.id)throw new Error('CPF e matrícula pertencem a funcionários diferentes');
        if(cpfMatch||regMatch){skipped++;display.push({line,status:'skipped',message:'Já cadastrado: não será alterado',values});return;}
        const name=val('name'),role=val('role');
        if(!name||name.length>150)throw new Error('Nome obrigatório (até 150 caracteres)');
        if(!role||role.length>150)throw new Error('Cargo obrigatório (até 150 caracteres)');
        const admissionDate=parseImportDate(at('admissionDate'));
        if(!admissionDate)throw new Error('Data de admissão inválida');
        const salaryCents=parseSalary(at('salary'));
        const dependentsText=val('dependents');
        const dependents=dependentsText?Number(dependentsText):0;
        if(!Number.isInteger(dependents)||dependents<0||dependents>30)throw new Error('Dependentes inválidos');
        const pis=idOf(at('pis'),11);
        if(pis&&pis.length!==11)throw new Error('PIS/NIS deve ter 11 dígitos');
        for(const [key,max] of [['sector',100],['jobSite',120],['costCenter',100],['workHours',100]] as const)
          if(val(key).length>max)throw new Error('Campo '+key+' excede '+max+' caracteres');
        const situation=norm(val('active'));
        if(situation&&!['ativo','ativa','sim','true','1','inativo','inativa','nao','false','0','desligado'].includes(situation))
          throw new Error('Situação inválida: use Ativo ou Inativo');
        const active=!['inativo','inativa','nao','0','false','desligado'].includes(situation);
        ready.push({id:p.ids[index],companyId:p.companyId,name,cpf,registration,role,admissionDate,salaryCents,
          dependents,active,sector:val('sector'),jobSite:val('jobSite'),costCenter:val('costCenter'),pis,workHours:val('workHours')});
        display.push({line,status:'new',message:'Pronto para cadastrar',values});
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        errors.push('Linha '+line+': '+message);
        display.push({line,status:'error',message,values});
      }
    });
    return {ready,skipped,errors,display};
  }
  planned(token:string,mapping:EmployeeImportMapping,edits:EmployeeImportEdits={}):Array<Employee>{
    const {ready,errors}=this.prepare(token,mapping,edits);
    if(errors.length)throw new Error('Corrija funcionários antes de preparar o pacote: '+errors[0]);
    return ready.map(e=>({...e,createdAt:'',id:e.id,companyId:e.companyId}));
  }
  preview(token:string,mapping:EmployeeImportMapping,edits:EmployeeImportEdits={},offset=0,onlyErrors=false):EmployeeImportPreview{
    const {ready,skipped,errors,display}=this.prepare(token,mapping,edits);
    const filtered=onlyErrors?display.filter(r=>r.status==='error'):display;
    return {created:ready.length,skipped,errors,totalRows:filtered.length,
      rows:filtered.slice(Math.max(0,offset),Math.max(0,offset)+20),
      samples:ready.slice(0,8).map(e=>({name:e.name,cpf:e.cpf,registration:e.registration||'',role:e.role,admissionDate:e.admissionDate}))};
  }
  commit(token:string,mapping:EmployeeImportMapping,allowPartial=false,edits:EmployeeImportEdits={}):{created:number;skipped:number}{
    const {ready,skipped,errors}=this.prepare(token,mapping,edits);
    if(errors.length&&!allowPartial)throw new Error('Revise as linhas inválidas antes de cadastrar: '+errors.slice(0,4).join('; '));
    if(!ready.length&&skipped===0)throw new Error('Nenhum funcionário válido para cadastrar.');
    const created=ready.length?this.db.importEmployeeBatch(ready):0;
    this.pending.delete(token);
    return {created,skipped};
  }
}
