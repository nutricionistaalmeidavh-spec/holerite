'use strict';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const brl = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const kinds = {mensal:'Holerite mensal',ferias:'Recibo de férias',decimo:'13º salário',rescisao:'Demonstrativo de rescisão'};
(async function() {
  const id = new URLSearchParams(location.search).get('id');
  if (!/^\d+$/.test(id || '')) {document.querySelector('#paper').textContent = 'Identificador inválido.'; return;}
  try {
    const res = await fetch('/api/payslips/' + id);
    const slip = await res.json();
    if (!res.ok) throw Error(slip.error || 'Documento não encontrado.');
    const c = slip.company_snapshot, e = slip.employee_snapshot;
    document.title = `${kinds[slip.doc_type]} - ${e.name} - ${slip.period}`;
    document.querySelector('#paper').innerHTML = `
      <header><div><h1>${esc(c.name)}</h1><div class="small muted">${esc(c.cnpj)}<br>${esc(c.address)}<br>${esc(c.contact)}</div></div><div style="text-align:right"><div class="stamp">${esc(kinds[slip.doc_type])}</div><p>Competência: <strong>${esc(slip.period)}</strong></p><div class="small muted">Documento nº ${slip.id} · ${slip.status === 'finalizado' ? 'Finalizado' : 'RASCUNHO'}</div></div></header>
      <h2>Identificação do colaborador</h2><div class="facts">
        <div><div class="fact-label">Nome</div><strong>${esc(e.name)}</strong></div><div><div class="fact-label">CPF</div>${esc(e.cpf)}</div>
        <div><div class="fact-label">Cargo / Setor</div>${esc(e.job_title)} / ${esc(e.department)}</div>
        <div><div class="fact-label">Admissão</div>${esc(e.admission_date)}</div>
        <div><div class="fact-label">Matrícula</div>${esc(e.registration)}</div>
        <div><div class="fact-label">Salário-base cadastrado</div>${brl(e.salary_cents)}</div>
      </div>
      <h2>Discriminação das verbas</h2>
      <table><thead><tr><th>Descrição</th><th>Natureza</th><th>Valor (R$)</th></tr></thead><tbody>${slip.items.map(i=>`<tr><td>${esc(i.description)}</td><td>${i.kind==='provento'?'Provento':'Desconto'}</td><td>${brl(i.amount_cents)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhuma rubrica informada.</td></tr>'}</tbody></table>
      <div class="totals"><div>Total de proventos<strong>${brl(slip.earnings_cents)}</strong></div><div>Total de descontos<strong>${brl(slip.deductions_cents)}</strong></div><div class="net">Líquido<strong>${brl(slip.net_cents)}</strong></div></div>
      <p class="note"><strong>Atenção:</strong> este documento é gerado a partir dos valores informados pelo usuário. O sistema não apura automaticamente INSS, IRRF, FGTS, férias, 13º ou verbas rescisórias. Confira a legislação e os lançamentos antes de utilizá-lo como comprovante trabalhista.${slip.status !== 'finalizado' ? '<br>DOCUMENTO EM RASCUNHO — NÃO DEFINITIVO.' : ''}</p>
      <div class="signatures"><div>Responsável pela empresa</div><div>Colaborador(a)</div></div>`;
  } catch(err) {document.querySelector('#paper').innerHTML = `<div class="error">Não foi possível carregar o documento: ${esc(err.message)}</div>`;}
})();

document.getElementById("print-button").addEventListener("click", () => window.print());
document.getElementById("close-button").addEventListener("click", () => window.close());
