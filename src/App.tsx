import {useEffect, useMemo, useState} from 'react';
import type {Company, CompanyInput, Employee, EmployeeInput, PayItem, PayrollInput, PayrollRecord, StateSnapshot, TaxMode} from './shared/types';
import {calculateSpecialPayroll,calculateThirteenthMonths} from './shared/special';
import type {PayrollKind, SpecialOptions, VacationOptions, ThirteenthOptions, TerminationOptions} from './shared/special';
import {calculatePayroll, money} from './shared/payroll';
import {PayrollKindTabs,PAYROLL_KIND_LABELS} from './ui/PayrollKindTabs';

type Tab='dashboard'|'payroll'|'employees'|'companies'|'history';
const payrollKindLabels=PAYROLL_KIND_LABELS;
const initialOptions=(kind:PayrollKind,competence:string,employee:Employee,advanceCents:number):SpecialOptions => {
  if(kind==='vacation')return {vacation:{startDate:competence+'-15',days:30,soldDays:0,acquisitionStart:employee.admissionDate}};
  const year=Number(competence.slice(0,4));
  const months=calculateThirteenthMonths(employee.admissionDate,String(year)+'-12-31',year);
  if(kind==='thirteenth-first')return {thirteenth:{months,advanceCents:0}};
  if(kind==='thirteenth-second')return {thirteenth:{months,advanceCents}};
  if(kind==='termination')return {termination:{date:competence+'-20',reason:'without-cause',notice:'indemnified',vacationAccrualStart:employee.admissionDate,accruedPeriods:0,overduePeriods:0,fgtsPenaltyBasisCents:0,prior13thAdvanceCents:advanceCents}};
  return {};
};

type Modal='company'|'employee'|null;
type IconName='dashboard'|'payroll'|'employees'|'company'|'history'|'plus'|'download'|'print'|'check'|'edit'|'search'|'close'|'trash'|'backup'|'arrow'|'menu';
const ICONS:Record<IconName, string> = {
  dashboard:'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  payroll:'M5 2h11l4 4v16H5z M16 2v5h4 M8 12h9 M8 16h9 M8 20h6',
  employees:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  company:'M3 22V6l9-4v20 M12 8h9v14 M6 9h2 M6 13h2 M6 17h2 M16 12h2 M16 16h2 M16 20h2 M2 22h20',
  history:'M3 12a9 9 0 1 0 3-6.7 M3 3v5h5 M12 7v5l4 3',
  plus:'M12 5v14 M5 12h14',
  download:'M12 3v12 M7 10l5 5 5-5 M5 19h14',
  print:'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  check:'M4 12l5 5L20 6',
  edit:'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z',
  search:'M11 19a8 8 0 1 0 0-16a8 8 0 0 0 0 16 M21 21l-4.35-4.35',
  close:'M5 5l14 14 M19 5L5 19',
  trash:'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  backup:'M4 4h16v16H4z M8 4v6h8V4 M8 20v-7h8v7',
  arrow:'M5 12h14 M13 6l6 6-6 6',
  menu:'M4 6h16 M4 12h16 M4 18h16'
};
const Icon=({name,size=20}: {name:IconName;size?:number})=><svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]}/></svg>;
const brDate = (s:string)=>{if(!s)return '—'; const [y,m,d]=s.split('-'); return d?`${d}/${m}/${y}`:`${m}/${y}`;};
const toCents=(s:string)=>Math.round(Number(s.replace(',','.'))*100);
const asReais=(cents:number)=> (cents/100).toFixed(2);
const initialData:StateSnapshot={companies:[],employees:[],payrolls:[]};
const labelStatus:Record<string,string>={draft:'Rascunho',finalized:'Finalizado',paid:'Pago'};

