import {useState} from 'react';
import type {EmployeeImportChoice,EmployeeImportPreview,EmployeeImportMapping} from '../../electron/employee-import';
import {EMPLOYEE_IMPORT_COLUMNS} from '../shared/employee-import-fields';
import type {EmployeeImportField} from '../shared/employee-import-fields';

export function EmployeeImportPanel({companyId,onDone}:{companyId:string;onDone:()=>Promise<void>}){
  const [choice,setChoice]=useState<EmployeeImportChoice|null>(null);
  const [mapping,setMapping]=useState<EmployeeImportMapping>({});
  const [preview,setPreview]=useState<EmployeeImportPreview|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('');setNotice('');
    try{await action();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <section className="card time-sheet" aria-label="Importar funcionários por planilha">
    <h2>Importação de funcionários em lote</h2>
    <p>Importe até 30.000 funcionários por arquivo CSV ou XLSX (30 MB). A planilha deve ter nome, cargo, admissão, salário e CPF ou matrícula. Colaboradores já cadastrados são ignorados, sem sobrescrever dados existentes.</p>
    <div className="time-actions">
      <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
        const saved=await window.holerites.exportEmployeeTemplate();
        if(saved)setNotice('Modelo XLSX salvo.');
      })}>Baixar modelo XLSX</button>
      <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{
        const file=await window.holerites.chooseEmployeeFile(companyId);
        if(file){setChoice(file);setMapping(file.suggestedMapping);setPreview(null);}
      })}>Selecionar arquivo CSV/XLSX</button>
    </div>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {notice&&<p role="status" className="success-banner">{notice}</p>}
    {choice&&<>
      <p><strong>{choice.filename}</strong> · {choice.count} linha(s). Confira a correspondência das colunas:</p>
      <div className="time-form-grid">{EMPLOYEE_IMPORT_COLUMNS.map(column=><label key={column.key} className="field">
        <span>{column.label}</span>
        <select aria-label={'Coluna '+column.label} value={mapping[column.key]||''} onChange={e=>{
          const value=e.target.value;
          setMapping(current=>({...current,[column.key as EmployeeImportField]:value}));setPreview(null);
        }}>
          <option value="">Não importar</option>{choice.headers.map(header=><option key={header} value={header}>{header}</option>)}
        </select>
      </label>)}</div>
      <div className="time-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
          setPreview(await window.holerites.previewEmployeeFile({token:choice.token,mapping}));
        })}>Conferir prévia</button>
        <button className="btn btn-primary" disabled={busy||!preview||preview.created===0||preview.errors.length>0}
          onClick={()=>void run(async()=>{
            const result=await window.holerites.commitEmployeeFile({token:choice.token,mapping});
            await onDone();
            setChoice(null);setPreview(null);
            setNotice(result.created+' funcionário(s) cadastrado(s); '+result.skipped+' já existente(s) ignorado(s).');
          })}>Cadastrar {preview?.created??0} funcionário(s)</button>
      </div>
      {preview&&<>
        <p><strong>{preview.created} novos</strong> · {preview.skipped} já cadastrados (ignorados) · {preview.errors.length} erros</p>
        {preview.errors.length>0&&<ul className="time-import-errors">{preview.errors.slice(0,30).map((item,i)=><li key={i}>{item}</li>)}</ul>}
        {preview.errors.length>30&&<p>Mais {preview.errors.length-30} erro(s) no arquivo. Corrija a planilha antes de importar.</p>}
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Cargo</th><th>Admissão</th></tr></thead>
          <tbody>{preview.samples.map((item,i)=><tr key={i}><td>{item.name}</td><td>{item.cpf||'—'}</td><td>{item.registration||'—'}</td><td>{item.role}</td><td>{item.admissionDate}</td></tr>)}</tbody>
        </table></div>
      </>}
    </>}
  </section>;
}
