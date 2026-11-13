import React from 'react';
import type {ChecklistTask} from './onboarding';
import {TOUR_STEPS} from './onboarding';
import type {OnboardingPage} from './onboarding';

export function WelcomeDialog({onStart,onSkip}:{onStart:()=>void;onSkip:()=>void}) {
  return <div className="welcome-backdrop">
    <section className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="welcome-brand"><span className="welcome-logo" aria-hidden="true">A</span><span>ARTISYS · HOLERITES</span></div>
      <p className="welcome-eyebrow">PRIMEIRO ACESSO</p>
      <h2 id="first-run-title">Bem-vindo ao ArtiSys Holerites</h2>
      <p className="welcome-description">Configure sua empresa, cadastre funcionários e emita holerites com segurança e clareza. Conheça as principais funções em uma apresentação rápida.</p>
      <div className="welcome-features"><span>Dados locais</span><span>Férias, 13º e rescisão</span><span>PDF e impressão</span></div>
      <div className="welcome-actions">
        <button type="button" className="btn btn-secondary" onClick={onSkip}>Pular por enquanto</button>
        <button type="button" className="btn btn-primary" onClick={onStart}>Iniciar apresentação</button>
      </div>
    </section>
  </div>;
}

export function SetupChecklist({tasks,onNavigate,onDismiss}:{tasks:ChecklistTask[];onNavigate:(page:OnboardingPage)=>void;onDismiss:()=>void}) {
  const completed=tasks.filter(t=>t.done).length;
  return <section className="setup-checklist" aria-labelledby="setup-checklist-title">
    <div className="setup-heading">
      <div><p className="setup-eyebrow">COMECE POR AQUI</p><h2 id="setup-checklist-title">Configure seu ambiente</h2><p>Você já concluiu {completed} de {tasks.length} etapas.</p></div>
      <button type="button" className="setup-hide" onClick={onDismiss}>Ocultar checklist</button>
    </div>
    <progress className="setup-progress" max={tasks.length} value={completed} aria-label="Progresso da configuração"/>
    <div className="setup-grid">
      {tasks.map((task,index)=><button className={'setup-task'+(task.done?' is-done':'')} key={task.id} type="button" onClick={()=>onNavigate(task.page)} aria-label={task.title+(task.done?' — concluído':' — pendente')}>
        <span className="setup-task-icon" aria-hidden="true">{task.done?'✓':String(index+1)}</span>
        <span className="setup-task-content"><strong>{task.title}</strong><small>{task.description}</small></span>
        <span className="setup-task-status">{task.done?'Concluído':'Acessar'}</span>
      </button>)}
    </div>
  </section>;
}

export function GuidedTour({index,onPrevious,onNext,onSkip}:{index:number;onPrevious:()=>void;onNext:()=>void;onSkip:()=>void}) {
  const step=TOUR_STEPS[index];
  if(!step)return null;
  return <aside className="guided-tour" role="region" aria-label="Tour guiado do sistema" aria-live="polite">
    <div className="tour-heading"><span>TOUR INTERATIVO</span><button className="tour-dismiss" type="button" onClick={onSkip} aria-label="Fechar tour">×</button></div>
    <p className="tour-counter">Etapa {index+1} de {TOUR_STEPS.length}</p>
    <h2>{step.title}</h2><p className="tour-description">{step.description}</p>
    <p className="tour-hint">{step.hint}</p>
    <div className="tour-dots" aria-hidden="true">{TOUR_STEPS.map((s,i)=><span className={i===index?'current':''} key={s.title}/>)}</div>
    <div className="tour-actions">
      <button type="button" className="tour-skip" onClick={onSkip}>Pular tour</button>
      <button type="button" className="btn btn-secondary" onClick={onPrevious} disabled={index===0}>Voltar</button>
      <button type="button" className="btn btn-primary" onClick={onNext}>{index===TOUR_STEPS.length-1?'Concluir':'Próximo'}</button>
    </div>
  </aside>;
}
