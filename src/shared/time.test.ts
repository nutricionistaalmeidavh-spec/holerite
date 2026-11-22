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
