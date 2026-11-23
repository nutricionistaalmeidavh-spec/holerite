import {extname} from 'node:path';
import {HoleriteDatabase} from './database';
import {EmployeeImporter} from './employee-import';
import type {EmployeeImportChoice,EmployeeImportPreview,EmployeeImportMapping} from './employee-import';
import {TimeImporter} from './time-import';
import type {ImportChoice,ImportPreview,ImportMapping} from './time-import';
import type {Employee} from '../src/shared/types';

export interface CombinedImportChoice {employees:EmployeeImportChoice;time:ImportChoice;}
export interface CombinedImportPreview {employees:EmployeeImportPreview;time:ImportPreview|null;warning:string;}
export class CombinedImporter{
  private employee:EmployeeImporter;
  private time:TimeImporter;
  private pending:CombinedImportChoice|null=null;
  private provisional:Employee[]=[];
  constructor(private db:HoleriteDatabase){
    this.employee=new EmployeeImporter(db);
    this.time=new TimeImporter(db.attendance,()=>{
      const existing=db.snapshot().employees,ids=new Set(existing.map(e=>e.id));
      return existing.concat(this.provisional.filter(e=>!ids.has(e.id)));
    });
  }
  async choose(companyId:string,path:string):Promise<CombinedImportChoice>{
    if(extname(path).toLowerCase()!=='.xlsx')throw new Error('O pacote completo deve ser XLSX com abas Funcionários e Ponto.');
    const employees=await this.employee.choose(companyId,path,'Funcionários');
    const time=await this.time.choose(companyId,path,'Ponto');
    this.pending={employees,time};
    this.provisional=[];
    return this.pending;
  }
  private selected(employeeToken:string,timeToken:string):CombinedImportChoice{
    if(!this.pending||this.pending.employees.token!==employeeToken||this.pending.time.token!==timeToken)
      throw new Error('Pacote expirado. Selecione a planilha novamente.');
    return this.pending;
  }
  preview(input:{employeeToken:string;timeToken:string;employeeMapping:EmployeeImportMapping;timeMapping:ImportMapping}):CombinedImportPreview{
    this.selected(input.employeeToken,input.timeToken);
    const employees=this.employee.preview(input.employeeToken,input.employeeMapping);
    if(employees.errors.length){
      this.provisional=[];
      return {employees,time:null,warning:'Corrija os funcionários para validar o vínculo das fichas de ponto.'};
    }
    this.provisional=this.employee.planned(input.employeeToken,input.employeeMapping);
    const time=this.time.preview(input.timeToken,input.timeMapping);
    return {employees,time,warning:''};
  }
  commit(input:{employeeToken:string;timeToken:string;employeeMapping:EmployeeImportMapping;timeMapping:ImportMapping;allowReplace?:boolean}):{created:number;skipped:number;imported:number}{
    this.selected(input.employeeToken,input.timeToken);
    const checked=this.preview(input);
    if(checked.employees.errors.length||!checked.time||checked.time.errors.length)
      throw new Error('Corrija os erros de ambos os cadastros antes de confirmar o pacote.');
    const people=this.employee.planned(input.employeeToken,input.employeeMapping);
    const outcome=this.db.runAtomicImport(()=>{
      const created=people.length?this.db.importEmployeeBatch(people):0;
      this.provisional=[];
      const point=this.time.commit(input.timeToken,input.timeMapping,input.allowReplace===true);
      return {created,skipped:checked.employees.skipped,imported:point.imported};
    });
    this.pending=null;
    return outcome;
  }
}
