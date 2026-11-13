import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePayroll, calculateInss2026, calculateIrrf2026 } from './payroll';

test('INSS 2026 progressive tax and ceiling, including cents', () => {
  assert.equal(calculateInss2026(162100), 12158);
  assert.equal(calculateInss2026(400000), 36860);
  assert.equal(calculateInss2026(1000000), calculateInss2026(847555));
});
test('2026 IR exemption and gradual reduction', () => {
  assert.equal(calculateIrrf2026({taxableCents: 500000, inssCents: 50960, dependents: 0}), 0);
  assert.equal(calculateIrrf2026({taxableCents: 600000, inssCents: 64960, dependents: 0}), 38288);
  assert.ok(calculateIrrf2026({taxableCents: 735000, inssCents: 0, dependents: 0}) > 0);
});
test('calculation includes salary, earnings, discounts, employer FGTS only informational', () => {
  const x = calculatePayroll({salaryCents: 300000, competence: '2026-11', dependents: 0, taxMode: 'automatic', entries: [
    {id: 'overtime', code: '100', description: 'Horas extras', kind: 'earning', amountCents: 50000, inssBase: true, irBase: true, fgtsBase: true},
    {id: 'advance', code: '200', description: 'Adiantamento', kind: 'deduction', amountCents: 40000, inssBase: false, irBase: false, fgtsBase: false}
  ]});
  assert.equal(x.totals.grossCents, 350000);
  assert.equal(x.totals.fgtsCents, 28000);
  assert.equal(x.totals.netCents, 350000 - 40000 - x.totals.inssCents - x.totals.irrfCents);
  assert.equal(x.items.filter(item => item.code === 'INSS').length, 1);
});
test('manual mode never guesses tax tables and can issue historical competence', () => {
  const x = calculatePayroll({salaryCents: 100000, competence: '2025-06', dependents: 0, entries: [], taxMode: 'manual'});
  assert.equal(x.totals.netCents, 100000);
  assert.equal(x.totals.inssCents, 0);
});
test('automatic calculation rejects unsupported periods and negative/invalid inputs', () => {
  assert.throws(() => calculatePayroll({salaryCents: 200000, competence: '2025-01', dependents: 0, entries: [], taxMode: 'automatic'}), /2026/);
  assert.throws(() => calculatePayroll({salaryCents: -5, competence: '2026-11', dependents: 0, entries: [], taxMode: 'manual'}), /salário/i);
  assert.throws(() => calculatePayroll({salaryCents: 200000, competence: '2026-11', dependents: 0, taxMode: 'manual', entries: [
    {id:'x',code:'1',description:'Inválido',kind:'deduction',amountCents:300000,inssBase:false,irBase:false,fgtsBase:false}
  ]}), /negativo/i);
});
