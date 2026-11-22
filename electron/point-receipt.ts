import type {TimeSheet} from './attendance';
import type {Company,Employee} from '../src/shared/types';
const escape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const kinds:Record<string,string>={work:'Trabalho',absence:'Falta',vacation:'Férias',holiday:'Feriado',rest:'Folga',leave:'Afastamento'};
const duration=(m:number)=>String(Math.floor(Math.abs(m)/60)).padStart(2,'0')+':'+String(Math.abs(m)%60).padStart(2,'0');
export function pointReceiptHTML(sheet:TimeSheet,employee:Employee,company:Company):string {
  const summary=sheet.summary;
  const title=sheet.status==='closed'?'FECHADA':'RASCUNHO';
  const rows=sheet.days.map(day=>`<tr class="${day.source==='suggested'?'suggested':''}">
    <td>${escape(day.date.slice(-2))}</td><td>${escape(kinds[day.kind]||day.kind)}</td>
    <td>${escape(day.source==='suggested'?'NÃO CONFERIDO':day.source==='reviewed'?'GERADO / CONFERIDO EM LOTE':day.source==='imported'?'IMPORTADO':'MANUAL')}</td>
    <td>${escape(day.start)}</td><td>${escape(day.breakStart)}</td><td>${escape(day.breakEnd)}</td>
    <td>${escape(day.end)}</td><td>${escape(day.notes)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de ponto</title>
    <style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172438;font-size:9px}
    h1{font-size:18px;margin:0 0 6px}h2{font-size:11px;margin:8px 0}.header{display:flex;justify-content:space-between;border-bottom:2px solid #14253c;padding:4px 0}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}.meta p{margin:0;padding:6px;border:1px solid #cad2da}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #b4c0ce;padding:4px;text-align:left}th{background:#edf2f7}
    tr.suggested{color:#89929d;background:#fafafa}.totals{display:flex;gap:16px;margin-top:12px}.totals span{font-weight:700}
    .sign{display:flex;gap:70px;justify-content:center;margin-top:35px}.sign div{border-top:1px solid #222;text-align:center;min-width:230px;padding:7px}
    footer{margin-top:12px;font-size:8px;color:#576574}</style></head><body>
    <div class="header"><h1>ARTISYS · FICHA MENSAL DE PONTO</h1><h2>${escape(title)} · ${escape(sheet.competence)}</h2></div>
    <div class="meta"><p><b>Empresa:</b> ${escape(company.legalName)}<br>CNPJ: ${escape(company.cnpj)}</p>
    <p><b>Funcionário:</b> ${escape(employee.name)}<br>CPF: ${escape(employee.cpf)}</p>
    <p><b>Função:</b> ${escape(employee.role)}<br>Matrícula: ${escape(employee.registration||'—')}</p></div>
    <table><thead><tr><th>Dia</th><th>Ocorrência</th><th>Origem</th><th>Entrada</th><th>Saída almoço</th><th>Volta almoço</th><th>Saída</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><span>Trabalhadas: ${duration(summary.workedMinutes)}</span>
    <span>Extras: ${duration(summary.overtimeMinutes)}</span><span>Déficit: ${duration(summary.deficitMinutes)}</span>
    <span>Noturnas: ${duration(summary.nightMinutes)}</span><span>Faltas: ${summary.absences}</span></div>
    <div class="sign"><div>Assinatura do funcionário · Data: ____/____/________</div><div>Assinatura do responsável · Data: ____/____/________</div></div>
    <footer>Documento de conferência e assinatura posterior. Horários GERADOS / CONFERIDOS EM LOTE continuam identificados como gerados;
    horários NÃO CONFERIDOS não compõem a apuração. A assinatura deve ocorrer após conferir o conteúdo impresso.
    Esta ficha não constitui registrador eletrônico REP nem arquivo oficial AEJ/AFD.</footer></body></html>`;
}
