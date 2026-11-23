import {useState} from 'react';
import type {EmployeeImportChoice,EmployeeImportPreview,EmployeeImportMapping,EmployeeImportEdits} from '../../electron/employee-import';
import {EMPLOYEE_IMPORT_COLUMNS} from '../shared/employee-import-fields';
import type {EmployeeImportField} from '../shared/employee-import-fields';

export function EmployeeImportPanel({companyId,onDone}:{companyId:string;onDone:()=>Promise<void>}){
  const [choice,setChoice]=useState<EmployeeImportChoice|null>(null);
  const [mapping,setMapping]=useState<EmployeeImportMapping>({});
  const [preview,setPreview]=useState<EmployeeImportPreview|null>(null);
  const [edits,setEdits]=useState<EmployeeImportEdits>({});
  const [dirty,setDirty]=useState(false);
  const [page,setPage]=useState(0);
  const [onlyErrors,setOnlyErrors]=useState(false);
  const [allowPartial,setAllowPartial]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('');setNotice('');
    try{await action();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  const refresh=async(nextPage=page,errorsOnly=onlyErrors)=>{
    if(!choice)return;
    setPreview(await window.holerites.previewEmployeeFile({token:choice.token,mapping,edits,offset:nextPage*20,onlyErrors:errorsOnly}));
    setPage(nextPage);setOnlyErrors(errorsOnly);setDirty(false);
  };
  const change=(line:number,key:EmployeeImportField,value:string)=>{
    setEdits(old=>({...old,[line]:{...old[line],[key]:value}}));setDirty(true);
  };
  return <section className="card time-sheet" aria-label="Importar funcionários por planilha">
    <h2>Importar funcionários CSV / Excel</h2>
    <p>Até 30.000 colaboradores e 30 MB por arquivo. O modelo já vem com cabeçalhos reconhecidos automaticamente. CPF ou matrícula identificam os funcionários; cadastros existentes não serão sobrescritos.</p>
    <div className="time-actions">
      <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
        if(await window.holerites.exportEmployeeTemplate())setNotice('Modelo XLSX salvo.');
      })}>Baixar modelo de funcionários</button>
      <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{
        const file=await window.holerites.chooseEmployeeFile(companyId);
        if(file){setChoice(file);setMapping(file.suggestedMapping);setPreview(null);setEdits({});setDirty(false);setPage(0);}
      })}>Selecionar arquivo CSV/XLSX</button>
    </div>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {notice&&<p role="status" className="success-banner">{notice}</p>}
    {choice&&<>
      <p><strong>{choice.filename}</strong> · {choice.count} linha(s) · Aba: {choice.sheetName}</p>
      <div className="time-form-grid">{EMPLOYEE_IMPORT_COLUMNS.map(column=><label key={column.key} className="field">
        <span>{column.label}</span>
        <select aria-label={'Coluna '+column.label} value={mapping[column.key]||''} onChange={e=>{
          setMapping(current=>({...current,[column.key]:e.target.value}));setPreview(null);setDirty(false);
        }}>
          <option value="">Não importar</option>{choice.headers.map(header=><option key={header} value={header}>{header}</option>)}
        </select>
      </label>)}</div>
      <div className="time-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(()=>refresh(0,false))}>
          {dirty?'Revalidar correções':'Conferir prévia'}</button>
        <label><input type="checkbox" checked={allowPartial} onChange={e=>setAllowPartial(e.target.checked)}/> Importar válidos e ignorar linhas com erro</label>
        <button className="btn btn-primary" disabled={busy||!preview||dirty||preview.created===0||preview.errors.length>0&&!allowPartial}
          onClick={()=>void run(async()=>{
            if(preview?.errors.length&&allowPartial&&!window.confirm('Importar somente '+preview.created+' funcionário(s) válido(s) e deixar '+preview.errors.length+' linha(s) com erro de fora?'))return;
            const result=await window.holerites.commitEmployeeFile({token:choice.token,mapping,edits,allowPartial});
            await onDone();setChoice(null);setPreview(null);
            setNotice(result.created+' funcionário(s) criado(s); '+result.skipped+' cadastro(s) existente(s) preservado(s).');
          })}>Cadastrar {dirty?'após conferir':preview?.created??0} funcionário(s)</button>
      </div>
      {preview&&<>
        <p><strong>{preview.created} novos</strong> · {preview.skipped} já cadastrados · {preview.errors.length} com erro</p>
        {preview.errors.length>0&&<div className="time-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
            if(await window.holerites.exportImportErrors(preview.errors))setNotice('Relatório de erros CSV salvo.');
          })}>Exportar erros CSV</button>
          <span>Corrija diretamente as células ou altere a planilha original.</span>
        </div>}
        <div className="time-actions">
          <label><input type="checkbox" checked={onlyErrors} onChange={e=>void run(()=>refresh(0,e.target.checked))}/> Mostrar somente linhas com erro</label>
          <span>Exibindo {preview.rows.length} de {preview.totalRows} linhas</span>
        </div>
        <div className="table-scroll import-edit-scroll">
          <table className="data-table import-edit-table">
            <thead><tr><th>Linha</th><th>Estado</th>{EMPLOYEE_IMPORT_COLUMNS.map(column=><th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row=><tr key={row.line}>
              <td>{row.line}</td>
              <td><span title={row.message}>{row.status==='new'?'Válido':row.status==='skipped'?'Já cadastrado':'Corrigir'}</span></td>
              {EMPLOYEE_IMPORT_COLUMNS.map(column=><td key={column.key}>
                <input aria-label={column.label+' linha '+row.line} value={edits[row.line]?.[column.key]??row.values[column.key]}
                  onChange={event=>change(row.line,column.key,event.target.value)}/>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {preview.rows.some(row=>row.status==='error')&&<ul className="time-import-errors">
          {preview.rows.filter(row=>row.status==='error').map(row=><li key={row.line}>Linha {row.line}: {row.message}</li>)}
        </ul>}
        <div className="time-actions">
          <button className="btn btn-secondary" disabled={busy||page===0} onClick={()=>void run(()=>refresh(page-1))}>Anterior</button>
          <span>Página {page+1}</span>
          <button className="btn btn-secondary" disabled={busy||(page+1)*20>=preview.totalRows} onClick={()=>void run(()=>refresh(page+1))}>Próxima</button>
          {dirty&&<button className="btn btn-primary" disabled={busy} onClick={()=>void run(()=>refresh())}>Validar células editadas</button>}
        </div>
      </>}
    </>}
  </section>;
}
