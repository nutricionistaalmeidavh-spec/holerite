import type {PayrollRecord,PayItem} from '../src/shared/types';
import {money} from '../src/shared/payroll';

const receiptNames:Record<string,string>={
  monthly:'Mensal',vacation:'Férias',
  'thirteenth-first':'13º Salário — 1ª parcela',
  'thirteenth-second':'13º Salário — 2ª parcela',
  termination:'Rescisão contratual'
};
const esc=(value:unknown):string=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount=(cents:number)=>money(cents).replace(/^\s*R\$\s*/,'');
const period=(v:string)=>/^\d{4}-\d{2}$/.test(v)?v.slice(5)+'/'+v.slice(0,4):v;
const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):v;

function column(title:string,className:string,items:PayItem[],total:number):string {
  const rows=items.map(i=>'<tr><td class="description">'+esc(i.description)+'</td><td class="reference">—</td><td class="currency">'+esc(amount(i.amountCents))+'</td></tr>').join('');
  return '<div class="payroll-column"><table class="payroll-table '+className+'">'+
    '<colgroup><col class="col-description"><col class="col-reference"><col class="col-value"></colgroup>'+
    '<thead><tr><th>'+title+'</th><th>Referência</th><th>Valor</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table><div class="column-total"><strong>Total de '+title+'</strong><b>'+esc(amount(total))+'</b></div></div>';
}

function slip(p:PayrollRecord,copy:string):string {
  const {employee,company,items,totals}=p.details;
  const earnings=items.filter(i=>i.kind==='earning'&&i.amountCents>0);
  const deductions=items.filter(i=>i.kind==='deduction'&&i.amountCents>0);
  const companyLines=[
    '<strong>'+esc(company.legalName)+'</strong>',
    company.tradeName?'<span>'+esc(company.tradeName)+'</span>':'',
    company.cnpj?'<span>CNPJ: '+esc(company.cnpj)+'</span>':'',
    company.address?'<span class="small">'+esc(company.address)+'</span>':''
  ].join('');
  return '<section class="slip">'+
    '<header class="receipt-header"><div class="company-block">'+companyLines+'</div>'+
    '<div class="receipt-heading"><strong>Contracheque</strong>'+
    '<span>Competência: '+esc(period(p.competence))+'</span>'+
    '<span>Folha: '+esc(receiptNames[p.kind??'monthly']??'Mensal')+'</span>'+
    (p.details.payableBy?'<span class="small">Pagamento até: '+esc(date(p.details.payableBy))+'</span>':'')+'</div></header>'+
    '<div class="employee-grid">'+
    '<div class="employee-cell"><strong>Funcionário</strong><b>'+esc(employee.name)+'</b>'+
    (employee.cpf?'<span>CPF: '+esc(employee.cpf)+'</span>':'')+
    (employee.pis?'<span>PIS/NIS: '+esc(employee.pis)+'</span>':'')+'</div>'+
    '<div class="employee-cell"><strong>Matrícula</strong><span>'+esc(employee.registration||'—')+'</span></div>'+
    '<div class="employee-cell"><strong>Cargo</strong><span>'+esc(employee.role)+'</span>'+
    (employee.workHours?'<span class="small">'+esc(employee.workHours)+'</span>':'')+'</div>'+
    '<div class="employee-cell"><strong>Admissão</strong><span>'+esc(date(employee.admissionDate))+'</span></div></div>'+
    '<div class="payroll-columns">'+column('Proventos','earnings',earnings,totals.grossCents)+
    column('Descontos','deductions',deductions,totals.deductionCents)+'</div>'+
    '<div class="net-total"><strong>Salário Líquido</strong><b>'+esc(amount(totals.netCents))+'</b></div>'+
    '<div class="tax-bases"><span>Base INSS: '+esc(amount(totals.inssBaseCents))+'</span>'+
    '<span>Base IRRF: '+esc(amount(totals.irBaseCents))+'</span>'+
    '<span>Base FGTS: '+esc(amount(totals.fgtsBaseCents))+'</span>'+
    '<span>FGTS (informativo): '+esc(amount(totals.fgtsCents))+'</span>'+
    (p.details.fgtsPenaltyCents?'<span>Multa FGTS (informativa): '+esc(amount(p.details.fgtsPenaltyCents))+'</span>':'')+
    '</div><footer class="receipt-footer"><div class="receipt-declaration">'+
    '<span>Declaro ter recebido a importância líquida discriminada neste recibo.</span><small>'+esc(copy)+'</small></div>'+
    '<div class="signature"><span>Assinatura do Funcionário / Data</span></div></footer></section>';
}

