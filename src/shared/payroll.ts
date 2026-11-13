import type { PayItem, PayrollCalculation, TaxMode } from './types';

// Fonte: https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
// Fonte: https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
// Valores e faixas expressos em centavos para reduzir erros de arredondamento.
const INSS_2026 = [
  { limit: 162100, basisPoints: 750 },
  { limit: 290284, basisPoints: 900 },
  { limit: 435427, basisPoints: 1200 },
  { limit: 847555, basisPoints: 1400 }
] as const;
const IR_2026 = [
  { limit: 242880, basisPoints: 0, deduct: 0 },
  { limit: 282665, basisPoints: 750, deduct: 18216 },
  { limit: 375105, basisPoints: 1500, deduct: 39416 },
  { limit: 466468, basisPoints: 2250, deduct: 67549 },
  { limit: Infinity, basisPoints: 2750, deduct: 90873 }
] as const;

export function money(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}
function validCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_00;
}
export function calculateInss2026(baseCents: number): number {
  if (!validCents(baseCents)) throw new Error('Base do INSS inválida.');
  let previous = 0;
  let unrounded = 0;
  for (const bracket of INSS_2026) {
    const portion = Math.max(0, Math.min(baseCents, bracket.limit) - previous);
    unrounded += portion * bracket.basisPoints / 10000;
    previous = bracket.limit;
  }
  return Math.round(unrounded);
}
export function calculateIrrf2026(input: {taxableCents: number; inssCents: number; dependents: number}): number {
  const {taxableCents, inssCents, dependents} = input;
  if (!validCents(taxableCents) || !validCents(inssCents) || !Number.isInteger(dependents) || dependents < 0 || dependents > 30)
    throw new Error('Base de cálculo do IRRF inválida.');
  const legalDeductions = inssCents + dependents * 18959;
  const deduction = Math.max(60720, legalDeductions);
  const base = Math.max(0, taxableCents - deduction);
  const bracket = IR_2026.find(b => base <= b.limit)!;
  const original = Math.max(0, Math.round(base * bracket.basisPoints / 10000) - bracket.deduct);
  let reduction = 0;
  if (taxableCents <= 500000) reduction = original;
  else if (taxableCents <= 735000) reduction = Math.max(0, Math.round(97862 - taxableCents * 0.133145));
  return Math.max(0, original - Math.min(original, reduction));
}
export function calculatePayroll(input: {
  salaryCents: number;
  competence: string;
  dependents: number;
  taxMode: TaxMode;
  entries: PayItem[];
}): PayrollCalculation {
  const {salaryCents, competence, dependents, taxMode, entries} = input;
  if (!validCents(salaryCents) || salaryCents === 0) throw new Error('Salário deve ser maior que zero e informado em centavos.');
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error('Competência inválida. Use AAAA-MM.');
  if (!Number.isInteger(dependents) || dependents < 0 || dependents > 30) throw new Error('Quantidade de dependentes inválida.');
  if (taxMode !== 'automatic' && taxMode !== 'manual') throw new Error('Modo de cálculo inválido.');
  if (taxMode === 'automatic' && !competence.startsWith('2026-')) throw new Error('Cálculo automático disponível apenas para competências de 2026. Para outra competência, utilize o modo manual.');
  if (!Array.isArray(entries) || entries.length > 100) throw new Error('Máximo de 100 lançamentos por holerite.');

  const ids = new Set<string>();
  const validated = entries.map(item => {
    if (!item || typeof item.id !== 'string' || item.id.length > 100 || !item.id.trim() || ids.has(item.id)) throw new Error('ID de lançamento inválido ou repetido.');
    ids.add(item.id);
    if (typeof item.code !== 'string' || item.code.length > 12 || !item.code.trim() ||
        typeof item.description !== 'string' || item.description.length > 100 || !item.description.trim() ||
        !['earning', 'deduction'].includes(item.kind) || !validCents(item.amountCents) || item.amountCents === 0)
      throw new Error('Lançamento possui código, descrição, tipo ou valor inválido.');
    if ([item.inssBase, item.irBase, item.fgtsBase].some(x => typeof x !== 'boolean'))
      throw new Error('Incidências fiscais inválidas.');
    if (['SAL', 'INSS', 'IRRF'].includes(item.code.toUpperCase())) throw new Error('Código de lançamento reservado.');
    return {...item, inssBase: item.kind === 'earning' && item.inssBase, irBase: item.kind === 'earning' && item.irBase, fgtsBase: item.kind === 'earning' && item.fgtsBase};
  });
  const salary: PayItem = {id: 'fixed-salary', code: 'SAL', description: 'Salário-base', kind: 'earning', amountCents: salaryCents, inssBase: true, irBase: true, fgtsBase: true};
  const earnings = [salary, ...validated.filter(i => i.kind === 'earning')];
  const deductions = validated.filter(i => i.kind === 'deduction');
  const sum = (items: PayItem[]) => items.reduce((total, item) => total + item.amountCents, 0);
  const inssBaseCents = sum(earnings.filter(i => i.inssBase));
  const irBaseCents = sum(earnings.filter(i => i.irBase));
  const fgtsBaseCents = sum(earnings.filter(i => i.fgtsBase));
  const inssCents = taxMode === 'automatic' ? calculateInss2026(inssBaseCents) : 0;
  const irrfCents = taxMode === 'automatic' ? calculateIrrf2026({taxableCents: irBaseCents, inssCents, dependents}) : 0;
  const auto: PayItem[] = taxMode === 'automatic' ? [
    {id:'auto-inss',code:'INSS',description:'INSS (2026)',kind:'deduction',amountCents:inssCents,inssBase:false,irBase:false,fgtsBase:false},
    {id:'auto-irrf',code:'IRRF',description:'IRRF (2026)',kind:'deduction',amountCents:irrfCents,inssBase:false,irBase:false,fgtsBase:false}
  ] : [];
  const grossCents = sum(earnings);
  const deductionCents = sum([...deductions, ...auto]);
  const netCents = grossCents - deductionCents;
  if (netCents < 0) throw new Error('O salário líquido ficou negativo. Revise os descontos.');
  if (!Number.isSafeInteger(netCents)) throw new Error('Valores excedem o limite seguro.');
  return {
    items: [...earnings, ...deductions, ...auto],
    totals: {grossCents, deductionCents, netCents, inssCents, irrfCents, fgtsCents: Math.round(fgtsBaseCents * 0.08), inssBaseCents, irBaseCents, fgtsBaseCents},
    taxVersion: taxMode === 'automatic' ? 'BR-2026-INSS-IRRF-v1' : 'manual-sem-apuracao'
  };
}
