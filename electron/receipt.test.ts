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
  assert.match(html,/Líquido a receber/);
});

test('Atlas receipt keeps two A4 copies with institutional palette and no external assets',()=>{
 const company:Company={id:'x',legalName:'Exemplo Ltda',tradeName:'Exemplo',cnpj:'11222333000181',address:'Avenida Um',createdAt:''};
 const employee:Employee={id:'y',companyId:'x',name:'Rita Nascimento',cpf:'',role:'Analista',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true,createdAt:''};
 const calc=calculatePayroll({salaryCents:300000,competence:'2026-11',entries:[],taxMode:'automatic',dependents:0});
 const record:PayrollRecord={kind:'vacation',id:'z',employeeId:'y',companyId:'x',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calc,employee,company,competence:'2026-11',taxMode:'automatic',payableBy:'2026-11-12'}};
 const html=receiptHTML(record);
 assert.equal((html.match(/class="slip"/g)||[]).length,2);
 assert.match(html,/#264E78/i);
 assert.match(html,/RECIBO DE FÉRIAS/);
 assert.match(html,/Via do empregador/);
 assert.match(html,/Via do colaborador/);
 assert.doesNotMatch(html,/<link\\b|<script\\b|@import/i);
});
