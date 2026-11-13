'use strict';

const $ = (id) => document.getElementById(id);
const state = { page: 'overview', employees: [], slips: [], company: null, selectedEmployee: null, selectedSlip: null };
const TYPES = { mensal: 'Holerite mensal', ferias: 'Férias', decimo: '13º salário', rescisao: 'Rescisão' };
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const html = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const toInputMoney = (cents) => (cents / 100).toFixed(2).replace('.', ',');

function parseMoney(raw) {
  const value = String(raw ?? '').replace(/\s|R\$/g, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value)) throw Error('Informe um valor válido em reais (ex.: 2.850,00).');
  const [whole, frac = ''] = value.replace(/\./g, '').split(',');
  const result = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 99999999999) throw Error('Valor fora dos limites permitidos.');
  return result;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let payload;
  try { payload = await response.json(); } catch { throw Error('Resposta inválida do servidor.'); }
  if (!response.ok) throw Error(payload.error || 'A operação não pôde ser concluída.');
  return payload;
}
let toastTimer;
function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}
function handle(error) { console.error(error); toast(error.message || 'Erro inesperado.', true); }
function bind(id, fn) { $(id).addEventListener('click', (event) => { Promise.resolve(fn(event)).catch(handle); }); }
function navigate(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('current', el.id === `page-${page}`));
  document.querySelectorAll('#nav button').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('crumb-current').textContent = ({ overview: 'VISÃO GERAL', employees: 'FUNCIONÁRIOS', payroll: 'FOLHA E RECIBOS', company: 'MINHA EMPRESA' })[page];
  if (page === 'payroll') refreshSlips().catch(handle);
}
async function refreshAll() {
  const [company, employees] = await Promise.all([api('/api/company'), api('/api/employees')]);
  state.company = company; state.employees = employees;
  updateCompany(); renderEmployees(); updateEmployeeSelect(); await refreshSlips();
}
function updateCompany() {
  const form = $('company-form');
  for (const key of ['name', 'cnpj', 'address', 'contact']) form.elements.namedItem(key).value = state.company[key] || '';
}
function initials(name) { return name.split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase(); }
function renderEmployees() {
  const q = $('employee-search').value.toLocaleLowerCase('pt-BR');
  const matches = state.employees.filter(e => `${e.name} ${e.cpf} ${e.job_title}`.toLocaleLowerCase('pt-BR').includes(q));
  $('employees-count').textContent = `${state.employees.length}`;
  $('kpi-active').textContent = state.employees.filter(e => e.active).length;
  $('employees-empty').hidden = matches.length > 0;
  $('employees-table').innerHTML = matches.map(e => `<tr><td><div class="name-cell"><span class="avatar">${html(initials(e.name))}</span><div><strong>${html(e.name)}</strong><div class="muted">CPF ${html(e.cpf)}</div></div></div></td><td>${html(e.job_title)}</td><td>${money(e.salary_cents)}</td><td><span class="status ${e.active ? 'active' : 'inactive'}">${e.active ? 'Ativo' : 'Inativo'}</span></td><td><div class="row-actions"><button class="small-link" data-edit="${e.id}">Editar / rubricas</button><button class="small-link" data-generate="${e.id}" ${e.active ? '' : 'disabled'}>Gerar</button></div></td></tr>`).join('');
}
function updateEmployeeSelect() {
  const select = $('payroll-employee'); const selected = select.value;
  select.innerHTML = '<option value="">Selecione</option>' + state.employees.filter(e => e.active).map(e => `<option value="${e.id}">${html(e.name)}</option>`).join('');
  select.value = Array.from(select.options).some(o => o.value === selected) ? selected : '';
}
async function refreshSlips() {
  const period = $('period').value;
  state.slips = await api('/api/payslips' + (period ? '?period=' + encodeURIComponent(period) : ''));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const present = state.slips.filter(s => s.period === currentMonth);
  $('kpi-documents').textContent = present.length;
  const monthlies = await Promise.all(present.filter(s => s.doc_type === 'mensal').map(s => api(`/api/payslips/${s.id}`)));
  $('kpi-net').textContent = money(monthlies.reduce((a, s) => a + s.net_cents, 0));
  renderSlips();
}
function renderSlips() {
  $('slips-count').textContent = `${state.slips.length}`;
  $('slips-empty').hidden = state.slips.length > 0;
  $('slips-table').innerHTML = state.slips.map(s => `<tr><td><strong>${html(s.employee_name)}</strong></td><td>${html(TYPES[s.doc_type])}</td><td>${html(s.period)}</td><td><span class="status ${s.status}">${s.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}</span></td><td><button class="small-link" data-slip="${s.id}">Visualizar →</button></td></tr>`).join('');
}
async function openEmployee(id = null) {
  state.selectedEmployee = id;
  const form = $('employee-form'); form.reset();
  $('employee-dialog-title').textContent = id ? 'Editar funcionário' : 'Novo funcionário';
  if (id) {
    const e = await api(`/api/employees/${id}`);
    for (const name of ['name','cpf','pis','registration','job_title','department','admission_date','contract_type','bank_details','weekly_hours','dependents']) form.elements.namedItem(name).value = e[name] ?? '';
    form.elements.namedItem('salary').value = toInputMoney(e.salary_cents);
    form.elements.namedItem('active').checked = !!e.active;
    renderRecurring(e.recurring_items);
  } else {
    $('recurring-list').innerHTML = '<p class="muted">Cadastre o funcionário primeiro para adicionar rubricas.</p>';
  }
  $('add-recurring').disabled = !id;
  $('employee-dialog').showModal();
}
function renderRecurring(items) {
  $('recurring-list').innerHTML = items.length ? items.map(i => `<div class="recurring-line"><span>${html(i.description)} <span class="muted">(${i.kind === 'provento' ? 'Provento' : 'Desconto'})</span></span><span class="amount">${money(i.amount_cents)}</span><button type="button" class="small-link danger" data-remove-recurring="${i.id}">Remover</button></div>`).join('') : '<p class="muted">Sem rubricas recorrentes cadastradas.</p>';
}
async function saveEmployee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const get = (field) => form.elements.namedItem(field).value.trim();
  const body = Object.fromEntries(['name','cpf','pis','registration','job_title','department','admission_date','contract_type','bank_details'].map(field => [field, get(field)]));
  Object.assign(body, {salary_cents: parseMoney(get('salary')), weekly_hours: Number(get('weekly_hours')), dependents: Number(get('dependents')), active: form.elements.namedItem('active').checked});
  const id = state.selectedEmployee;
  const result = await api('/api/employees' + (id ? '/' + id : ''), {method: id ? 'PUT' : 'POST', body});
  $('employee-dialog').close(); toast(id ? 'Cadastro atualizado.' : 'Funcionário cadastrado.');
  await refreshAll();
  return result;
}
async function addRecurring() {
  if (!state.selectedEmployee) throw Error('Salve o funcionário primeiro.');
  const description = $('recurring-description').value.trim();
  const kind = $('recurring-kind').value;
  const amount_cents = parseMoney($('recurring-amount').value);
  await api(`/api/employees/${state.selectedEmployee}/recurring`, { method: 'POST', body: { description, kind, amount_cents } });
  const e = await api(`/api/employees/${state.selectedEmployee}`);
  renderRecurring(e.recurring_items); $('recurring-description').value = ''; $('recurring-amount').value = '';
  toast('Rubrica recorrente adicionada.');
}
async function generateOne() {
  const employee_id = Number($('payroll-employee').value);
  if (!employee_id) throw Error('Selecione um funcionário.');
  const doc_type = $('doc-type').value, period = $('period').value;
  const slip = await api('/api/payslips', {method: 'POST', body: {employee_id, period, doc_type}});
  await refreshSlips(); toast('Documento disponível para revisão.'); await openSlip(slip.id);
}
async function generateBatch() {
  if ($('doc-type').value !== 'mensal') throw Error('A geração em lote é exclusiva dos holerites mensais.');
  if (!confirm('Gerar os holerites mensais de todos os funcionários ativos nesta competência? Documentos existentes serão mantidos.')) return;
  const result = await api('/api/payslips/batch', {method: 'POST', body: {period: $('period').value}});
  await refreshSlips(); toast(`${result.count} documentos disponíveis. ${result.errors.length} erros.`);
}
async function openSlip(id) {
  const slip = await api(`/api/payslips/${id}`);
  state.selectedSlip = slip;
  $('slip-title').textContent = TYPES[slip.doc_type];
  $('slip-metadata').innerHTML = `<div class="slip-meta"><strong>${html(slip.employee_snapshot.name)}</strong> · ${html(slip.employee_snapshot.job_title)}<br>${html(slip.company_snapshot.name)} · Competência ${html(slip.period)}<br>${slip.status === 'finalizado' ? 'Documento finalizado — edição bloqueada' : 'Rascunho — confira os lançamentos antes de finalizar'}</div>`;
  $('slip-items').innerHTML = slip.items.map(i => `<tr><td><strong>${html(i.description)}</strong></td><td>${i.kind === 'provento' ? 'Provento' : 'Desconto'}</td><td>${money(i.amount_cents)}</td><td>${slip.status === 'rascunho' && i.origin === 'manual' ? `<button class="small-link danger" data-remove-item="${i.id}">Excluir</button>` : ''}</td></tr>`).join('');
  $('slip-totals').innerHTML = `<div>Proventos<strong>${money(slip.earnings_cents)}</strong></div><div>Descontos<strong>${money(slip.deductions_cents)}</strong></div><div class="net">Líquido<strong>${money(slip.net_cents)}</strong></div>`;
  $('manual-item-section').hidden = slip.status !== 'rascunho';
  $('finalize-slip').hidden = slip.status === 'finalizado';
  $('slip-dialog').showModal();
}
async function refreshOpenSlip() {
  const id = state.selectedSlip.id;
  $('slip-dialog').close(); await openSlip(id); await refreshSlips();
}
async function addManual() {
  const id = state.selectedSlip.id;
  await api(`/api/payslips/${id}/items`, {method: 'POST', body: {description:$('item-description').value.trim(), kind:$('item-kind').value, amount_cents:parseMoney($('item-amount').value)}});
  $('item-description').value = ''; $('item-amount').value = '';
  await refreshOpenSlip(); toast('Rubrica incluída.');
}
async function finalizeSlip() {
  if (!confirm('Finalizar este documento? Após a finalização os valores não poderão ser alterados.')) return;
  await api(`/api/payslips/${state.selectedSlip.id}/finalize`, {method:'POST', body:{}});
  await refreshOpenSlip(); toast('Documento finalizado e bloqueado para edição.');
}