function Button({children,onClick,variant='primary',type='button',disabled=false,icon}: {children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'ghost'|'danger';type?:'button'|'submit';disabled?:boolean;icon?:IconName}) {
  return <button type={type} onClick={onClick} className={'btn btn-'+variant} disabled={disabled}>{icon&&<Icon name={icon} size={17}/>}<span>{children}</span></button>;
}
function Empty({title,description,action}: {title:string;description:string;action?:React.ReactNode}) {
  return <div className="empty"><div className="empty-symbol"><Icon name="payroll" size={28}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function Status({status}: {status:PayrollRecord['status']}) {return <span className={'status status-'+status}><i/>{labelStatus[status]}</span>;}
function Field({label,children,hint}: {label:string;children:React.ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}

function CompanyForm({initial,onSave,onClose,busy}: {initial?:Company;onSave:(v:CompanyInput & {id?:string})=>void;onClose:()=>void;busy:boolean}) {
  const [v,setV]=useState<CompanyInput>({legalName:initial?.legalName??'',tradeName:initial?.tradeName??'',cnpj:initial?.cnpj??'',address:initial?.address??''});
  const change=(name:keyof CompanyInput,value:string)=>setV(x=>({...x,[name]:value}));
  return <form onSubmit={e=>{e.preventDefault();onSave({...v,id:initial?.id});}} className="form-grid">
    <Field label="Razão social *"><input value={v.legalName} onChange={e=>change('legalName',e.target.value)} required maxLength={150} autoFocus/></Field>
    <Field label="Nome fantasia"><input value={v.tradeName} onChange={e=>change('tradeName',e.target.value)} maxLength={150}/></Field>
    <Field label="CNPJ"><input value={v.cnpj} onChange={e=>change('cnpj',e.target.value)} placeholder="14 dígitos" maxLength={18}/></Field>
    <Field label="Endereço"><input value={v.address} onChange={e=>change('address',e.target.value)} maxLength={250}/></Field>
    <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" icon="check" disabled={busy}>Salvar empresa</Button></div>
  </form>;
}
function EmployeeForm({initial,companies,companyId,onSave,onClose,busy}: {initial?:Employee;companies:Company[];companyId:string;onSave:(v:EmployeeInput & {id?:string})=>void;onClose:()=>void;busy:boolean}) {
  const [v,setV]=useState({companyId:initial?.companyId??companyId??companies[0]?.id??'',name:initial?.name??'',cpf:initial?.cpf??'',role:initial?.role??'',admissionDate:initial?.admissionDate??new Date().toISOString().slice(0,10),salary:initial?asReais(initial.salaryCents):'',dependents:String(initial?.dependents??0),active:initial?.active??true});
  const change=(key:keyof typeof v,value:string|boolean)=>setV(s=>({...s,[key]:value}));
  return <form className="form-grid" onSubmit={e=>{e.preventDefault();onSave({id:initial?.id,companyId:v.companyId,name:v.name,cpf:v.cpf,role:v.role,admissionDate:v.admissionDate,salaryCents:toCents(v.salary),dependents:Number(v.dependents),active:v.active});}}>
    <Field label="Empresa *"><select required value={v.companyId} onChange={e=>change('companyId',e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.tradeName||c.legalName}</option>)}</select></Field>
    <Field label="Nome completo *"><input required value={v.name} onChange={e=>change('name',e.target.value)} autoFocus maxLength={150}/></Field>
    <Field label="CPF"><input value={v.cpf} onChange={e=>change('cpf',e.target.value)} placeholder="11 dígitos" maxLength={14}/></Field>
    <Field label="Cargo *"><input required value={v.role} onChange={e=>change('role',e.target.value)} maxLength={150}/></Field>
    <Field label="Admissão *"><input type="date" required value={v.admissionDate} onChange={e=>change('admissionDate',e.target.value)}/></Field>
    <Field label="Salário mensal (R$) *"><input type="number" required min="0.01" step="0.01" value={v.salary} onChange={e=>change('salary',e.target.value)}/></Field>
    <Field label="Dependentes para IRRF"><input type="number" required min="0" max="30" step="1" value={v.dependents} onChange={e=>change('dependents',e.target.value)}/></Field>
    <Field label="Situação"><select value={String(v.active)} onChange={e=>change('active',e.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
    <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" icon="check" disabled={busy}>Salvar funcionário</Button></div>
  </form>;
}
const blankEntry=():PayItem=>({id:crypto.randomUUID(),code:'100',description:'',kind:'earning',amountCents:0,inssBase:true,irBase:true,fgtsBase:true});


function SpecialFields({kind,options,onChange,disabled}:{
  kind:PayrollKind;options:SpecialOptions;onChange:(v:SpecialOptions)=>void;disabled:boolean
}) {
  if(kind==='vacation') {
    const v=options.vacation!;
    const update=(patch:Partial<VacationOptions>)=>onChange({vacation:{...v,...patch}});
    return <section className="special-fields"><h3>Programação das férias</h3><p>Informe o início, o período aquisitivo e quantos dias serão usufruídos ou vendidos.</p>
      <div className="special-grid">
        <Field label="Início das férias *"><input disabled={disabled} type="date" value={v.startDate} onChange={e=>update({startDate:e.target.value})}/></Field>
        <Field label="Início período aquisitivo *"><input disabled={disabled} type="date" value={v.acquisitionStart} onChange={e=>update({acquisitionStart:e.target.value})}/></Field>
        <Field label="Dias gozados *"><input disabled={disabled} type="number" min="1" max="30" value={v.days} onChange={e=>update({days:Number(e.target.value)})}/></Field>
        <Field label="Dias vendidos (abono)"><input disabled={disabled} type="number" min="0" max="10" value={v.soldDays} onChange={e=>update({soldDays:Number(e.target.value)})}/></Field>
      </div><p className="special-hint">Pagamento previsto até dois dias antes do início. Revise períodos aquisitivos, férias fracionadas, início próximo a repousos e médias salariais.</p>
    </section>;
  }
  if(kind==='thirteenth-first'||kind==='thirteenth-second'){
    const v=options.thirteenth!;
    const update=(patch:Partial<ThirteenthOptions>)=>onChange({thirteenth:{...v,...patch}});
    return <section className="special-fields"><h3>{payrollKindLabels[kind]}</h3><p>{kind==='thirteenth-first'?'Adiantamento de metade do 13º proporcional. Sem INSS e IRRF nesta parcela.':'13º integral, menos o adiantamento já pago. INSS e IRRF separados do salário mensal.'}</p>
      <div className="special-grid">
        <Field label="Avos de direito (1 a 12) *"><input type="number" min="1" max="12" disabled={disabled} value={v.months} onChange={e=>update({months:Number(e.target.value)})}/></Field>
        {kind==='thirteenth-second'&&<Field label="Primeira parcela paga anteriormente (R$)" hint="Pré-preenchida se houver recibo de primeira parcela registrado."><input disabled={disabled} type="number" min="0" step="0.01" value={(v.advanceCents/100).toFixed(2)} onChange={e=>update({advanceCents:Math.round(Number(e.target.value)*100)})}/></Field>}
      </div>
      <p className="special-hint">Confira os avos e médias de verbas variáveis. A primeira parcela normalmente vence até 30/11; a segunda até 20/12.</p>
    </section>;
  }
  if(kind==='termination') {
    const v=options.termination!;
    const update=(patch:Partial<TerminationOptions>)=>onChange({termination:{...v,...patch}});
    return <section className="special-fields"><h3>Dados da rescisão</h3><p>O cálculo depende do motivo, do aviso-prévio, dos direitos adquiridos e do histórico do FGTS.</p>
      <div className="special-grid">
        <Field label="Data do desligamento *"><input type="date" disabled={disabled} value={v.date} onChange={e=>update({date:e.target.value})}/></Field>
        <Field label="Motivo da rescisão *"><select disabled={disabled} value={v.reason} onChange={e=>update({reason:e.target.value as TerminationOptions['reason']})}><option value="without-cause">Dispensa sem justa causa</option><option value="with-cause">Dispensa por justa causa</option><option value="resignation">Pedido de demissão</option><option value="mutual">Acordo mútuo · art. 484-A</option></select></Field>
        <Field label="Aviso-prévio *"><select disabled={disabled} value={v.notice} onChange={e=>update({notice:e.target.value as TerminationOptions['notice']})}><option value="indemnified">Indenizado</option><option value="worked">Trabalhado</option><option value="none">Não aplicável / ajuste manual</option></select></Field>
        <Field label="Início do período aquisitivo atual"><input type="date" disabled={disabled} value={v.vacationAccrualStart} onChange={e=>update({vacationAccrualStart:e.target.value})}/></Field>
        <Field label="Períodos de férias adquiridos e não gozados"><input type="number" min="0" max="10" disabled={disabled} value={v.accruedPeriods} onChange={e=>update({accruedPeriods:Number(e.target.value)})}/></Field>
        <Field label="Períodos de férias sujeitos a pagamento em dobro"><input type="number" min="0" max="10" disabled={disabled} value={v.overduePeriods} onChange={e=>update({overduePeriods:Number(e.target.value)})}/></Field>
        <Field label="Base histórica da multa FGTS (R$)" hint="Depósitos relevantes, a confirmar com extrato FGTS."><input disabled={disabled} type="number" min="0" step="0.01" value={(v.fgtsPenaltyBasisCents/100).toFixed(2)} onChange={e=>update({fgtsPenaltyBasisCents:Math.round(Number(e.target.value)*100)})}/></Field>
        <Field label="Adiantamento de 13º já pago (R$)"><input disabled={disabled} type="number" min="0" step="0.01" value={(v.prior13thAdvanceCents/100).toFixed(2)} onChange={e=>update({prior13thAdvanceCents:Math.round(Number(e.target.value)*100)})}/></Field>
      </div>
      <p className="special-hint">Multa FGTS é informativa e não integra o líquido. Ajustes sindicais, múltiplos vínculos e estabilidade exigem revisão especializada antes da finalização.</p>
    </section>;
  }
  return null;
}

function PayrollEditor({employee,competence,kind,defaultAdvanceCents,existing,busy,onSave,onFinalize,onPaid,onDelete,onPDF,onPrint}:{
  employee:Employee; competence:string;kind:PayrollKind;defaultAdvanceCents:number; existing?:PayrollRecord;busy:boolean;
  onSave:(x:PayrollInput)=>void;
  onFinalize:()=>void;onPaid:()=>void;onDelete:()=>void;onPDF:()=>void;onPrint:()=>void;
}) {
  const savedSalary=existing?.details.salaryCents??employee.salaryCents;
  const [salaryText,setSalaryText]=useState(asReais(savedSalary));
  const [taxMode,setTaxMode]=useState<TaxMode>(existing?.details.taxMode??(competence.startsWith('2026-')?'automatic':'manual'));
  const [entries,setEntries]=useState<PayItem[]>(existing?.details.items.filter(i=>!i.id.startsWith('generated:')&&!['SAL','INSS','IRRF'].includes(i.code))??[]);
  const [specialOptions,setSpecialOptions]=useState<SpecialOptions>(existing?.details.options??initialOptions(kind,competence,employee,defaultAdvanceCents));
  const locked=!!existing&&existing.status!=='draft';
  const modify=(id:string, patch:Partial<PayItem>)=>setEntries(s=>s.map(x=>x.id===id?{...x,...patch}:x));
  const calculation=useMemo(()=>{try {const salaryCents=toCents(salaryText);return {result:kind==='monthly'?calculatePayroll({salaryCents,competence,dependents:employee.dependents,taxMode,entries}):calculateSpecialPayroll({salaryCents,competence,admissionDate:employee.admissionDate,dependents:employee.dependents,taxMode,entries,kind,options:specialOptions}),error:null as string|null};}catch(error){return {result:null,error:(error as Error).message};}},[salaryText,competence,employee.admissionDate,employee.dependents,taxMode,entries,kind,specialOptions]);
  const preview=locked?existing.details:calculation.result;
  return <div className="editor">
    <div className="editor-header"><div><div className="eyebrow">{payrollKindLabels[kind].toUpperCase()} · {brDate(competence)}</div><h2>{employee.name}</h2><p>{employee.role} · {money(employee.salaryCents)} de salário cadastrado</p></div>{existing&&<Status status={existing.status}/>}</div>
    <div className="editor-stepper" aria-label="Etapas da preparação"><span><b>01</b> Conferir parâmetros</span><span><b>02</b> Revisar rubricas</span><span><b>03</b> Salvar e emitir</span></div>
    <div className="editor-layout"><div className="editor-form-panel"><div className="edit-settings">
      <Field label="Salário-base desta competência (R$)" hint="Pode ser ajustado sem alterar o cadastro do funcionário."><input type="number" step="0.01" min="0.01" value={salaryText} disabled={locked} onChange={e=>setSalaryText(e.target.value)}/></Field>
      <Field label="Apuração de INSS e IRRF" hint="Automático disponível para competências de 2026."><select disabled={locked} value={taxMode} onChange={e=>setTaxMode(e.target.value as TaxMode)}><option value="automatic" disabled={!competence.startsWith('2026-')}>Automática · tabelas 2026</option><option value="manual">Manual · sem cálculo de impostos</option></select></Field>
    </div>
    <SpecialFields kind={kind} options={specialOptions} onChange={setSpecialOptions} disabled={locked}/>
    <div className="section-bar"><div><h3>Lançamentos adicionais</h3><p>Horas extras, adicionais, benefícios, faltas e adiantamentos.</p></div><Button icon="plus" variant="secondary" disabled={locked||busy} onClick={()=>setEntries(x=>[...x,blankEntry()])}>Adicionar verba</Button></div>
    {entries.length===0?<div className="no-entries">Nenhum lançamento adicional. As verbas padrão do tipo selecionado serão geradas automaticamente.</div>:<div className="entries">
      {entries.map(item=><div className="entry-row" key={item.id}>
        <div className="entry-grid">
          <Field label="Cód."><input disabled={locked} value={item.code} maxLength={12} onChange={e=>modify(item.id,{code:e.target.value})}/></Field>
          <Field label="Descrição"><input disabled={locked} value={item.description} placeholder="Ex.: Horas extras" maxLength={100} onChange={e=>modify(item.id,{description:e.target.value})}/></Field>
          <Field label="Tipo"><select disabled={locked} value={item.kind} onChange={e=>modify(item.id,{kind:e.target.value as PayItem['kind'],inssBase:e.target.value==='earning',irBase:e.target.value==='earning',fgtsBase:e.target.value==='earning'})}><option value="earning">Vencimento</option><option value="deduction">Desconto</option></select></Field>
          <Field label="Valor (R$)"><input disabled={locked} type="number" min="0" step="0.01" defaultValue={asReais(item.amountCents)} onChange={e=>modify(item.id,{amountCents:toCents(e.target.value)})}/></Field>
          <button type="button" className="icon-btn remove" disabled={locked} onClick={()=>setEntries(x=>x.filter(y=>y.id!==item.id))} aria-label="Remover lançamento"><Icon name="trash" size={17}/></button>
        </div>
        {item.kind==='earning'&&<div className="incidences"><span>Compõe a base de:</span>{(['inssBase','irBase','fgtsBase'] as const).map((key)=><label key={key}><input type="checkbox" disabled={locked} checked={item[key]} onChange={e=>modify(item.id,{[key]:e.target.checked})}/>{key==='inssBase'?'INSS':key==='irBase'?'IRRF':'FGTS'}</label>)}</div>}
      </div>)}
    </div>}
    {calculation.error&&!locked&&<div className="error-inline">{calculation.error}</div>}
    {preview && 'warnings' in preview && Array.isArray(preview.warnings) && preview.warnings.map((w,i)=><p key={i} className="special-hint">{String(w)}</p>)}
    {taxMode==='manual'&&!locked&&<p className="notice">No modo manual, o sistema não calcula nem insere INSS/IRRF. Cadastre os descontos aplicáveis como lançamentos e confira com o responsável pela folha.</p>}
    <div className="editor-actions">
      {!locked&&<Button icon="check" disabled={busy||!!calculation.error} onClick={()=>onSave({id:existing?.id,employeeId:employee.id,competence,kind,options:kind==='monthly'?undefined:specialOptions,entries,salaryOverrideCents:toCents(salaryText),taxMode})}>{existing?'Salvar alterações':'Salvar rascunho'}</Button>}
      {existing?.status==='draft'&&<Button variant="secondary" icon="check" disabled={busy} onClick={onFinalize}>Finalizar</Button>}
      {existing?.status==='finalized'&&<Button variant="secondary" icon="check" disabled={busy} onClick={onPaid}>Marcar como pago</Button>}
      {existing&&<><Button variant="secondary" icon="download" disabled={busy} onClick={onPDF}>Gerar PDF</Button><Button variant="secondary" icon="print" disabled={busy} onClick={onPrint}>Imprimir</Button></>}
      {existing?.status==='draft'&&<Button variant="danger" icon="trash" disabled={busy} onClick={onDelete}>Excluir rascunho</Button>}
    </div>
    {existing?.status==='draft'&&<p className="subtle-note">Salve todas as alterações antes de finalizar. Holerites finalizados ficam bloqueados para preservar o histórico.</p>}
    </div><aside className="editor-summary" aria-label="Resumo financeiro">
      <div className="summary-eyebrow"><span>RESUMO DA EMISSÃO</span><span className="summary-live"><i/> {locked?'Fechado':'Em conferência'}</span></div>
      {preview&&<div className="results">{'payableBy' in preview && typeof preview.payableBy==='string' && <p className="due-note">Prazo legal previsto para pagamento: <strong>{brDate(preview.payableBy)}</strong></p>}{'fgtsPenaltyCents' in preview && Number(preview.fgtsPenaltyCents)>0 && <p className="due-note">Multa FGTS estimada (não compõe o líquido): <strong>{money(Number(preview.fgtsPenaltyCents))}</strong></p>}
      <div className="results-title"><h3>Conferência da folha</h3><span>{locked?'Valores finalizados':'Prévia de cálculo'}</span></div>
      <div className="tax-cards"><div><span>INSS</span><b>{money(preview.totals.inssCents)}</b></div><div><span>IRRF</span><b>{money(preview.totals.irrfCents)}</b></div><div><span>FGTS patronal</span><b>{money(preview.totals.fgtsCents)}</b><small>Não descontado do salário</small></div></div>
      <div className="results-totals"><div><span>Total de vencimentos</span><strong>{money(preview.totals.grossCents)}</strong></div><div><span>Total de descontos</span><strong>{money(preview.totals.deductionCents)}</strong></div><div className="results-net"><span>Líquido a receber</span><strong>{money(preview.totals.netCents)}</strong></div></div>
    </div>}
      <p className="summary-reassurance"><Icon name="check" size={16}/> Os valores são calculados localmente. Revise antes de finalizar.</p>
    </aside></div>
  </div>;
}
function App() {
  const [data,setData]=useState<StateSnapshot>(initialData);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [tab,setTab]=useState<Tab>('dashboard');
  const [modal,setModal]=useState<Modal>(null);
  const [editingCompany,setEditingCompany]=useState<Company|undefined>();
  const [editingEmployee,setEditingEmployee]=useState<Employee|undefined>();
  const [companyId,setCompanyId]=useState('');
  const [competence,setCompetence]=useState(()=>String(new Date().getFullYear())+'-'+String(new Date().getMonth()+1).padStart(2,'0'));
  const [selectedEmployeeId,setSelectedEmployeeId]=useState('');
  const [payrollKind,setPayrollKind]=useState<PayrollKind>('monthly');
  const [search,setSearch]=useState('');
  const [historyKind,setHistoryKind]=useState<'all'|PayrollKind>('all');
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const reload=async()=>{const snapshot=await window.holerites.snapshot();setData(snapshot);setCompanyId(id=>snapshot.companies.some(c=>c.id===id)?id:(snapshot.companies[0]?.id??''));};
  useEffect(()=>{reload().catch(e=>setError(String(e))).finally(()=>setLoading(false));},[]);
  async function act(task:()=>Promise<unknown>,message?:string) {setBusy(true);setError('');setToast('');try{await task();await reload();if(message)setToast(message);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  const employees=useMemo(()=>data.employees.filter(e=>!companyId||e.companyId===companyId),[data.employees,companyId]);
  const payrolls=useMemo(()=>data.payrolls.filter(p=>!companyId||p.companyId===companyId),[data.payrolls,companyId]);
  const currentPayrolls=payrolls.filter(p=>p.competence===competence);
  const currentNet=currentPayrolls.reduce((n,p)=>n+p.details.totals.netCents,0);
  const selectedEmployee=employees.find(e=>e.id===selectedEmployeeId);
  const existing=selectedEmployee&&data.payrolls.find(p=>p.employeeId===selectedEmployee.id&&p.competence===competence&&p.kind===payrollKind);
  const filtered=search.trim().toLowerCase();
  const navigate=(to:Tab)=>{setTab(to);setSearch('');setSidebarOpen(false);};
  const startKind=(kind:PayrollKind)=>{setPayrollKind(kind);navigate('payroll');};
  const companyName=(id:string)=>data.companies.find(c=>c.id===id)?.tradeName||data.companies.find(c=>c.id===id)?.legalName||'—';
  const openCompany=(v?:Company)=>{setEditingCompany(v);setModal('company');};
  const openEmployee=(v?:Employee)=>{setEditingEmployee(v);setModal('employee');};
  const ask=(text:string)=>window.confirm(text);
  const monthPicker=<input className="month-input" aria-label="Competência" type="month" value={competence} onChange={e=>{setCompetence(e.target.value);setSelectedEmployeeId('');}}/>;
  const companyPicker=<select className="company-picker" aria-label="Empresa atual" value={companyId} onChange={e=>{setCompanyId(e.target.value);setSelectedEmployeeId('');}}>{data.companies.map(c=><option key={c.id} value={c.id}>{c.tradeName||c.legalName}</option>)}</select>;
  const selectEmployee=(id:string)=>{setSelectedEmployeeId(id);setTab('payroll');};
  const title:Record<Tab,string>={dashboard:'Visão geral',payroll:'Folha de pagamento',employees:'Funcionários',companies:'Empresas',history:'Histórico de holerites'};
  if(loading)return <div className="loading"><div className="brandmark">A</div><h2>ArtiSys Holerites</h2><p>Carregando seus dados locais…</p></div>;
  return <div className="app-shell">
    <aside className={'sidebar '+(sidebarOpen?'sidebar-open':'')} aria-label="Navegação principal">
      <div className="brand"><div className="brandmark">A</div><div><strong>ArtiSys</strong><span>HOLERITES</span></div></div>
      <div className="sidebar-category">GESTÃO</div>
      <nav aria-label="Menu principal">{([
        ['dashboard','Visão geral','dashboard'],
        ['payroll','Folha de pagamento','payroll'],
        ['employees','Funcionários','employees'],
        ['companies','Empresas','company'],
        ['history','Histórico','history']
      ] as [Tab,string,IconName][]).map(([key,label,icon])=><button type="button" className={'nav-link '+(tab===key?'active':'')} aria-current={tab===key?'page':undefined} onClick={()=>navigate(key)} key={key}><Icon name={icon} size={19}/>{label}</button>)}</nav>
      <div className="sidebar-footer"><div className="secure-dot"/><div><b>Banco local</b><span>Seus dados permanecem neste computador.</span></div></div>
    </aside>
    {sidebarOpen&&<button className="sidebar-overlay" onClick={()=>setSidebarOpen(false)} aria-label="Fechar menu"/>}
    <div className="main">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle" onClick={()=>setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu"/></button><span className="crumb">Workspace</span><span className="crumb-sep">/</span><strong>{title[tab]}</strong></div><div className="topbar-right">{data.companies.length>0&&companyPicker}<div className="avatar" title="ArtiSys Holerites">AS</div></div></header>
      <main className="page">
        <div className="page-heading"><div><div className="eyebrow">ARTISYS · GESTÃO DE PESSOAS</div><h1>{title[tab]}</h1><p>{tab==='dashboard'?'Acompanhe seus lançamentos e recibos em um só lugar.':tab==='payroll'?'Calcule, confira e emita seus holerites.':tab==='employees'?'Cadastros e remunerações da equipe.':tab==='companies'?'Dados de identificação para seus recibos.':'Consulte, imprima e exporte comprovantes já emitidos.'}</p></div><div className="heading-actions">{(tab==='dashboard'||tab==='payroll')&&monthPicker}{tab==='dashboard'&&data.companies.length>0&&<Button icon="plus" onClick={()=>startKind('monthly')}>Novo documento</Button>}{tab==='employees'&&<Button icon="plus" disabled={!data.companies.length} onClick={()=>openEmployee()}>Novo funcionário</Button>}{tab==='companies'&&<Button icon="plus" onClick={()=>openCompany()}>Nova empresa</Button>}{tab==='history'&&<Button variant="secondary" icon="download" onClick={()=>void act(()=>window.holerites.exportCSV(),'Relatório CSV exportado.')}>Exportar CSV</Button>}</div></div>
        {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="Fechar erro" onClick={()=>setError('')}><Icon name="close" size={16}/></button></div>}
        {toast&&<div className="success-banner" role="status"><Icon name="check" size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Fechar aviso"><Icon name="close" size={15}/></button></div>}
        {data.companies.length===0&&tab!=='companies'?<div className="card"><Empty title="Comece cadastrando sua empresa" description="O primeiro passo é informar os dados que aparecerão nos recibos de salário." action={<Button icon="plus" onClick={()=>openCompany()}>Cadastrar empresa</Button>}/></div>:null}
        {data.companies.length>0&&tab==='dashboard'&&<>
          <section className="overview-hero" aria-label="Emissão de documentos e resumo da competência">
            <div className="hero-copy">
              <div className="hero-kicker"><span aria-hidden="true"/> CONTROLE DE FOLHA · DESKTOP OFFLINE</div>
              <h2>Uma folha clara, <em>do cálculo ao recibo.</em></h2>
              <p>Salário mensal, férias, 13º e rescisões em um só lugar, com memória de cálculo e histórico organizado.</p>
              <div className="hero-actions"><Button icon="plus" onClick={()=>startKind('monthly')}>Emitir documento</Button><Button variant="secondary" onClick={()=>navigate('history')}>Consultar histórico</Button></div>
            </div>
            <div className="hero-summary">
              <div className="hero-summary-top"><span>COMPETÊNCIA · {brDate(competence)}</span><Icon name="payroll" size={19}/></div>
              <span className="hero-summary-label">Líquido registrado</span>
              <strong>{money(currentNet)}</strong>
              <div className="hero-summary-divider"/>
              <div className="hero-summary-row"><span>Documentos</span><b>{currentPayrolls.length}</b></div>
              <div className="hero-summary-row"><span>Finalizados / aguardando</span><b>{currentPayrolls.filter(p=>p.status==='finalized').length}</b></div>
              <div className="hero-summary-row"><span>Marcados como pagos</span><b>{currentPayrolls.filter(p=>p.status==='paid').length}</b></div>
            </div>
          </section>
          <div className="metric-grid"><div className="metric-card"><span>Colaboradores ativos</span><b>{employees.filter(e=>e.active).length}</b><small>Cadastrados na empresa</small><div className="metric-icon"><Icon name="employees"/></div></div><div className="metric-card"><span>Holerites na competência</span><b>{currentPayrolls.length}</b><small>{brDate(competence)}</small><div className="metric-icon"><Icon name="payroll"/></div></div><div className="metric-card featured"><span>Total líquido da folha</span><b>{money(currentNet)}</b><small>Valores dos holerites cadastrados</small><div className="metric-icon"><Icon name="dashboard"/></div></div><div className="metric-card"><span>Pendentes de pagamento</span><b>{currentPayrolls.filter(p=>p.status==='finalized').length}</b><small>Finalizados e não marcados pagos</small><div className="metric-icon"><Icon name="history"/></div></div></div>
          <div className="dashboard-grid"><section className="card"><div className="card-heading"><div><h2>Últimos holerites</h2><p>Acompanhe os recibos da sua equipe.</p></div><button className="text-action" onClick={()=>navigate('history')}>Ver histórico <Icon name="arrow" size={16}/></button></div>{payrolls.length? <div className="table-scroll"><table className="data-table"><thead><tr><th>Funcionário</th><th>Competência</th><th>Líquido</th><th>Status</th></tr></thead><tbody>{payrolls.slice(0,6).map(p=><tr key={p.id} onClick={()=>{setCompetence(p.competence);setPayrollKind(p.kind??'monthly');selectEmployee(p.employeeId);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setCompetence(p.competence);setPayrollKind(p.kind??'monthly');selectEmployee(p.employeeId);}}} tabIndex={0} aria-label={'Abrir '+payrollKindLabels[p.kind??'monthly']+' de '+p.details.employee.name} className="click-row"><td><strong>{p.details.employee.name}</strong><small>{p.details.employee.role}</small></td><td>{brDate(p.competence)}<small>{payrollKindLabels[p.kind??'monthly']}</small></td><td className="money-cell">{money(p.details.totals.netCents)}</td><td><Status status={p.status}/></td></tr>)}</tbody></table></div>:<Empty title="Nenhum holerite emitido" description="Selecione um funcionário e inicie a folha desta competência." action={<Button onClick={()=>navigate('payroll')} icon="plus">Criar holerite</Button>}/>}</section>
          <section className="card quick-card"><h2>Ações rápidas</h2><p>Atalhos para as tarefas do dia a dia.</p><button onClick={()=>startKind('monthly')}><span className="quick-icon"><Icon name="payroll"/></span><span><strong>Gerar holerite</strong><small>Preparar e conferir valores</small></span><Icon name="arrow"/></button><button onClick={()=>startKind('vacation')}><span className="quick-icon"><Icon name="history"/></span><span><strong>Férias</strong><small>Terço constitucional e abono</small></span><Icon name="arrow"/></button>
            <button onClick={()=>startKind('thirteenth-first')}><span className="quick-icon"><Icon name="payroll"/></span><span><strong>13º salário</strong><small>Primeira ou segunda parcela</small></span><Icon name="arrow"/></button>
            <button onClick={()=>startKind('termination')}><span className="quick-icon"><Icon name="history"/></span><span><strong>Rescisão</strong><small>Demonstrativo de desligamento</small></span><Icon name="arrow"/></button>
            <button onClick={()=>openEmployee()}><span className="quick-icon"><Icon name="employees"/></span><span><strong>Novo funcionário</strong><small>Adicionar à equipe</small></span><Icon name="arrow"/></button><button onClick={()=>void act(()=>window.holerites.exportBackup(),'Backup salvo no local escolhido.')}><span className="quick-icon"><Icon name="backup"/></span><span><strong>Fazer backup</strong><small>Exportar banco SQLite</small></span><Icon name="arrow"/></button><div className="quick-info">Os recibos finalizados guardam uma cópia dos dados e cálculos da emissão, mesmo que o cadastro seja alterado.</div></section></div>
        </>}
        {tab==='companies'&&<div className="card"><div className="card-heading"><div><h2>Empresas cadastradas</h2><p>Dados utilizados no cabeçalho dos recibos.</p></div></div>{data.companies.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Razão social</th><th>CNPJ</th><th>Endereço</th><th></th></tr></thead><tbody>{data.companies.map(c=><tr key={c.id}><td><strong>{c.legalName}</strong><small>{c.tradeName}</small></td><td>{c.cnpj||'—'}</td><td>{c.address||'—'}</td><td><button className="small-action" onClick={()=>openCompany(c)}><Icon name="edit" size={15}/> Editar</button></td></tr>)}</tbody></table></div>:<Empty title="Nenhuma empresa cadastrada" description="Cadastre uma empresa para começar a emitir holerites." action={<Button icon="plus" onClick={()=>openCompany()}>Nova empresa</Button>}/>}</div>}
        {tab==='employees'&&<div className="card"><div className="card-heading"><div><h2>Equipe cadastrada</h2><p>{employees.length} funcionário(s) na empresa selecionada.</p></div><div className="search-box"><Icon name="search" size={17}/><input placeholder="Buscar funcionário" aria-label="Buscar funcionário" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{employees.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Funcionário</th><th>CPF</th><th>Salário-base</th><th>Admissão</th><th>Situação</th><th></th></tr></thead><tbody>{employees.filter(e=>(e.name+' '+e.role+' '+e.cpf).toLowerCase().includes(filtered)).map(e=><tr key={e.id}><td><strong>{e.name}</strong><small>{e.role}</small></td><td>{e.cpf||'—'}</td><td className="money-cell">{money(e.salaryCents)}</td><td>{brDate(e.admissionDate)}</td><td><span className={'status '+(e.active?'status-paid':'status-draft')}><i/>{e.active?'Ativo':'Inativo'}</span></td><td><button className="small-action" onClick={()=>openEmployee(e)}><Icon name="edit" size={15}/> Editar</button> <button className="small-action" onClick={()=>selectEmployee(e.id)}>Holerite</button></td></tr>)}</tbody></table></div>:<Empty title="Nenhum funcionário" description="Cadastre a equipe antes de preparar a folha." action={<Button icon="plus" onClick={()=>openEmployee()}>Cadastrar funcionário</Button>}/>}</div>}
        {data.companies.length>0&&tab==='payroll'&&<>
          <PayrollKindTabs value={payrollKind} onChange={setPayrollKind} disabled={busy}/>
          {employees.length===0?<div className="card"><Empty title="Cadastre o primeiro funcionário" description="É necessário ter pelo menos um colaborador para gerar um recibo." action={<Button onClick={()=>openEmployee()} icon="plus">Novo funcionário</Button>}/></div>:<div className="payroll-layout">
            <section className="card employee-rail"><div className="rail-title"><h2>Colaboradores</h2><small>{brDate(competence)}</small></div><div className="rail-list">{employees.filter(e=>e.active||data.payrolls.some(p=>p.employeeId===e.id&&p.competence===competence)).map(e=>{const record=data.payrolls.find(p=>p.employeeId===e.id&&p.competence===competence&&p.kind===payrollKind);return <button key={e.id} className={'employee-rail-item '+(selectedEmployeeId===e.id?'selected':'')} onClick={()=>setSelectedEmployeeId(e.id)}><span className="person-avatar">{e.name.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</span><span className="employee-rail-text"><strong>{e.name}</strong><small>{record?labelStatus[record.status]:'Não gerado'}</small></span><Icon name="arrow" size={16}/></button>;})}</div></section>
            <section className="card workspace">{selectedEmployee?<PayrollEditor key={`${selectedEmployee.id}-${competence}-${payrollKind}-${existing?.id??'new'}-${existing?.status??'none'}`} employee={selectedEmployee} competence={competence} kind={payrollKind} defaultAdvanceCents={data.payrolls.filter(p=>p.employeeId===selectedEmployee.id&&p.kind==='thirteenth-first'&&p.competence.startsWith(competence.slice(0,4))).reduce((v,p)=>v+p.details.totals.grossCents,0)} existing={existing} busy={busy}
              onSave={input=>void act(()=>window.holerites.savePayroll(input),'Rascunho salvo.')}
              onFinalize={()=>{if(ask('Finalizar este holerite? Depois disso os valores não poderão ser alterados.'))void act(()=>window.holerites.finalizePayroll(existing!.id),'Holerite finalizado.');}}
              onPaid={()=>{if(ask('Confirmar que o pagamento foi efetivamente realizado?'))void act(()=>window.holerites.markPaid(existing!.id),'Pagamento registrado.');}}
              onDelete={()=>{if(ask('Excluir este rascunho?'))void act(()=>window.holerites.deleteDraft(existing!.id),'Rascunho excluído.');}}
              onPDF={()=>void act(()=>window.holerites.exportPDF(existing!.id))} onPrint={()=>void act(()=>window.holerites.print(existing!.id))}
            />:<Empty title="Selecione um colaborador" description="Escolha um funcionário à esquerda para criar ou consultar o holerite da competência selecionada."/>}</section>
          </div>}
        </>}
        {tab==='history'&&<div className="card"><div className="card-heading"><div><h2>Recibos e pagamentos</h2><p>Holerites finalizados preservam os dados originais da emissão.</p></div><div className="history-controls"><select aria-label="Filtrar por tipo de documento" className="history-kind-filter" value={historyKind} onChange={e=>setHistoryKind(e.target.value as 'all'|PayrollKind)}><option value="all">Todos os tipos</option>{(Object.keys(payrollKindLabels) as PayrollKind[]).map(k=><option key={k} value={k}>{payrollKindLabels[k]}</option>)}</select><div className="search-box"><Icon name="search" size={17}/><input placeholder="Buscar nome ou mês" aria-label="Buscar holerite" value={search} onChange={e=>setSearch(e.target.value)}/></div></div></div>{payrolls.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Funcionário</th><th>Competência</th><th>Bruto</th><th>Descontos</th><th>Líquido</th><th>Status</th><th>Documentos</th></tr></thead><tbody>{payrolls.filter(p=>(historyKind==='all'||p.kind===historyKind)&&(p.details.employee.name+' '+p.competence).toLowerCase().includes(filtered)).map(p=><tr key={p.id}><td><strong>{p.details.employee.name}</strong><small>{companyName(p.companyId)}</small></td><td>{brDate(p.competence)}<small>{payrollKindLabels[p.kind??'monthly']}</small></td><td className="money-cell">{money(p.details.totals.grossCents)}</td><td className="money-cell">{money(p.details.totals.deductionCents)}</td><td className="money-cell"><strong>{money(p.details.totals.netCents)}</strong></td><td><Status status={p.status}/></td><td className="table-actions"><button onClick={()=>void act(()=>window.holerites.exportPDF(p.id))} title="Salvar PDF" aria-label="Salvar PDF"><Icon name="download" size={17}/></button><button onClick={()=>void act(()=>window.holerites.print(p.id))} title="Imprimir" aria-label="Imprimir"><Icon name="print" size={17}/></button><button onClick={()=>{setCompetence(p.competence);setPayrollKind(p.kind??'monthly');selectEmployee(p.employeeId);}} title="Abrir holerite">Abrir</button></td></tr>)}</tbody></table></div>:<Empty title="Histórico vazio" description="Os holerites aparecerão aqui depois do primeiro rascunho."/>}</div>}
        <footer className="page-footer"><span>ArtiSys Holerites · 0.1.0</span><span>100% offline · Sem serviços pagos obrigatórios · Dados sob seu controle</span></footer>
      </main>
    </div>
    {modal&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target)setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-label={modal==='company'?'Cadastro de empresa':'Cadastro de funcionário'}><div className="modal-heading"><div><div className="eyebrow">CADASTRO</div><h2>{modal==='company'?(editingCompany?'Editar empresa':'Nova empresa'):(editingEmployee?'Editar funcionário':'Novo funcionário')}</h2></div><button className="icon-btn" type="button" aria-label="Fechar" onClick={()=>setModal(null)}><Icon name="close"/></button></div>{modal==='company'?<CompanyForm initial={editingCompany} busy={busy} onClose={()=>setModal(null)} onSave={input=>void act(async()=>{const c=await window.holerites.saveCompany(input);setCompanyId(c.id);setModal(null);},'Empresa salva com sucesso.')}/>:<EmployeeForm initial={editingEmployee} companies={data.companies} companyId={companyId} busy={busy} onClose={()=>setModal(null)} onSave={input=>void act(async()=>{await window.holerites.saveEmployee(input);setModal(null);},'Funcionário salvo com sucesso.')}/>}</div></div>}
  </div>;
}
export default App;
