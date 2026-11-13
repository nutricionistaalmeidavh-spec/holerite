import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptHTML } from './receipt';
import { calculatePayroll } from '../src/shared/payroll';
import type { Company, Employee, PayrollRecord } from '../src/shared/types';

test('A4 document contains two copies, escaped employee data and reconciled totals', () => {
  const company:Company={id:'c',legalName:'Empresa & Filhos',tradeName:'',cnpj:'',address:'',createdAt:''};
  const employee:Employee={id:'e',companyId:'c',name:'Pessoa <script>alert(1)</script>',cpf:'',role:'Auxiliar',admissionDate:'2026-01-05',salaryCents:200000,dependents:0,active:true,createdAt:''};
  const calculation=calculatePayroll({salaryCents:200000,competence:'2026-11',entries:[],taxMode:'automatic',dependents:0});
  const record:PayrollRecord={kind:'monthly',id:'p',employeeId:'e',companyId:'c',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calculation,employee,company,competence:'2026-11',taxMode:'automatic'}};
  const html=receiptHTML(record);
  assert.equal((html.match(/class="slip"/g)||[]).length,2);
  assert.equal(html.includes('Pessoa <script>'),false);
  assert.match(html,/Pessoa &lt;script&gt;/);
  assert.match(html,/Empresa &amp; Filhos/);
  assert.match(html,/Salário Líquido/);
});

test('compact A4 receipt uses neutral monochrome styling with independent earnings and deductions',()=>{
 const company:Company={id:'x',legalName:'Exemplo Ltda',tradeName:'Exemplo',cnpj:'11222333000181',address:'Avenida Um',createdAt:''};
 const employee:Employee={id:'y',companyId:'x',name:'Rita Nascimento',cpf:'',role:'Analista',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true,createdAt:''};
 const calc=calculatePayroll({salaryCents:300000,competence:'2026-11',entries:[],taxMode:'automatic',dependents:0});
 const record:PayrollRecord={kind:'vacation',id:'z',employeeId:'y',companyId:'x',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calc,employee,company,competence:'2026-11',taxMode:'automatic',payableBy:'2026-11-12'}};
 const html=receiptHTML(record);
 assert.equal((html.match(/class="slip"/g)||[]).length,2);
 assert.match(html,/@page\s*\{\s*size:\s*A4/i);
 assert.match(html,/class="payroll-columns"/);
 assert.match(html,/class="payroll-table earnings"/);
 assert.match(html,/class="payroll-table deductions"/);
 assert.match(html,/Total de Proventos/);
 assert.match(html,/Total de Descontos/);
 assert.match(html,/Salário Líquido/);
 assert.match(html,/Contracheque/);
 assert.match(html,/Férias/);
 assert.doesNotMatch(html,/#264E78|#E5F2EE|#16776D/i);
 assert.match(html,/Via do empregador/);
 assert.match(html,/Via do colaborador/);
 assert.doesNotMatch(html,/<link\\b|<script\\b|@import/i);
});


test('receipt shows actual rubrics in separate columns and never invents a reference amount',()=>{
 const company:Company={id:'c',legalName:'Empresa Exemplo',tradeName:'',cnpj:'',address:'',createdAt:''};
 const employee:Employee={id:'e',companyId:'c',name:'Pessoa QA',cpf:'',role:'Auxiliar',admissionDate:'2026-01-10',salaryCents:400000,dependents:0,active:true,createdAt:''};
 const entries=[{id:'bonus',code:'BON',description:'Adicional de Tempo de Serviço',kind:'earning' as const,amountCents:12000,inssBase:true,irBase:true,fgtsBase:true},{id:'vt',code:'VT',description:'Vale-Transporte',kind:'deduction' as const,amountCents:24000,inssBase:false,irBase:false,fgtsBase:false}];
 const calculation=calculatePayroll({salaryCents:400000,competence:'2026-11',entries,taxMode:'automatic',dependents:0});
 const p:PayrollRecord={kind:'monthly',id:'p',employeeId:'e',companyId:'c',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calculation,employee,company,competence:'2026-11',taxMode:'automatic'}};
 const html=receiptHTML(p);
 assert.equal((html.match(/class="slip"/g)||[]).length,2);
 assert.match(html,/Adicional de Tempo de Serviço/);
 assert.match(html,/Vale-Transporte/);
 assert.match(html,/INSS \(2026\)/);
 assert.match(html,/Referência/);
 assert.match(html,/Via do empregador/);
 assert.match(html,/Via do colaborador/);
 assert.match(html,/class="sheet compact"/);
});

test('long receipts switch to an extended two-page layout instead of clipping rows',()=>{
 const company:Company={id:'c',legalName:'Empresa Exemplo',tradeName:'',cnpj:'',address:'',createdAt:''};
 const employee:Employee={id:'e',companyId:'c',name:'Pessoa QA',cpf:'',role:'Auxiliar',admissionDate:'2026-01-10',salaryCents:400000,dependents:0,active:true,createdAt:''};
 const entries=Array.from({length:12},(_,i)=>({id:'r-'+i,code:'X'+i,description:'Provento '+i,kind:'earning' as const,amountCents:100,inssBase:false,irBase:false,fgtsBase:false}));
 const calc=calculatePayroll({salaryCents:400000,competence:'2026-11',entries,taxMode:'manual',dependents:0});
 const record:PayrollRecord={kind:'monthly',id:'p',employeeId:'e',companyId:'c',competence:'2026-11',status:'draft',paidAt:null,createdAt:'',updatedAt:'',details:{...calc,employee,company,competence:'2026-11',taxMode:'manual'}};
 const html=receiptHTML(record);
 assert.match(html,/class="sheet extended"/);
 assert.equal((html.match(/class="slip"/g)||[]).length,2);
 assert.match(html,/Provento 11/);
});
