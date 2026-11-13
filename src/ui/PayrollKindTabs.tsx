import type {PayrollKind} from '../shared/special';

export const PAYROLL_KIND_LABELS: Record<PayrollKind,string> = {
  monthly:'Salário mensal',
  vacation:'Férias',
  'thirteenth-first':'13º · 1ª parcela',
  'thirteenth-second':'13º · 2ª parcela',
  termination:'Rescisão'
};

const OPTIONS: ReadonlyArray<{value:PayrollKind;short:string;detail:string;number:string}> = [
  {value:'monthly',short:'Folha de pagamento',detail:'Remuneração e descontos do mês',number:'01'},
  {value:'vacation',short:'Terço constitucional',detail:'Terço constitucional e abono',number:'02'},
  {value:'thirteenth-first',short:'Primeiro adiantamento',detail:'Adiantamento proporcional',number:'03'},
  {value:'thirteenth-second',short:'Acerto anual',detail:'Saldo e tributos do 13º',number:'04'},
  {value:'termination',short:'Desligamento',detail:'Verbas e demonstrativo',number:'05'}
];

export function PayrollKindTabs({value,onChange,disabled=false}:{
  value:PayrollKind;onChange:(value:PayrollKind)=>void;disabled?:boolean
}) {
  const selected=OPTIONS.find(option=>option.value===value) ?? OPTIONS[0];
  return <section className="kind-selector" aria-label="Escolher documento da folha">
    <div className="kind-selector-heading">
      <div><div className="atlas-overline">TIPO DE DOCUMENTO</div><h2>O que deseja emitir?</h2></div>
      <span className="kind-hint">Selecione um tipo para preparar o cálculo</span>
    </div>
    <div className="kind-selector-options" role="group" aria-label="Tipo de documento">
      {OPTIONS.map(option=><button
        key={option.value} type="button" disabled={disabled}
        className={option.value===value?'kind-option is-active':'kind-option'}
        aria-pressed={option.value===value}
        onClick={()=>onChange(option.value)}>
        <span className="kind-option-index" aria-hidden="true">{option.number}</span>
        <strong>{PAYROLL_KIND_LABELS[option.value]}</strong>
        <small>{option.detail}</small>
      </button>)}
    </div>
    <div className="kind-selector-footer" aria-live="polite">
      <span className="kind-selector-marker" aria-hidden="true"/>
      <span><strong>{PAYROLL_KIND_LABELS[selected.value]}</strong> · {selected.short}. Os cálculos devem ser conferidos antes da finalização.</span>
    </div>
  </section>;
}
