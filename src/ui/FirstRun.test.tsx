import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {StateSnapshot} from '../shared/types';
import {checklistTasks, TOUR_STEPS} from './onboarding';
import {WelcomeDialog, SetupChecklist, GuidedTour} from './FirstRun';

const snapshot = (companies=0, employees=0, status?: 'draft'|'finalized'|'paid'): StateSnapshot => ({
  companies: Array.from({length:companies},(_,id)=>({id:String(id),legalName:'Empresa',tradeName:'',cnpj:'',address:'',createdAt:''})),
  employees: Array.from({length:employees},(_,id)=>({id:String(id),companyId:'0',name:'Pessoa',cpf:'',role:'',admissionDate:'2026-01-01',salaryCents:100000,dependents:0,active:true,createdAt:''})),
  payrolls: status?[{id:'recibo',companyId:'0',employeeId:'0',competence:'2026-11',kind:'monthly',status,paidAt:null,createdAt:'',updatedAt:'',details:{} as StateSnapshot['payrolls'][number]['details']}]:[]
});

test('checklist reflects actual database snapshot, including distinction between draft and finalized',()=>{
  assert.deepEqual(checklistTasks(snapshot()).map(t=>t.done),[false,false,false,false]);
  assert.deepEqual(checklistTasks(snapshot(1)).map(t=>t.done),[true,false,false,false]);
  assert.deepEqual(checklistTasks(snapshot(1,1,'draft')).map(t=>t.done),[true,true,true,false]);
  assert.deepEqual(checklistTasks(snapshot(1,1,'finalized')).map(t=>t.done),[true,true,true,true]);
  assert.deepEqual(checklistTasks(snapshot(1,1,'paid')).map(t=>t.done),[true,true,true,true]);
});

test('guided tour covers registration, recurring payments, all payslips, receipts, and backup',()=>{
  assert.deepEqual(TOUR_STEPS.map(s=>s.page),['dashboard','companies','employees','employees','payroll','history','dashboard']);
  const content = TOUR_STEPS.map(s=>s.title+' '+s.description).join(' ');
  for(const fragment of ['empresa','funcionário','recorrentes','férias','13º','rescisão','PDF','backup']){
    assert.ok(content.toLowerCase().includes(fragment.toLowerCase()),fragment);
  }
});

test('first-access welcome offers explicit start and skip choices',()=>{
  const html=renderToStaticMarkup(<WelcomeDialog onStart={()=>{}} onSkip={()=>{}}/>);
  assert.match(html,/role="dialog"/);
  assert.match(html,/Bem-vindo ao ArtiSys Holerites/);
  assert.match(html,/Iniciar apresentação/);
  assert.match(html,/Pular por enquanto/);
});

test('checklist provides progress and task actions without pre-marking incomplete tasks',()=>{
  const html=renderToStaticMarkup(<SetupChecklist tasks={checklistTasks(snapshot(1))} onNavigate={()=>{}} onDismiss={()=>{}}/>);
  assert.match(html,/1 de 4 etapas/);
  assert.match(html,/aria-label="Progresso da configuração"/);
  assert.match(html,/Ocultar checklist/);
});

test('guided tour has visible progress, back, next and dismiss controls',()=>{
  const html=renderToStaticMarkup(<GuidedTour index={0} onPrevious={()=>{}} onNext={()=>{}} onSkip={()=>{}}/>);
  assert.match(html,/Etapa 1 de 7/);
  assert.match(html,/Próximo/);
  assert.match(html,/Pular tour/);
  assert.match(html,/disabled=""/);
});
