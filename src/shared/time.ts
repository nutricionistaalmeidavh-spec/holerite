import type {PayItem} from './types';

export type DayKind='work'|'absence'|'vacation'|'holiday'|'rest'|'leave';
export type PointSource='suggested'|'manual'|'imported';
export type PointStatus='draft'|'closed';
export interface WorkSchedule {
  start:string; breakStart:string; breakEnd:string; end:string;
  weekdays:number[]; divisor:number; overtimePercent:number; nightPercent:number;
  toleranceMinutes:number; overtimeDestination:'pay'|'bank';
}
export interface PointDay {
  date:string; kind:DayKind; source:PointSource;
  start:string; breakStart:string; breakEnd:string; end:string; notes:string;
}
export interface PointSummary {
  workedMinutes:number; scheduledMinutes:number; overtimeMinutes:number;
  deficitMinutes:number; absenceMinutes:number; shortfallMinutes:number; lateMinutes:number; nightMinutes:number; bankMinutes:number;
  overtimeCents:number; deficitCents:number; nightCents:number;
  daysWorked:number; absences:number; suggestedDays:number; incompleteDays:number;
}
export const KINDS:DayKind[]=['work','absence','vacation','holiday','rest','leave'];
export function defaultSchedule():WorkSchedule {
  return {start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'17:00',
    weekdays:[1,2,3,4,5],divisor:220,overtimePercent:50,nightPercent:20,
    toleranceMinutes:0,overtimeDestination:'pay'};
}
export function validMonth(value:string):boolean {return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);}
export function validDate(value:string):boolean {
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function minutes(value:string):number {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('Horário inválido: '+value);
  const [h,m]=value.split(':').map(Number);
  return h*60+m;
}
function timeline(values:string[]):number[] {
  const out:number[]=[];
  for(const value of values){
    let current=minutes(value);
    if(out.length && current<out[out.length-1])current+=1440;
    if(out.length && current<out[out.length-1])throw new Error('Horários não estão em ordem cronológica.');
    out.push(current);
  }
  if(out[3]-out[0]>16*60)throw new Error('Jornada superior a 16 horas; confira a virada do dia.');
  return out;
}
export function workedMinutes(day:Pick<PointDay,'start'|'breakStart'|'breakEnd'|'end'>):number {
  const [a,b,c,d]=timeline([day.start,day.breakStart,day.breakEnd,day.end]);
  return b-a+d-c;
}
export function validateSchedule(schedule:WorkSchedule):WorkSchedule {
  if(!schedule||!Array.isArray(schedule.weekdays)||schedule.weekdays.length===0||
    schedule.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||
    new Set(schedule.weekdays).size!==schedule.weekdays.length)throw new Error('Dias de trabalho inválidos.');
  workedMinutes(schedule);
  if(!Number.isFinite(schedule.divisor)||schedule.divisor<1||schedule.divisor>300||
    !Number.isFinite(schedule.overtimePercent)||schedule.overtimePercent<0||schedule.overtimePercent>300||
    !Number.isFinite(schedule.nightPercent)||schedule.nightPercent<0||schedule.nightPercent>100||
    !Number.isInteger(schedule.toleranceMinutes)||schedule.toleranceMinutes<0||schedule.toleranceMinutes>60||
    !['pay','bank'].includes(schedule.overtimeDestination))throw new Error('Parâmetros de apuração inválidos.');
  return schedule;
}
export function weekday(date:string):number {return new Date(date+'T12:00:00Z').getUTCDay();}
function formatMinute(value:number):string {
  const v=Math.max(0,Math.min(1439,value));
  return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
}
function jitter(seed:string,limit:number):number {
  if(!limit)return 0;
  let hash=2166136261;
  for(const c of seed){hash=Math.imul(hash^c.charCodeAt(0),16777619);}
  return (hash>>>0)%(limit*2+1)-limit;
}
// Generates only suggested/forecast hours, never actual punches.
export function previewMonth(competence:string,schedule:WorkSchedule,variationMinutes=0):PointDay[] {
  if(!validMonth(competence))throw new Error('Competência inválida.');
  validateSchedule(schedule);
  if(!Number.isInteger(variationMinutes)||variationMinutes<0||variationMinutes>10)throw new Error('Variação inválida.');
  const [year,month]=competence.split('-').map(Number),last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:last},(_,i)=>{
    const date=competence+'-'+String(i+1).padStart(2,'0');
    const work=schedule.weekdays.includes(weekday(date));
    const fields=['start','breakStart','breakEnd','end'] as const;
    const suggested=fields.map((field,index)=>work?formatMinute(minutes(schedule[field])+jitter(date+':'+index,variationMinutes)):'');
    return {date,kind:work?'work':'rest',source:'suggested',start:suggested[0],breakStart:suggested[1],breakEnd:suggested[2],end:suggested[3],notes:''};
  });
}
export function validateDay(day:PointDay):PointDay {
  if(!validDate(day.date)||!KINDS.includes(day.kind)||!['suggested','manual','imported'].includes(day.source)||
    typeof day.notes!=='string'||day.notes.length>500)throw new Error('Dia, origem ou observação inválidos.');
  const fields=[day.start,day.breakStart,day.breakEnd,day.end];
  if(fields.some(x=>typeof x!=='string'))throw new Error('Marcação inválida.');
  if(day.kind!=='work') {
    if(fields.some(Boolean))throw new Error('Dias não trabalhados não podem ter batidas.');
  }else if(fields.some(Boolean)) {
    if(fields.some(x=>!x))throw new Error('Informe as quatro marcações do dia.');
    workedMinutes(day);
  }
  return day;
}
function nightMinutesBetween(start:number,end:number):number {
  let total=0;
  for(let m=start;m<end;m++){
    const hour=(m%1440+1440)%1440;
    if(hour>=22*60||hour<5*60)total++;
  }
  return total;
}
export function assessMonth(days:PointDay[],schedule:WorkSchedule,salaryCents:number):PointSummary {
  validateSchedule(schedule);
  if(!Number.isSafeInteger(salaryCents)||salaryCents<=0)throw new Error('Salário inválido.');
  const scheduled=workedMinutes(schedule),expected=minutes(schedule.start);
  const result:PointSummary={workedMinutes:0,scheduledMinutes:0,overtimeMinutes:0,
    deficitMinutes:0,absenceMinutes:0,shortfallMinutes:0,lateMinutes:0,nightMinutes:0,bankMinutes:0,
    overtimeCents:0,deficitCents:0,nightCents:0,daysWorked:0,absences:0,suggestedDays:0,incompleteDays:0};
  const seen=new Set<string>();
  for(const day of days){
    validateDay(day);
    if(seen.has(day.date))throw new Error('Dia duplicado: '+day.date);
    seen.add(day.date);
    if(day.source==='suggested'){result.suggestedDays++;continue;}
    const expectedDay=schedule.weekdays.includes(weekday(day.date));
    if(day.kind==='absence'){
      result.absences++;
      if(expectedDay){result.scheduledMinutes+=scheduled;result.deficitMinutes+=scheduled;result.absenceMinutes+=scheduled;}
      continue;
    }
    if(day.kind!=='work')continue;
    if(!day.start){result.incompleteDays++;continue;}
    const [a,b,c,d]=timeline([day.start,day.breakStart,day.breakEnd,day.end]);
    const minutesWorked=b-a+d-c;
    result.daysWorked++;
    result.workedMinutes+=minutesWorked;
    const planned=expectedDay?scheduled:0;
    result.scheduledMinutes+=planned;
    result.overtimeMinutes+=Math.max(0,minutesWorked-planned);
    result.deficitMinutes+=Math.max(0,planned-minutesWorked);
    result.shortfallMinutes+=Math.max(0,planned-minutesWorked);
    result.lateMinutes+=expectedDay?Math.max(0,a-expected-schedule.toleranceMinutes):0;
    result.nightMinutes+=nightMinutesBetween(a,b)+nightMinutesBetween(c,d);
  }
  const centPerMinute=salaryCents/(schedule.divisor*60);
  result.bankMinutes=schedule.overtimeDestination==='bank'?result.overtimeMinutes-result.shortfallMinutes:0;
  result.overtimeCents=schedule.overtimeDestination==='pay'?Math.round(result.overtimeMinutes*centPerMinute*(1+schedule.overtimePercent/100)):0;
  result.deficitCents=Math.round((result.absenceMinutes+(schedule.overtimeDestination==='bank'?0:result.shortfallMinutes))*centPerMinute);
  result.nightCents=Math.round(result.nightMinutes*centPerMinute*schedule.nightPercent/100);
  return result;
}
export function payrollEntriesFromPoint(competence:string,summary:PointSummary,schedule:WorkSchedule):PayItem[] {
  if(!validMonth(competence))throw new Error('Competência inválida.');
  const entries:PayItem[]=[];
  function add(code:string,description:string,kind:'earning'|'deduction',amountCents:number){
    if(amountCents>0)entries.push({id:'ponto-'+competence+'-'+code,code,description,kind,amountCents,
      inssBase:kind==='earning',irBase:kind==='earning',fgtsBase:kind==='earning'});
  }
  if(schedule.overtimeDestination==='pay')add('HEXTRA','Horas extras do ponto', 'earning',summary.overtimeCents);
  add('HNOT','Adicional noturno do ponto', 'earning',summary.nightCents);
  add('FALTAS','Ausências/horas não trabalhadas', 'deduction',summary.deficitCents);
  return entries;
}
