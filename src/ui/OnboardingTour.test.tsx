import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {OnboardingTour, TOUR_STEPS} from './OnboardingTour';

test('tour contains the five essential stages from company to printing',()=>{
  assert.equal(TOUR_STEPS.length,5);
  assert.deepEqual(TOUR_STEPS.map(s=>s.id),['company','employee','payroll','finalize','print']);
});
test('tour shows accessible actions, current progress and an exit button',()=>{
  const html=renderToStaticMarkup(<OnboardingTour step={4} onAction={()=>{}} onNext={()=>{}} onExit={()=>{}}/>);
  assert.match(html,/Tour guiado/);
  assert.match(html,/Etapa 5 de 5/);
  assert.match(html,/Gerar PDF e imprimir/);
  assert.match(html,/Concluir tour/);
  assert.match(html,/Encerrar tour/);
});
test('tour stage for employee instructs registering a staff member',()=>{
  const html=renderToStaticMarkup(<OnboardingTour step={1} onAction={()=>{}} onNext={()=>{}} onExit={()=>{}}/>);
  assert.match(html,/Cadastrar funcionário/);
  assert.match(html,/Etapa 2 de 5/);
});
