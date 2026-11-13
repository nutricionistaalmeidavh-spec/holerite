import type { PayrollRecord } from '../src/shared/types';
import { money } from '../src/shared/payroll';
const receiptNames:Record<string,string>={monthly:'SALÁRIO',vacation:'FÉRIAS','thirteenth-first':'13º SALÁRIO — PRIMEIRA PARCELA','thirteenth-second':'13º SALÁRIO — SEGUNDA PARCELA',termination:'RESCISÃO CONTRATUAL'};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function slip(p: PayrollRecord, copy: string) {
  const {employee,company,items,totals} = p.details;
  const rows = items.filter(i=>i.amountCents>0).map(i=>`<tr><td class="code">${esc(i.code)}</td><td>${esc(i.description)}</td><td class="currency">${i.kind==='earning'?esc(money(i.amountCents)):''}</td><td class="currency">${i.kind==='deduction'?esc(money(i.amountCents)):''}</td></tr>`).join('');
  return `<section class="slip">
   <header><div><strong>${esc(company.legalName)}</strong><p>${esc(company.tradeName)} · CNPJ ${esc(company.cnpj)}</p><small>${esc(company.address)}</small></div><div class="receipt-head"><strong>RECIBO DE ${esc(receiptNames[p.kind??'monthly']??'PAGAMENTO')}</strong><p>Competência: ${esc(p.competence)}</p><small>${copy}</small>${p.details.payableBy?`<p>Data-limite de pagamento: ${esc(p.details.payableBy)}</p>`:''}</div></header>
   <div class="employee"><div><small>Colaborador</small><b>${esc(employee.name)}</b><span>CPF ${esc(employee.cpf)}</span></div><div><small>Cargo</small><b>${esc(employee.role)}</b><span>Admissão: ${esc(employee.admissionDate)}</span></div></div>
   <table><thead><tr><th>Cód.</th><th>Descrição</th><th>Vencimentos</th><th>Descontos</th></tr></thead><tbody>${rows}</tbody></table>
   <div class="summary"><div class="bases"><span>Base INSS: ${esc(money(totals.inssBaseCents))}</span><span>Base IRRF: ${esc(money(totals.irBaseCents))}</span><span>Base FGTS: ${esc(money(totals.fgtsBaseCents))}</span><span>FGTS do período (informativo): ${esc(money(totals.fgtsCents))}</span>${p.details.fgtsPenaltyCents?`<span>Multa FGTS (não compõe líquido): ${esc(money(p.details.fgtsPenaltyCents))}</span>`:''}</div><div class="values"><div><span>Total vencimentos</span><b>${esc(money(totals.grossCents))}</b></div><div><span>Total descontos</span><b>${esc(money(totals.deductionCents))}</b></div><div class="net"><span>Líquido a receber</span><b>${esc(money(totals.netCents))}</b></div></div></div>
   <footer><span>Declaro ter recebido o valor líquido indicado neste documento.</span><div class="signature">Assinatura do colaborador / Data</div></footer>
  </section>`;
}
export function receiptHTML(p:PayrollRecord):string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Holerite ${esc(p.competence)}</title><style>
  @page{size:A4;margin:8mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;margin:0;color:#19233c;background:white}
  .slip{height:137mm;padding:4mm 2mm 3mm;display:flex;flex-direction:column;page-break-inside:avoid;border-bottom:1px dashed #8a97aa}
  .slip:last-child{border-bottom:none}header{display:flex;justify-content:space-between;gap:20px;padding:0 0 9px;border-bottom:2px solid #213f83}
  header strong{font-size:12px}.receipt-head{text-align:right}.receipt-head strong{font-size:11px}p{margin:4px 0}.employee{display:grid;grid-template-columns:1fr 1fr;gap:18px;background:#f3f6fb;padding:9px;margin:10px 0}
  .employee>div{display:flex;flex-direction:column;gap:3px}.employee small{color:#69758b}.employee b{font-size:12px}
  table{width:100%;border-collapse:collapse;flex:1;align-self:stretch;font-size:10px}thead{background:#e8eef8;text-align:left}th,td{padding:6px;border-bottom:1px solid #dde3ed}td.currency,th:nth-child(n+3){text-align:right}.code{width:10%}
  .summary{display:grid;grid-template-columns:1fr 50%;border-top:2px solid #213f83;margin-top:6px;padding-top:7px;gap:10px}
  .bases{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start;font-size:9px}.values>div{display:flex;justify-content:space-between;padding:3px 4px}
  .net{font-size:13px;background:#e8eef8;border-radius:3px;padding:7px 5px!important;margin-top:4px}
  footer{display:flex;justify-content:space-between;align-items:end;margin-top:12px;font-size:9px}.signature{min-width:40%;text-align:center;padding-top:6px;border-top:1px solid #222}
  </style></head><body>${slip(p,'Via do empregador')}${slip(p,'Via do colaborador')}</body></html>`;
}
