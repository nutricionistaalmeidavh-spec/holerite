import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSchedule, previewMonth, assessMonth, payrollEntriesFromPoint} from './time';

test('preview marks are suggestions and are excluded from payroll apportionment', () => {
  const rows = previewMonth('2026-11', defaultSchedule(), 0);
  assert.equal(rows.length, 30);
  assert.equal(rows.find(day => day.date === '2026-11-02')?.source, 'suggested');
  assert.equal(assessMonth(rows, defaultSchedule(), 300000).workedMinutes, 0);
});

test('four punches assess overtime, lateness and non-work days without inventing punches', () => {
  const schedule = defaultSchedule();
  const days = [
    {date:'2026-11-03',kind:'work' as const,source:'manual' as const,start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'18:00',notes:''},
    {date:'2026-11-04',kind:'work' as const,source:'manual' as const,start:'08:15',breakStart:'12:00',breakEnd:'13:00',end:'17:00',notes:''},
    {date:'2026-11-05',kind:'absence' as const,source:'manual' as const,start:'',breakStart:'',breakEnd:'',end:'',notes:'Falta não justificada'}
  ];
  const total = assessMonth(days,schedule,300000);
  assert.equal(total.workedMinutes, 16*60-15+60);
  assert.equal(total.overtimeMinutes,60);
  assert.equal(total.deficitMinutes,8*60+15);
  assert.equal(total.lateMinutes,15);
  const entries = payrollEntriesFromPoint('2026-11',total,schedule);
  assert.ok(entries.some(item=>item.code==='HEXTRA'&&item.kind==='earning'));
  assert.ok(entries.some(item=>item.code==='FALTAS'&&item.kind==='deduction'));
});

test('overnight shift can cross midnight and preserve monotonic punch order',()=>{
  const schedule={...defaultSchedule(),start:'21:00',breakStart:'23:00',breakEnd:'23:30',end:'05:30'};
  const day = {date:'2026-11-03',kind:'work' as const,source:'imported' as const,start:'21:00',breakStart:'23:00',breakEnd:'23:30',end:'05:30',notes:''};
  const total=assessMonth([day],schedule,300000);
  assert.equal(total.workedMinutes,480);
  assert.ok(total.nightMinutes>0);
});

test('configurable suggested variation is deterministic, never a recorded punch',()=>{
  const schedule=defaultSchedule();
  const first=previewMonth('2026-11',schedule,7);
  const again=previewMonth('2026-11',schedule,7);
  assert.deepEqual(first,again);
  assert.ok(first.every(row=>row.source==='suggested'));
  assert.equal(assessMonth(first,schedule,300000).overtimeCents,0);
});

test('bank of hours offsets shortfall without charging the same minutes in payroll',()=>{
  const schedule={...defaultSchedule(),overtimeDestination:'bank' as const};
  const days=[
    {date:'2026-11-03',kind:'work' as const,source:'manual' as const,start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'18:00',notes:''},
    {date:'2026-11-04',kind:'work' as const,source:'manual' as const,start:'08:15',breakStart:'12:00',breakEnd:'13:00',end:'17:00',notes:''},
    {date:'2026-11-05',kind:'absence' as const,source:'manual' as const,start:'',breakStart:'',breakEnd:'',end:'',notes:'Falta'}
  ];
  const summary=assessMonth(days,schedule,300000);
  assert.equal(summary.bankMinutes,45);
  assert.equal(summary.overtimeCents,0);
  assert.equal(summary.deficitCents,Math.round(480*300000/(220*60)));
  assert.ok(!payrollEntriesFromPoint('2026-11',summary,schedule).some(row=>row.code==='HEXTRA'));
});


test('escala 12x36 alterna dias a partir da ancora sem depender do dia da semana',()=>{
  const schedule={...defaultSchedule(),start:'07:00',breakStart:'12:00',breakEnd:'13:00',end:'20:00',cycle:{workDays:1,restDays:1,anchorDate:'2026-11-03'}};
  const days=previewMonth('2026-11',schedule);
  assert.equal(days.find(d=>d.date==='2026-11-03')?.kind,'work');
  assert.equal(days.find(d=>d.date==='2026-11-04')?.kind,'rest');
  assert.equal(days.find(d=>d.date==='2026-11-05')?.kind,'work');
});

test('feriado federal na sexta nao cria horas trabalhadas sugeridas',()=>{
  const day=previewMonth('2026-11',defaultSchedule()).find(d=>d.date==='2026-11-20');
  assert.equal(day?.kind,'holiday');
  assert.equal(day?.start,'');
});

test('horas trabalhadas em feriado utilizam adicional proprio e adicional noturno pode reduzir hora ficta',()=>{
  const schedule={...defaultSchedule(),holidayOvertimePercent:100,nightHourReduction:true};
  const holiday={date:'2026-11-20',kind:'work' as const,source:'manual' as const,start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'17:00',notes:''};
  const total=assessMonth([holiday],schedule,300000);
  assert.equal(total.overtimeHolidayMinutes,480);
  assert.equal(total.overtimeCents,Math.round(480*300000/(220*60)*2));
  const night={date:'2026-11-18',kind:'work' as const,source:'manual' as const,start:'21:00',breakStart:'23:00',breakEnd:'23:30',end:'05:30',notes:''};
  const nightTotal=assessMonth([night],{...schedule,start:'21:00',breakStart:'23:00',breakEnd:'23:30',end:'05:30'},300000);
  assert.ok(nightTotal.nightReducedMinutes>nightTotal.nightMinutes);
});

test('diagnostico aponta sugestoes pendentes e marcações incompletas sem travar a ficha',async()=>{
  const {diagnosePointDays}=await import('./time');
  const incomplete={date:'2026-11-03',kind:'work' as const,source:'manual' as const,start:'',breakStart:'',breakEnd:'',end:'',notes:''};
  const suggested={...incomplete,date:'2026-11-04',source:'suggested' as const};
  const issues=diagnosePointDays([incomplete,suggested]);
  assert.ok(issues.some(i=>i.code==='MISSING_PUNCHES'));
  assert.ok(issues.some(i=>i.code==='SUGGESTED'));
});

test('conferencia aponta dias de trabalho sem lancamento, sem impedir a apuracao',async()=>{
  const {diagnosePointDays}=await import('./time');
  const issues=diagnosePointDays([],defaultSchedule(),'2026-11');
  assert.ok(issues.some(issue=>issue.code==='MISSING_DAY'&&issue.date==='2026-11-03'));
  assert.ok(!issues.some(issue=>issue.date==='2026-11-20'));
});
