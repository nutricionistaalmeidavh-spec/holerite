import {calculateInss2026, calculateIrrf2026} from './payroll';
import type {PayItem, PayrollCalculation, TaxMode} from './types';

export type PayrollKind = 'monthly' | 'vacation' | 'thirteenth-first' | 'thirteenth-second' | 'termination';
export type TerminationReason = 'without-cause' | 'with-cause' | 'resignation' | 'mutual';
export type NoticeKind = 'indemnified' | 'worked' | 'none';

export interface VacationOptions {
  startDate: string;
  days: number;
  soldDays: number;
  acquisitionStart: string;
}
export interface ThirteenthOptions {
  months: number;
  advanceCents: number;
}
export interface TerminationOptions {
  date: string;
  reason: TerminationReason;
  notice: NoticeKind;
  vacationAccrualStart: string;
  accruedPeriods: number;
  overduePeriods: number;
  fgtsPenaltyBasisCents: number;
  prior13thAdvanceCents: number;
}
export interface SpecialOptions {
  vacation?: VacationOptions;
  thirteenth?: ThirteenthOptions;
  termination?: TerminationOptions;
}
export interface SpecialInput {
  kind: Exclude<PayrollKind, 'monthly'>;
  competence: string;
  salaryCents: number;
  admissionDate: string;
  dependents: number;
  taxMode: TaxMode;
  entries: PayItem[];
  options: SpecialOptions;
}
export interface SpecialResult extends PayrollCalculation {
  payableBy: string;
  fgtsPenaltyCents: number;
  noticeDays: number;
  warnings: string[];
}
const round=(v:number)=>Math.round(v);
function moneyValue(v:number,label:string) {
  if(!Number.isSafeInteger(v) || v<0 || v>100_000_000_00)throw new Error(label+' inválido.');
  return v;
}
function whole(v:number,min:number,max:number,label:string) {
  if(!Number.isInteger(v)||v<min||v>max)throw new Error(label+' inválido.');
  return v;
}
function parseDate(s:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('Data inválida.');
  const d=new Date(s+'T00:00:00.000Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error('Data inválida.');
  return d;
}
const iso=(d:Date)=>d.toISOString().slice(0,10);
function addDays(s:string,days:number) {const d=parseDate(s);d.setUTCDate(d.getUTCDate()+days);return iso(d);}
function completedYears(start:string,end:string) {
  const s=parseDate(start),e=parseDate(end);
  let years=e.getUTCFullYear()-s.getUTCFullYear();
  if(e.getUTCMonth()<s.getUTCMonth()||(e.getUTCMonth()===s.getUTCMonth()&&e.getUTCDate()<s.getUTCDate())) years--;
  return Math.max(0,years);
}
export function calculateNoticeDays(admissionDate:string,terminationDate:string):number {
  if(parseDate(terminationDate)<parseDate(admissionDate))throw new Error('Data de desligamento anterior à admissão.');
  return 30+3*Math.min(20,completedYears(admissionDate,terminationDate));
}
// Frações mensais com 15 ou mais dias computam um avo; a base anual é independente.
export function calculateThirteenthMonths(admissionDate:string,endDate:string,year:number):number {
  const admission=parseDate(admissionDate),end=parseDate(endDate);
  whole(year,2000,2099,'Ano');
  if(end<admission)return 0;
  let total=0;
  for(let m=0;m<12;m++){
    const from=new Date(Date.UTC(year,m,1));
    const to=new Date(Date.UTC(year,m+1,0));
    if(from>end)break;
    const a=new Date(Math.max(from.getTime(),admission.getTime()));
    const b=new Date(Math.min(to.getTime(),end.getTime()));
    if(b>=a&&((b.getTime()-a.getTime())/86400000+1)>=15)total++;
  }
  return total;
}
function vacationMonths(acquisition:string,end:string):number {
  const start=parseDate(acquisition),finish=parseDate(end);
  if(finish<start)throw new Error('Início aquisitivo após o desligamento.');
  const full=(finish.getUTCFullYear()-start.getUTCFullYear())*12+finish.getUTCMonth()-start.getUTCMonth();
  let months=full;
  const anniversary=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+full,start.getUTCDate()));
  const leftover=round((finish.getTime()-anniversary.getTime())/86400000)+1;
  if(leftover>=15)months++;
  return Math.min(12,Math.max(0,months));
}
function line(code:string,description:string,amount:number,kind:'earning'|'deduction'='earning',inssBase=false,irBase=false,fgtsBase=false):PayItem {
  const amountCents=moneyValue(round(amount),'Valor');
  return {id:'generated:'+code,code,description,kind,amountCents,inssBase,irBase,fgtsBase};
}
function dateMatchesCompetence(date:string,competence:string,label:string) {
  if(date.slice(0,7)!==competence)throw new Error(label+' não corresponde à competência.');
}
const reductionNote='Cálculo-padrão sujeito à revisão por responsável de folha; convenção, médias, afastamentos e outros vínculos não são apurados automaticamente.';

