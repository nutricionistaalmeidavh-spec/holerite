import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptHTML } from './receipt';
import { calculatePayroll } from '../src/shared/payroll';
import type { Company, Employee, PayrollRecord } from '../src/shared/types';

test('A4 document contains two copies, escaped employee data and reconciled totals', () => {
  const company:Company={id:'c',legalName:'Empresa & Filhos',tradeName:'',cnpj:'',address:'',createdAt:''};
  const employee:Employee={id:'e',companyId:'c',name:'Pessoa <script>alert(1)</script>',cpf:'',role:'Auxiliar',admissionDate:'2026-01-05',salaryCents:200000,dependents:0,active:true,createdAt:''};
  const calculation=calculatePayroll({salaryCents:200000,competence:'2026-11',entries:[],taxMode:'automatic',dependents:0});
  const record:PayrollRecord={id:'p',employeeId:'e',companyId:'c',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calculation,employee,company,competence:'2026-11',taxMode:'automatic'}};
  const html=receiptHTML(record);
  assert.equal((html.match(/class="slip"/g)||[]).length,2);
  assert.equal(html.includes('Pessoa <script>'),false);
  assert.match(html,/Pessoa &lt;script&gt;/);
  assert.match(html,/Empresa &amp; Filhos/);
  assert.match(html,/Líquido a receber/);
});
