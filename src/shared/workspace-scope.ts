export type PayrollScope={companyId:string;competence?:string;kind?:string;status?:string;search?:string};
type PayrollRow={companyId:string;competence:string;kind?:string;status:string;details:{employee:{name:string}}};
export function filterPayrollRecords<T extends PayrollRow>(rows:T[],scope:PayrollScope):T[]{
  const query=(scope.search??'').trim().toLowerCase();
  return rows.filter(p=>p.companyId===scope.companyId
    &&(!scope.competence||p.competence===scope.competence)
    &&(!scope.kind||scope.kind==='all'||(p.kind??'monthly')===scope.kind)
    &&(!scope.status||scope.status==='all'||p.status===scope.status)
    &&(p.details.employee.name+' '+p.competence).toLowerCase().includes(query));
}
export function filterReportRows<T extends {employeeId:string}>(rows:T[],ids?:string[]):T[]{
  if(ids===undefined)return rows;
  const selected=new Set(ids);
  return rows.filter(row=>selected.has(row.employeeId));
}
export function collectDraftChanges<T>(rows:Array<{key:string;employeeId:string;competence:string;revision:number}>,drafts:Record<string,T>){
  return rows.filter(row=>Object.prototype.hasOwnProperty.call(drafts,row.key)).map(row=>({
    employeeId:row.employeeId,competence:row.competence,expectedRevision:row.revision,day:drafts[row.key]
  }));
}
export const operationCompleted=(result:unknown)=>result!==false;
