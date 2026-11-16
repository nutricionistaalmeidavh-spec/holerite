export const TOUR_STEPS = [
  {id:'company',title:'Cadastre sua empresa',description:'Informe a razão social e os dados que vão identificar o empregador nos recibos.',action:'Cadastrar empresa'},
  {id:'employee',title:'Cadastre um funcionário',description:'Inclua cargo, admissão, salário-base e, se necessário, verbas recorrentes.',action:'Cadastrar funcionário'},
  {id:'payroll',title:'Abra a folha de pagamento',description:'Escolha a competência, o colaborador e o tipo de documento: salário, férias, 13º ou rescisão.',action:'Abrir folha'},
  {id:'finalize',title:'Calcule e finalize',description:'Revise INSS, IRRF, FGTS e líquido. Salve o rascunho e finalize somente após a conferência.',action:'Conferir holerite'},
  {id:'print',title:'Gerar PDF e imprimir',description:'No holerite finalizado, gere o PDF em duas vias ou use Imprimir. Os recibos ficam acessíveis no histórico.',action:'Abrir histórico'}
] as const;

export function OnboardingTour({step,onAction,onNext,onExit}:{
  step:number;onAction:()=>void;onNext:()=>void;onExit:()=>void
}) {
  const current=TOUR_STEPS[Math.max(0,Math.min(TOUR_STEPS.length-1,step))];
  return <section className="onboarding-tour" aria-label="Tour guiado" aria-live="polite">
    <div className="tour-heading"><span>TOUR GUIADO · Etapa {step+1} de {TOUR_STEPS.length}</span>
      <button type="button" onClick={onExit} aria-label="Encerrar tour">Encerrar tour</button></div>
    <div className="tour-body"><div><h2>{current.title}</h2><p>{current.description}</p></div>
      <div className="tour-actions"><button type="button" className="btn btn-secondary" onClick={onAction}>{current.action}</button>
        <button type="button" className="btn btn-primary" onClick={step===TOUR_STEPS.length-1?onExit:onNext}>
          {step===TOUR_STEPS.length-1?'Concluir tour':'Próxima etapa'}
        </button></div></div>
    <div className="tour-progress" aria-hidden="true">{TOUR_STEPS.map((s,index)=><span key={s.id} className={index<=step?'done':''}/>)}</div>
  </section>;
}