export function calculateSpecialPayroll(input:SpecialInput):SpecialResult {
  const {kind,competence,salaryCents,admissionDate,dependents,taxMode,entries,options}=input;
  moneyValue(salaryCents,'Salário');
  if(salaryCents===0)throw new Error('Salário deve ser positivo.');
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence))throw new Error('Competência inválida.');
  if(taxMode!=='automatic'&&taxMode!=='manual')throw new Error('Modo tributário inválido.');
  if(taxMode==='automatic'&&!competence.startsWith('2026-'))throw new Error('Cálculo automático disponível apenas para 2026.');
  whole(dependents,0,30,'Dependentes');
  parseDate(admissionDate);
  if(!options||typeof options!=='object'||!Array.isArray(entries)||entries.length>100)throw new Error('Opções ou lançamentos inválidos.');

  let generated:PayItem[]=[];
  let fgtsPenaltyCents=0;
  let noticeDays=0;
  let payableBy='';
  let inss=0;
  let irrf=0;
  let inssBase=0;
  let irBase=0;
  let fgtsBase=0;
  const warnings=[reductionNote];
  const salaryDay=salaryCents/30;
  const append=(i:PayItem)=>{if(i.amountCents>0)generated.push(i);};
  const kindOptions=Object.keys(options).filter(k=>(options as Record<string,unknown>)[k]!=null);
  if(kindOptions.length!==1)throw new Error('Informe exatamente um conjunto de opções do tipo selecionado.');

  if(kind==='vacation'){
    const v=options.vacation;
    if(!v)throw new Error('Informe as opções de férias.');
    whole(v.days,1,30,'Dias de férias');
    whole(v.soldDays,0,10,'Dias de abono');
    if(v.days+v.soldDays>30)throw new Error('Dias de férias e abono excedem 30.');
    if(v.soldDays>Math.floor((v.days+v.soldDays)/3))throw new Error('Abono não pode ultrapassar um terço dos dias.');
    dateMatchesCompetence(v.startDate,competence,'Início das férias');
    if(parseDate(v.startDate)<parseDate(admissionDate))throw new Error('Férias antes da admissão.');
    parseDate(v.acquisitionStart);
    const paidDays=round(salaryCents*v.days/30);
    const third=round(paidDays/3);
    const sold=round(salaryCents*v.soldDays/30);
    append(line('FER-G','Férias gozadas ('+v.days+' dias)',paidDays,'earning',true,true,true));
    append(line('FER-1/3','Terço constitucional de férias',third,'earning',true,true,true));
    append(line('ABONO','Abono pecuniário ('+v.soldDays+' dias)',sold));
    append(line('AB-1/3','Terço sobre abono pecuniário',round(sold/3)));
    payableBy=addDays(v.startDate,-2);
    warnings.push('Adiantamento de férias pode exigir ajuste previdenciário na folha mensal; início próximo de repouso/feriado e prazos aquisitivos exigem conferência.');
  } else if(kind==='thirteenth-first'||kind==='thirteenth-second'){
    const t=options.thirteenth;
    if(!t)throw new Error('Informe os avos e o adiantamento do 13º.');
    whole(t.months,1,12,'Avos do 13º');
    moneyValue(t.advanceCents,'Adiantamento de 13º');
    const full=round(salaryCents*t.months/12);
    if(t.advanceCents>full)throw new Error('Adiantamento do 13º superior ao total devido.');
    if(kind==='thirteenth-first'){
      if(t.advanceCents!==0)throw new Error('A primeira parcela não deve descontar adiantamento anterior.');
      append(line('13-ADI','Adiantamento de 13º ('+t.months+'/12)',round(full/2),'earning',false,false,true));
      payableBy=competence.slice(0,4)+'-11-30';
    }else{
      append(line('13-INT','13º salário integral ('+t.months+'/12)',full,'earning',true,true,false));
      append(line('AD13','Adiantamento de 13º descontado',t.advanceCents,'deduction'));
      payableBy=competence.slice(0,4)+'-12-20';
      fgtsBase=full-t.advanceCents;
    }
    warnings.push('13º calculado em competência própria; confira avos, médias salariais, antecipações e FGTS efetivamente recolhido.');
  } else if(kind==='termination'){
    const t=options.termination;
    if(!t)throw new Error('Informe os dados da rescisão.');
    if(!['without-cause','with-cause','resignation','mutual'].includes(t.reason))throw new Error('Motivo da rescisão inválido.');
    if(!['indemnified','worked','none'].includes(t.notice))throw new Error('Aviso-prévio inválido.');
    dateMatchesCompetence(t.date,competence,'Data da rescisão');
    if(parseDate(t.date)<parseDate(admissionDate))throw new Error('Data da rescisão anterior à admissão.');
    whole(t.accruedPeriods,0,10,'Períodos de férias vencidos');
    whole(t.overduePeriods,0,10,'Períodos de férias em dobro');
    moneyValue(t.fgtsPenaltyBasisCents,'Base da multa FGTS');
    moneyValue(t.prior13thAdvanceCents,'Adiantamento do 13º');
    if(t.reason==='with-cause'&&t.notice==='indemnified')throw new Error('Justa causa não gera aviso indenizado.');
    if(t.reason==='resignation'&&t.notice==='indemnified')throw new Error('Pedido de demissão não gera aviso indenizado pelo empregador.');
    const eligible=t.reason!=='with-cause';
    noticeDays=calculateNoticeDays(admissionDate,t.date);
    const paidNotice=t.notice==='indemnified' ? (t.reason==='mutual'?round(salaryDay*noticeDays/2):round(salaryDay*noticeDays)) : 0;
    const projectionDays=(t.notice==='indemnified'&&eligible)?noticeDays:0;
    const projected=addDays(t.date,projectionDays);
    const [year,month,day]=t.date.split('-').map(Number);
    const workedDays=Math.min(day,30);
    const balance=round(salaryDay*workedDays);
    append(line('SALDO','Saldo de salário ('+workedDays+' dias)',balance,'earning',true,true,true));
    append(line('AVISO','Aviso-prévio indenizado ('+noticeDays+' dias)',paidNotice,'earning',false,false,true));
    for(let i=0;i<t.accruedPeriods;i++) {
      append(line('FER-V'+(i||''),'Férias adquiridas não gozadas',salaryCents));
      append(line('FER-1V'+(i||''),'Terço sobre férias adquiridas',round(salaryCents/3)));
    }
    for(let i=0;i<t.overduePeriods;i++){
      append(line('FER-D'+(i||''),'Férias indenizadas em dobro',salaryCents*2));
      append(line('FER-1D'+(i||''),'Terço sobre férias em dobro',round(salaryCents*2/3)));
    }
    if(eligible) {
      const proportionalMonths=vacationMonths(t.vacationAccrualStart,projected);
      const proportional=round(salaryCents*proportionalMonths/12);
      append(line('FER-P','Férias proporcionais ('+proportionalMonths+'/12)',proportional));
      append(line('FER-1P','Terço sobre férias proporcionais',round(proportional/3)));
      const months=calculateThirteenthMonths(admissionDate,projected,year);
      const thirteenth=round(salaryCents*months/12);
      if(t.prior13thAdvanceCents>thirteenth)throw new Error('Adiantamento anterior maior que o 13º proporcional.');
      append(line('RES13','13º proporcional ('+months+'/12)',thirteenth,'earning',false,false,true));
      append(line('AD13','Adiantamento do 13º descontado',t.prior13thAdvanceCents,'deduction'));
      if(taxMode==='automatic'&&thirteenth) {
        const inss13=calculateInss2026(thirteenth);
        const ir13=calculateIrrf2026({taxableCents:thirteenth,inssCents:inss13,dependents});
        append(line('INSS13','INSS sobre 13º proporcional',inss13,'deduction'));
        append(line('IRRF13','IRRF sobre 13º proporcional',ir13,'deduction'));
      }
    }else if(t.prior13thAdvanceCents!==0)warnings.push('Adiantamento de 13º não compensado automaticamente em rescisão por justa causa. Insira ajuste manual.');
    if(['without-cause','mutual'].includes(t.reason)){
      fgtsPenaltyCents=round(t.fgtsPenaltyBasisCents*(t.reason==='mutual'?0.20:0.40));
    }
    payableBy=addDays(t.date,10);
    warnings.push('A multa do FGTS é informativa e não integra o líquido do TRCT. Use como base o saldo de depósitos pertinente, informado manualmente.');
    warnings.push('Projeção do aviso aplicada aos avos, mas não apura estabilidade, verbas de CCT, demissão indireta, redução de aviso ou saldo bancário do FGTS.');
  } else throw new Error('Tipo de folha não suportado.');

  const specialCodes=new Set(generated.map(i=>i.code.toUpperCase()));
  const extras=entries.map(item=>{
    if(!item||typeof item.code!=='string'||!item.code.trim()||item.code.length>12||specialCodes.has(item.code.toUpperCase())||
      ['SAL','INSS','IRRF','INSS13','IRRF13'].includes(item.code.toUpperCase())||
      typeof item.description!=='string'||!item.description.trim()||item.description.length>100||
      !['earning','deduction'].includes(item.kind)||
      typeof item.id!=='string'||!item.id.trim()||
      !Number.isSafeInteger(item.amountCents)||item.amountCents<=0 ||
      [item.inssBase,item.irBase,item.fgtsBase].some(x=>typeof x!=='boolean'))throw new Error('Lançamento adicional inválido ou código reservado.');
    return {...item,inssBase:item.kind==='earning'&&item.inssBase,irBase:item.kind==='earning'&&item.irBase,fgtsBase:item.kind==='earning'&&item.fgtsBase};
  });
  if(new Set(extras.map(i=>i.id)).size!==extras.length)throw new Error('IDs de lançamento duplicados.');
  const earnings=[...generated,...extras.filter(i=>i.kind==='earning')];
  const deductions=extras.filter(i=>i.kind==='deduction');
  const sum=(items:PayItem[])=>items.reduce((s,i)=>s+i.amountCents,0);
  const taxable=earnings.filter(i=>i.inssBase);
  const taxIR=earnings.filter(i=>i.irBase);
  inssBase=sum(taxable);
  irBase=sum(taxIR);
  if(kind!=='thirteenth-second')fgtsBase=sum(earnings.filter(i=>i.fgtsBase));
  if(kind==='termination'){
    // INSS e IRRF do 13º são calculados separadamente, com deduções próprias.
    const total13=sum(earnings.filter(i=>i.code==='RES13'));
    inssBase+=total13;
    irBase+=total13;
  }
  if(taxMode==='automatic'&&kind!=='thirteenth-first') {
    const regularBase=kind==='termination'?sum(taxable):inssBase;
    const regularIR=kind==='termination'?sum(taxIR):irBase;
    inss=calculateInss2026(regularBase);
    irrf=calculateIrrf2026({taxableCents:regularIR,inssCents:inss,dependents});
  }
  if(inss>0)append(line('INSS','INSS (2026)',inss,'deduction'));
  if(irrf>0)append(line('IRRF','IRRF (2026)',irrf,'deduction'));
  if(kind==='thirteenth-first')fgtsBase=sum(earnings.filter(i=>i.fgtsBase));
  const items=[...earnings,...deductions,...generated.filter(i=>i.kind==='deduction')];
  const grossCents=sum(earnings),deductionCents=sum(items.filter(i=>i.kind==='deduction'));
  const netCents=grossCents-deductionCents;
  if(netCents<0)throw new Error('Valor líquido negativo. Revise os descontos e adiantamentos.');
  if(!Number.isSafeInteger(grossCents)||!Number.isSafeInteger(netCents))throw new Error('Valor fora do limite seguro.');
  const inss13Cents=sum(items.filter(i=>i.code==='INSS13'));
  const irrf13Cents=sum(items.filter(i=>i.code==='IRRF13'));
  return {
    items,totals:{grossCents,deductionCents,netCents,inssCents:inss+inss13Cents,irrfCents:irrf+irrf13Cents,fgtsCents:round(fgtsBase*0.08),inssBaseCents:inssBase,irBaseCents:irBase,fgtsBaseCents:fgtsBase},
    taxVersion:taxMode==='automatic'?'BR-2026-SPECIAL-1':'manual-sem-apuracao',
    payableBy,fgtsPenaltyCents,noticeDays,warnings
  };
}
