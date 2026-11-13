import type {StateSnapshot} from '../shared/types';

export type OnboardingPage = 'dashboard'|'companies'|'employees'|'payroll'|'history';
export interface ChecklistTask {
  id: 'company'|'employee'|'draft'|'finalize';
  title: string;
  description: string;
  page: OnboardingPage;
  done: boolean;
}
export interface TourStep {
  page: OnboardingPage;
  title: string;
  description: string;
  hint: string;
}
export const TOUR_STEPS: readonly TourStep[] = [
  {page:'dashboard',title:'Seu espaço de trabalho',description:'A Visão geral reúne os documentos, indicadores e atalhos para a folha. Tudo funciona neste computador, mesmo sem internet.',hint:'Use o menu à esquerda para percorrer as áreas.'},
  {page:'companies',title:'Cadastre sua empresa',description:'Comece pela razão social e pelos dados que aparecem no cabeçalho dos recibos. Você pode gerenciar mais de uma empresa.',hint:'Selecione “Nova empresa” para cadastrar ou editar os dados.'},
  {page:'employees',title:'Cadastre seus funcionários',description:'Informe nome, cargo, salário, admissão e demais dados do colaborador. Os cadastros ficam disponíveis para os próximos meses.',hint:'Use “Novo funcionário” para começar.'},
  {page:'employees',title:'Configure as verbas recorrentes',description:'No cadastro de cada funcionário você pode incluir adicionais e descontos recorrentes, usados automaticamente em novos holerites mensais.',hint:'Abra um funcionário e procure “Verbas recorrentes”.'},
  {page:'payroll',title:'Emita sua folha de pagamento',description:'Escolha a competência e o tipo: salário mensal, férias, 13º (primeira ou segunda parcela) e rescisão. Confira os valores antes de finalizar.',hint:'Você também pode gerar rascunhos mensais em lote.'},
  {page:'history',title:'Consulte recibos e PDFs',description:'No Histórico, acompanhe rascunhos e documentos finalizados, filtre registros e salve ou imprima o PDF dos holerites.',hint:'Os recibos finalizados preservam os valores da emissão.'},
  {page:'dashboard',title:'Proteja seus dados com backup',description:'Na Visão geral, o atalho “Fazer backup” exporta uma cópia local consistente do banco SQLite. Guarde essa cópia em lugar seguro.',hint:'O backup é manual e não exige nuvem ou assinatura.'}
];

export const ONBOARDING_SEEN_KEY = 'artisys.holerites.first-run.seen.v1';
export const CHECKLIST_HIDDEN_KEY = 'artisys.holerites.first-run.checklist-hidden.v1';

export function readPreference(key:string):boolean {
  try {return typeof window !== 'undefined' && window.localStorage.getItem(key)==='1';}
  catch {return false;}
}
export function savePreference(key:string,enabled:boolean):void {
  try {if(typeof window !== 'undefined') window.localStorage.setItem(key,enabled?'1':'0');}
  catch {/* Navegação e cadastro permanecem disponíveis mesmo sem armazenamento web. */}
}
export function checklistTasks(snapshot:Pick<StateSnapshot,'companies'|'employees'|'payrolls'>):ChecklistTask[] {
  return [
    {id:'company',title:'Cadastrar empresa',description:'Dados para identificação dos recibos',page:'companies',done:snapshot.companies.length>0},
    {id:'employee',title:'Cadastrar funcionário',description:'Remuneração, vínculo e dados pessoais',page:'employees',done:snapshot.employees.length>0},
    {id:'draft',title:'Preparar primeiro holerite',description:'Criar e conferir um rascunho',page:'payroll',done:snapshot.payrolls.length>0},
    {id:'finalize',title:'Finalizar primeiro documento',description:'Conferir os cálculos e finalizar a emissão',page:'history',done:snapshot.payrolls.some(p=>p.status==='finalized'||p.status==='paid')}
  ];
}
