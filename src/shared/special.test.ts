import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateSpecialPayroll, calculateNoticeDays, calculateThirteenthMonths} from './special';
import {calculateInss2026} from './payroll';

const base={salaryCents:300000,competence:'2026-11',admissionDate:'2025-01-01',dependents:0,taxMode:'automatic' as const,entries:[]};
test('férias: 20 dias gozados, 10 vendidos, terços e incidências separadas',()=>{
  const r=calculateSpecialPayroll({...base,kind:'vacation',options:{vacation:{startDate:'2026-11-10',days:20,soldDays:10,acquisitionStart:'2025-01-01'}}});
  assert.equal(r.totals.grossCents,400000);
  assert.equal(r.totals.inssBaseCents,266667);
  assert.equal(r.totals.fgtsBaseCents,266667);
  assert.equal(r.totals.fgtsCents,21333);
  assert.equal(r.payableBy,'2026-11-08');
  assert.ok(r.items.some(i=>i.code==='ABONO'));
  assert.equal(r.totals.netCents,r.totals.grossCents-r.totals.deductionCents);
});
test('férias: invalida vender mais de um terço e dias maiores que 30',()=>{
  assert.throws(()=>calculateSpecialPayroll({...base,kind:'vacation',options:{vacation:{startDate:'2026-11-10',days:25,soldDays:10,acquisitionStart:'2025-01-01'}}}),/dias|férias/i);
});
test('13º primeira parcela: adiantamento sem INSS nem IRRF; FGTS informativo',()=>{
  const r=calculateSpecialPayroll({...base,kind:'thirteenth-first',options:{thirteenth:{months:12,advanceCents:0}}});
  assert.equal(r.totals.grossCents,150000);
  assert.equal(r.totals.inssCents,0);
  assert.equal(r.totals.irrfCents,0);
  assert.equal(r.totals.fgtsCents,12000);
});
test('13º segunda parcela: tributos sobre total do 13º, antecipação deduzida e FGTS complementar',()=>{
  const r=calculateSpecialPayroll({...base,kind:'thirteenth-second',options:{thirteenth:{months:12,advanceCents:150000}}});
  assert.equal(r.totals.grossCents,300000);
  assert.equal(r.totals.fgtsBaseCents,150000);
  assert.equal(r.totals.inssCents,calculateInss2026(300000));
  assert.equal(r.totals.irrfCents,0);
  assert.equal(r.totals.netCents,300000-150000-r.totals.inssCents);
  assert.ok(r.items.some(i=>i.code==='AD13'));
});
test('13º: valor pago anteriormente não pode superar total devido',()=>{
  assert.throws(()=>calculateSpecialPayroll({...base,kind:'thirteenth-second',options:{thirteenth:{months:6,advanceCents:300000}}}),/adiantamento/i);
});
test('avos de 13º: mês de admissão conta apenas com 15 dias ou mais',()=>{
  assert.equal(calculateThirteenthMonths('2026-01-17','2026-03-31',2026),2);
  assert.equal(calculateThirteenthMonths('2026-01-16','2026-03-31',2026),3);
  assert.equal(calculateThirteenthMonths('2025-06-01','2026-08-14',2026),7);
  assert.equal(calculateThirteenthMonths('2025-06-01','2026-08-15',2026),8);
});
test('aviso indenizado proporcional por tempo de serviço e teto de 90 dias',()=>{
  assert.equal(calculateNoticeDays('2026-01-01','2026-10-20'),30);
  assert.equal(calculateNoticeDays('2025-01-01','2026-10-20'),33);
  assert.equal(calculateNoticeDays('2000-01-01','2026-10-20'),90);
});
test('rescisão sem justa causa: aviso, férias vencidas, proporcionais, 13º e multa em campo informativo',()=>{
  const r=calculateSpecialPayroll({...base,kind:'termination',options:{termination:{date:'2026-10-20',reason:'without-cause',notice:'indemnified',vacationAccrualStart:'2026-01-01',accruedPeriods:1,overduePeriods:0,fgtsPenaltyBasisCents:1000000,prior13thAdvanceCents:0}}});
  assert.equal(r.fgtsPenaltyCents,400000);
  assert.equal(r.payableBy,'2026-10-30');
  assert.equal(r.noticeDays,33);
  assert.ok(r.items.some(i=>i.code==='AVISO'));
  assert.ok(r.items.some(i=>i.code==='FER-V'));
  assert.ok(r.items.some(i=>i.code==='FER-P'));
  assert.ok(r.items.some(i=>i.code==='RES13'));
  assert.equal(r.totals.netCents,r.totals.grossCents-r.totals.deductionCents);
  assert.equal(r.items.some(i=>i.code==='MULTA40'),false);
});
test('rescisão com justa causa não gera aviso/13º/férias proporcionais',()=>{
  const r=calculateSpecialPayroll({...base,kind:'termination',options:{termination:{date:'2026-10-20',reason:'with-cause',notice:'none',vacationAccrualStart:'2026-01-01',accruedPeriods:1,overduePeriods:0,fgtsPenaltyBasisCents:1000000,prior13thAdvanceCents:0}}});
  assert.equal(r.fgtsPenaltyCents,0);
  assert.ok(r.items.some(i=>i.code==='FER-V'));
  assert.ok(!r.items.some(i=>i.code==='FER-P'));
  assert.ok(!r.items.some(i=>i.code==='RES13'));
});
test('rescisão por acordo: metade do aviso indenizado e multa FGTS de 20%',()=>{
  const params={date:'2026-10-20',reason:'mutual' as const,notice:'indemnified' as const,vacationAccrualStart:'2026-01-01',accruedPeriods:0,overduePeriods:0,fgtsPenaltyBasisCents:1000000,prior13thAdvanceCents:0};
  const r=calculateSpecialPayroll({...base,kind:'termination',options:{termination:params}});
  assert.equal(r.fgtsPenaltyCents,200000);
  assert.equal(r.items.find(i=>i.code==='AVISO')?.amountCents,165000);
});
test('rescisão: validar datas, quantidades e competência fiscal',()=>{
  const options={termination:{date:'2024-10-20',reason:'without-cause' as const,notice:'indemnified' as const,vacationAccrualStart:'2025-01-01',accruedPeriods:0,overduePeriods:0,fgtsPenaltyBasisCents:0,prior13thAdvanceCents:0}};
  assert.throws(()=>calculateSpecialPayroll({...base,kind:'termination',options}),/admissão|data/i);
  assert.throws(()=>calculateSpecialPayroll({...base,kind:'thirteenth-first',competence:'2025-11',options:{thirteenth:{months:12,advanceCents:0}}}),/2026/);
});