function init() {
  const date = new Date(); $('period').value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
  bind('overview-new', () => { navigate('employees'); return openEmployee(); });
  bind('new-employee', () => openEmployee());
  $('employee-search').addEventListener('input', renderEmployees);
  $('period').addEventListener('change', () => refreshSlips().catch(handle));
  $('employee-form').addEventListener('submit', e => saveEmployee(e).catch(handle));
  $('company-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    api('/api/company', {method:'PUT',body:data}).then(c=>{state.company=c;toast('Empresa atualizada.');}).catch(handle);
  });
  bind('add-recurring', addRecurring);
  bind('generate-one', generateOne);
  bind('generate-batch', generateBatch);
  bind('add-manual', addManual);
  bind('finalize-slip', finalizeSlip);
  bind('print-slip', () => { if (state.selectedSlip) window.open(`/print?id=${state.selectedSlip.id}`, '_blank', 'noopener,noreferrer'); });
  $('employees-table').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit]'); const generate = e.target.closest('[data-generate]');
    if (edit) openEmployee(Number(edit.dataset.edit)).catch(handle);
    if (generate) { navigate('payroll'); $('payroll-employee').value = generate.dataset.generate; }
  });
  $('recurring-list').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-recurring]'); if (!remove) return;
    if (!confirm('Remover esta rubrica para as próximas competências? Documentos existentes serão preservados.')) return;
    api(`/api/employees/${state.selectedEmployee}/recurring/${remove.dataset.removeRecurring}`,{method:'DELETE'})
      .then(()=>api(`/api/employees/${state.selectedEmployee}`)).then(emp=>{renderRecurring(emp.recurring_items);toast('Rubrica removida.');}).catch(handle);
  });
  $('slips-table').addEventListener('click', e => {
    const view = e.target.closest('[data-slip]'); if (view) openSlip(Number(view.dataset.slip)).catch(handle);
  });
  $('slip-items').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove-item]'); if (!remove) return;
    api(`/api/payslips/${state.selectedSlip.id}/items/${remove.dataset.removeItem}`,{method:'DELETE'})
      .then(refreshOpenSlip).catch(handle);
  });
  refreshAll().catch(handle);
}
document.addEventListener('DOMContentLoaded', init);
