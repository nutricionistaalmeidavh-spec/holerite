import {useState} from 'react';
import type {CombinedImportChoice,CombinedImportPreview} from '../../electron/combined-import';
import type {EmployeeImportMapping} from '../../electron/employee-import';
import type {ImportMapping,ImportField} from '../../electron/time-import';
import {EMPLOYEE_IMPORT_COLUMNS} from '../shared/employee-import-fields';

const pointFields:Array<{key:ImportField;label:string}>=[
  {key:'employee',label:'Funcionário'},{key:'cpf',label:'CPF'},{key:'registration',label:'Matrícula'},
  {key:'date',label:'Data'},{key:'kind',label:'Ocorrência'},{key:'start',label:'Entrada'},
  {key:'breakStart',label:'Saída almoço'},{key:'breakEnd',label:'Retorno almoço'},{key:'end',label:'Saída'},
  {key:'notes',label:'Observações'}
];
export function CombinedImportPanel({companyId,onDone}:{companyId:string;onDone:()=>Promise<void>}){
  const [choice,setChoice]=useState<CombinedImportChoice|null>(null);
  const [employeeMapping,setEmployeeMapping]=useState<EmployeeImportMapping>({});
  const [timeMapping,setTimeMapping]=useState<ImportMapping>({});
  const [preview,setPreview]=useState<CombinedImportPreview|null>(null);
  const [replace,setReplace]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function run(fn:()=>Promise<void>){
    setError('');setNotice('');setBusy(true);
    try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  const tokens=()=>({
    employeeToken:choice!.employees.token,timeToken:choice!.time.token,employeeMapping,timeMapping
  });
  return <section className="card time-sheet" aria-label="Importar funcionários e ponto juntos">
    <h2>Importar equipe e fichas de ponto em um único arquivo</h2>
    <p>Use o modelo XLSX com as abas <strong>Funcionários</strong> e <strong>Ponto</strong>. O sistema cadastra os funcionários que ainda não existem e vincula cada marcação por CPF, matrícula ou nome, com validação antes de salvar.</p>
    <div className="time-actions">
      <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
        if(await window.holerites.exportCombinedTemplate())setNotice('Modelo completo salvo.');
      })}>Baixar modelo completo XLSX</button>
      <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{
        const selected=await window.holerites.chooseCombinedFile(companyId);
        if(selected){setChoice(selected);setEmployeeMapping(selected.employees.suggestedMapping);
          setTimeMapping(selected.time.suggestedMapping);setPreview(null);}
      })}>Selecionar pacote XLSX</button>
    </div>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {notice&&<p role="status" className="success-banner">{notice}</p>}
    {choice&&<>
      <p><strong>{choice.employees.filename}</strong> · {choice.employees.count} linha(s) de funcionários · {choice.time.count} linha(s) de ponto</p>
      <h3>Colunas dos funcionários</h3>
      <div className="time-form-grid">{EMPLOYEE_IMPORT_COLUMNS.map(field=><label key={field.key} className="field">
        <span>{field.label}</span>
        <select value={employeeMapping[field.key]||''} onChange={e=>{
          setEmployeeMapping(old=>({...old,[field.key]:e.target.value}));setPreview(null);
        }}><option value="">Não importar</option>
          {choice.employees.headers.map(h=><option value={h} key={h}>{h}</option>)}</select>
      </label>)}</div>
      <h3>Colunas dos registros de ponto</h3>
      <div className="time-form-grid">{pointFields.map(field=><label key={field.key} className="field">
        <span>{field.label}</span>
        <select value={timeMapping[field.key]||''} onChange={e=>{
          setTimeMapping(old=>({...old,[field.key]:e.target.value}));setPreview(null);
        }}><option value="">Não importar</option>
          {choice.time.headers.map(h=><option value={h} key={h}>{h}</option>)}</select>
      </label>)}</div>
      <div className="time-actions">
        <label><input type="checkbox" checked={replace} onChange={e=>{setReplace(e.target.checked);setPreview(null);}}/>
          Permitir substituição explícita de marcações reais já existentes</label>
        <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
          setPreview(await window.holerites.previewCombinedFile({...tokens(),allowReplace:replace}));
        })}>Conferir pacote</button>
        <button className="btn btn-primary" disabled={busy||!preview||preview.employees.errors.length>0||!preview.time||preview.time.errors.length>0||preview.time.accepted===0}
          onClick={()=>void run(async()=>{
            if(!window.confirm('Confirmar cadastro de '+preview?.employees.created+' funcionário(s) e importação de '+preview?.time?.accepted+' marcações? A operação será gravada integralmente ou desfeita.'))return;
            const result=await window.holerites.commitCombinedFile({...tokens(),allowReplace:replace});
            setChoice(null);setPreview(null);await onDone();
            setNotice('Pacote importado: '+result.created+' funcionário(s) e '+result.imported+' registro(s) de ponto. '+result.skipped+' cadastro(s) existente(s) preservado(s).');
          })}>Importar pacote validado</button>
      </div>
      {preview&&<>
        <p><strong>Funcionários:</strong> {preview.employees.created} novos, {preview.employees.skipped} existentes,
          {preview.employees.errors.length} erro(s).</p>
        {preview.warning&&<p role="alert">{preview.warning}</p>}
        {preview.time&&<p><strong>Fichas:</strong> {preview.time.accepted} marcações válidas e {preview.time.errors.length} erro(s).</p>}
        {preview.employees.errors.length>0&&<ul className="time-import-errors">
          {preview.employees.errors.slice(0,20).map((err,i)=><li key={i}>Funcionários — {err}</li>)}</ul>}
        {preview.time&&preview.time.errors.length>0&&<ul className="time-import-errors">
          {preview.time.errors.slice(0,20).map((err,i)=><li key={i}>Ponto — {err}</li>)}</ul>}
        {preview.employees.errors.length>0||preview.time?.errors.length?<>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
            if(await window.holerites.exportImportErrors([
              ...preview.employees.errors.map(e=>'Funcionários: '+e),...(preview.time?.errors??[]).map(e=>'Ponto: '+e)
            ]))setNotice('Relatório de erros salvo.');
          })}>Exportar erros CSV</button>
          <p>Corrija as abas do arquivo original e selecione o XLSX novamente para garantir consistência.</p>
        </>:null}
      </>}
    </>}
  </section>;
}