// A impressão A4 mantém duas vias idênticas do mesmo holerite, e nunca mistura funcionários.
export function receiptHTML(p:PayrollRecord):string {
  const nonzero=p.details.items.filter(i=>i.amountCents>0);
  const maxRows=Math.max(nonzero.filter(i=>i.kind==='earning').length,nonzero.filter(i=>i.kind==='deduction').length);
  // Lançamentos extensos vão para páginas separadas, sem cortar rubricas.
  const layout=maxRows<=10?'compact':'extended';
  const styles=[
    '@page{size:A4;margin:9mm}',
    '*{box-sizing:border-box}html,body{margin:0;padding:0}',
    'body{font:9.5px Arial,Helvetica,sans-serif;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.sheet{width:100%;display:flex;flex-direction:column;gap:8mm}',
    '.slip{display:flex;flex-direction:column;border:1px solid #333;min-width:0;background:#fff;break-inside:avoid;page-break-inside:avoid}',
    '.compact{min-height:273mm;justify-content:space-evenly}',
    '.compact .slip{height:'+String(90+Math.max(2,maxRows)*4)+'mm}',
    '.receipt-header{display:grid;grid-template-columns:minmax(0,75%) minmax(0,25%);border-bottom:1px solid #333;min-height:19mm}',
    '.company-block,.receipt-heading{padding:3mm 3.2mm;display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}',
    '.company-block strong{font-size:13px;line-height:1.15}',
    '.company-block .small,.receipt-heading .small,.employee-cell .small{font-size:8px}',
    '.receipt-heading{border-left:1px solid #333}.receipt-heading strong{font-size:12px}',
    '.employee-grid{display:grid;grid-template-columns:minmax(0,37%) minmax(0,12%) minmax(0,34%) minmax(0,17%);border-bottom:1px solid #333;min-height:16mm}',
    '.employee-cell{display:flex;flex-direction:column;gap:2px;min-width:0;padding:2mm 2.5mm;overflow-wrap:anywhere}',
    '.employee-cell:not(:last-child){border-right:1px solid #999}',
    '.employee-cell strong{font-size:9px}.employee-cell b{font-size:11px}',
    '.payroll-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:0;flex:1}',
    '.payroll-column{display:flex;flex-direction:column;min-width:0}.payroll-column:first-child{border-right:1px solid #555}',
    '.payroll-table{width:100%;border-collapse:collapse;table-layout:fixed}',
    '.col-description{width:57%}.col-reference{width:20%}.col-value{width:23%}',
    'th,td{padding:2.1px 3px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd;overflow-wrap:anywhere}',
    'thead th{font-weight:700;background:#dedede;border-bottom:1px solid #666}',
    'th:not(:first-child),td:not(:first-child){text-align:right}',
    'td.reference,td.currency{white-space:nowrap}td.currency{font-variant-numeric:tabular-nums}',
    '.column-total{margin-top:auto;display:flex;justify-content:space-between;gap:3px;padding:5px 6px;border-top:1px solid #555;font-size:10px}',
    '.column-total b,.net-total b{font-variant-numeric:tabular-nums}',
    '.net-total{display:flex;justify-content:space-between;align-items:center;gap:5mm;border-top:1px solid #333;border-bottom:1px solid #333;background:#dedede;font-size:13px;padding:5px 8px}',
    '.tax-bases{display:flex;flex-wrap:wrap;column-gap:12px;row-gap:2px;padding:4px 8px;border-bottom:1px solid #bbb;font-size:8px}',
    '.receipt-footer{display:flex;justify-content:space-between;align-items:end;gap:14px;min-height:18mm;padding:6px 8px 9px}',
    '.receipt-declaration{display:flex;flex-direction:column;gap:6px}.receipt-declaration small{font-size:8px;color:#555}',
    '.signature{min-width:38%;border-top:1px solid #333;text-align:center;padding-top:4px}',
    '.extended{display:block}.extended .slip{min-height:251mm;height:auto;break-after:page;page-break-after:always}',
    '.extended .slip:last-child{break-after:auto;page-break-after:auto}.extended .payroll-columns{min-height:115mm}',
    '@media screen{body{background:#e9e9e9;padding:9mm}.sheet{max-width:192mm;margin:0 auto}.slip{box-shadow:0 2px 6px #0002}}'
  ].join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<title>Contracheque '+esc(period(p.competence))+'</title><style>'+styles+'</style></head>'+
    '<body><main class="sheet '+layout+'">'+slip(p,'Via do empregador')+slip(p,'Via do colaborador')+'</main></body></html>';
}
