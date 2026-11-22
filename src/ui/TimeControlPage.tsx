import {useCallback,useEffect,useMemo,useState} from 'react';
import type {Employee} from '../shared/types';
import type {TimeConfig,TimeSheet,MatrixChange} from '../../electron/attendance';
import type {ImportChoice,ImportMapping,ImportPreview,ImportField} from '../../electron/time-import';
import type {PointDay,WorkSchedule} from '../shared/time';
import {defaultSchedule,previewMonth,workedMinutes} from '../shared/time';

const kindLabels:Record<PointDay['kind'],string>={
  work:'Trabalho',absence:'Falta',vacation:'Férias',holiday:'Feriado',rest:'Folga',leave:'Afastamento'
};
const fields: Array<keyof Pick<PointDay,'start'|'breakStart'|'breakEnd'|'end'>>=['start','breakStart','breakEnd','end'];
const timeLabel:Record<string,string>={start:'Entrada',breakStart:'Saída almoço',breakEnd:'Volta almoço',end:'Saída'};
const importFields:Array<{key:ImportField;label:string}>=[
  {key:'employee',label:'Funcionário'},{key:'cpf',label:'CPF'},{key:'registration',label:'Matrícula'},
  {key:'date',label:'Data'},{key:'kind',label:'Ocorrência'},
  {key:'start',label:'Entrada'},{key:'breakStart',label:'Saída almoço'},
  {key:'breakEnd',label:'Volta almoço'},{key:'end',label:'Saída'},{key:'notes',label:'Observações'}
];
const duration=(value:number)=>String(Math.floor(Math.abs(value)/60)).padStart(2,'0')+':'+String(Math.abs(value)%60).padStart(2,'0');
const money=(value:number)=>(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dayText=(d:string)=>d.slice(-2)+'/'+d.slice(5,7);
const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
type View='individual'|'matrix'|'import'|'settings';

export function TimeControlPage({companyId,competence,employees,onPayrollUpdated}:{
  companyId:string;competence:string;employees:Employee[];onPayrollUpdated:()=>void
}){
  const [config,setConfig]=useState<TimeConfig|null>(null);
  const [employeeId,setEmployeeId]=useState('');
  const [schedule,setSchedule]=useState<WorkSchedule>(defaultSchedule());
  const [sheet,setSheet]=useState<TimeSheet|null>(null);
  const [days,setDays]=useState<PointDay[]>([]);
  const [view,setView]=useState<View>('individual');
  const [matrix,setMatrix]=useState<Array<TimeSheet&{employeeName:string}>>([]);
  const [matrixDrafts,setMatrixDrafts]=useState<Record<string,PointDay>>({});
  const [filter,setFilter]=useState('');
  const [page,setPage]=useState(0);
  const [importChoice,setImportChoice]=useState<ImportChoice|null>(null);
  const [mapping,setMapping]=useState<ImportMapping>({});
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [allowReplace,setAllowReplace]=useState(false);
  const [audit,setAudit]=useState<Array<{date:string|null;action:string;reason:string;created_at:string}>>([]);
  const [bankBalance,setBankBalance]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const enabled=!!config?.enabled;
  const activeEmployees=useMemo(()=>employees.filter(e=>e.active&&e.companyId===companyId),[employees,companyId]);

  const run=async(task:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('');
    try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    let mounted=true;
    setConfig(null);setEmployeeId('');setSheet(null);setDays([]);setMatrix([]);setMatrixDrafts({});
    if(companyId)window.holerites.getTimeConfig(companyId).then(c=>{if(mounted){setConfig(c);setSchedule(c.schedule);}}).catch(e=>{if(mounted)setError(String(e));});
    return ()=>{mounted=false;};
  },[companyId]);
  const loadSheet=useCallback(async()=>{
    if(!employeeId||!enabled)return;
    const [result,personSchedule,history,balance]=await Promise.all([
      window.holerites.getTimeSheet({employeeId,competence}),window.holerites.getTimeSchedule(employeeId),
      window.holerites.getTimeAudit({employeeId,competence}),
      window.holerites.getTimeBankBalance({employeeId,competence})
    ]);
    setSheet(result);setDays(result.days);setSchedule(personSchedule);setAudit(history);setBankBalance(balance);
  },[employeeId,competence,enabled]);
  const loadMatrix=useCallback(async()=>{
    if(!enabled||!companyId)return;
    const result=await window.holerites.getTimeMatrix({companyId,competence});
    setMatrix(result);setMatrixDrafts({});
  },[enabled,companyId,competence]);
  useEffect(()=>{let active=true;if(!employeeId||!enabled){setSheet(null);setDays([]);return;}
    loadSheet().catch(e=>{if(active)setError(String(e));});return()=>{active=false;};
  },[loadSheet,employeeId,enabled]);
  useEffect(()=>{if(view==='matrix'&&enabled)loadMatrix().catch(e=>setError(String(e)));},[view,loadMatrix,enabled]);
  const changeDay=(date:string,patch:Partial<PointDay>)=>{
    setDays(rows=>rows.map(day=>day.date===date?{...day,...patch,source:'manual' as const,
      ...(patch.kind&&patch.kind!=='work'?{start:'',breakStart:'',breakEnd:'',end:''}:{})}:day));
  };
  const selected=activeEmployees.find(e=>e.id===employeeId);
  const changedDays=days.filter(day=>JSON.stringify(day)!==JSON.stringify(sheet?.days.find(old=>old.date===day.date)));
  const saveDays=async()=>{
    if(!sheet||!changedDays.length)return;
    await window.holerites.saveTimeMatrix({changes:changedDays.map(day=>({
      employeeId,competence,day,expectedRevision:sheet.revision
    }))});
    await loadSheet();setNotice('Marcações salvas com origem e auditoria.');
  };
  const configure=async(next:TimeConfig)=>{
    if(!companyId)return;
    const configSaved=await window.holerites.setTimeConfig({companyId,config:next});
    setConfig(configSaved);setNotice('Configurações salvas. O controle de ponto continua opcional.');
  };
  const setScheduleField=<K extends keyof WorkSchedule>(key:K,value:WorkSchedule[K])=>setSchedule(old=>({...old,[key]:value}));
  const matrixRows=useMemo(()=>{
    const all=matrix.flatMap(s=>s.days.map(day=>({
      key:s.employeeId+'|'+day.date,employeeId:s.employeeId,employeeName:s.employeeName,
      revision:s.revision,competence:s.competence,day
    })));
    return all.filter(row=>row.employeeName.toLowerCase().includes(filter.toLowerCase())||row.day.date.includes(filter));
  },[matrix,filter]);
  const visibleMatrixRows=matrixRows.slice(page*100,(page+1)*100);
  const matrixEdit=(key:string,original:PointDay,patch:Partial<PointDay>)=>{
    setMatrixDrafts(all=>{
      const current=all[key]||original;
      return {...all,[key]:{...current,...patch,source:'manual',
        ...(patch.kind&&patch.kind!=='work'?{start:'',breakStart:'',breakEnd:'',end:''}:{})}};
    });
  };
  const pasteMatrix=(text:string,position:number,startColumn:number)=>{
    const cells=text.replace(/\r/g,'').trimEnd().split('\n').map(line=>line.split('\t'));
    const editable:Array<keyof PointDay>=['start','breakStart','breakEnd','end','notes'];
    if(cells.length===1&&cells[0].length===1)return;
    const next={...matrixDrafts};
    cells.forEach((line,rowIndex)=>{
      const row=visibleMatrixRows[position+rowIndex];
      if(!row||matrix.find(s=>s.employeeId===row.employeeId)?.status==='closed')return;
      const state={...(next[row.key]||row.day),source:'manual' as const};
      line.forEach((value,columnIndex)=>{
        const key=editable[startColumn+columnIndex];
        if(key)Object.assign(state,{[key]:value});
      });
      next[row.key]=state;
    });
    setMatrixDrafts(next);
  };
  const saveMatrix=async()=>{
    const changes:MatrixChange[]=matrixRows.filter(row=>matrixDrafts[row.key]).map(row=>({
      employeeId:row.employeeId,competence,day:matrixDrafts[row.key],expectedRevision:row.revision
    }));
    if(!changes.length)return;
    await window.holerites.saveTimeMatrix({changes});
    await loadMatrix();if(sheet)await loadSheet();setNotice(changes.length+' dia(s) atualizados na matriz.');
  };
  const saveSchedule=async()=>{
    if(employeeId){
      setSchedule(await window.holerites.setTimeSchedule({employeeId,schedule}));
      setNotice('Jornada personalizada do funcionário salva.');
    }else if(config)await configure({...config,schedule});
  };
  return <div className="time-page">
    <section className="card time-settings-bar">
      <div><h2>Controle de ponto <small>módulo opcional</small></h2>
        <p>O Holerite continua funcionando normalmente com este módulo desativado.</p></div>
      <label className="time-module-toggle"><input type="checkbox" checked={enabled} disabled={busy||!config}
        onChange={e=>{if(config)void run(()=>configure({...config,enabled:e.target.checked}));}}/> Ativar para esta empresa</label>
    </section>
    {error&&<div className="error-banner" role="alert">{error}<button aria-label="Fechar erro" onClick={()=>setError('')}>×</button></div>}
    {notice&&<div className="success-banner" role="status">{notice}</div>}
    {enabled&&<>
      <div className="time-toolbar" role="tablist" aria-label="Áreas do controle de ponto">
        {([['individual','Ficha individual'],['matrix','Matriz da equipe'],['import','Importar planilha'],['settings','Configurações']] as [View,string][]).map(([v,label])=>
          <button key={v} className={'btn '+(view===v?'btn-primary':'btn-secondary')} aria-selected={view===v} role="tab"
            onClick={()=>setView(v)}>{label}</button>)}
      </div>
      {view==='settings'&&config&&<section className="card time-settings">
        <h2>Configuração geral de jornada</h2><p>A jornada padrão é usada para gerar sugestões; não é um registro de batidas.</p>
        <div className="time-form-grid">
          {fields.map(field=><label className="field" key={field}><span>{timeLabel[field]}</span><input type="time" value={config.schedule[field]} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,[field]:e.target.value}}:old)}/></label>)}
          <label className="field"><span>Variação de prévia (min)</span><input type="number" min="0" max="10" step="1" value={config.variationMinutes} onChange={e=>setConfig(old=>old?{...old,variationMinutes:Number(e.target.value)}:old)}/></label>
          <label className="field"><span>Divisor mensal (horas)</span><input type="number" min="1" max="300" value={config.schedule.divisor} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,divisor:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Adicional hora extra (%)</span><input type="number" min="0" max="300" value={config.schedule.overtimePercent} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,overtimePercent:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Adicional noturno (%)</span><input type="number" min="0" max="100" value={config.schedule.nightPercent} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,nightPercent:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Tolerância atrasos (min)</span><input type="number" min="0" max="60" value={config.schedule.toleranceMinutes} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,toleranceMinutes:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Destino das extras</span><select value={config.schedule.overtimeDestination} onChange={e=>
            setConfig(old=>old?{...old,schedule:{...old.schedule,overtimeDestination:e.target.value as 'bank'|'pay'}}:old)}>
            <option value="pay">Pagar na folha</option><option value="bank">Banco de horas</option></select></label>
        </div>
        <div className="time-weekdays">{weekdays.map((day,index)=><label key={day}><input type="checkbox" checked={config.schedule.weekdays.includes(index)}
          onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,weekdays:e.target.checked?[...old.schedule.weekdays,index].sort() :old.schedule.weekdays.filter(d=>d!==index)}}:old)}/>{day}</label>)}</div>
        <p className="time-legal">Variação opcional (0–10 min), desativada por padrão; somente nas sugestões. Adicionais e divisores devem ser conferidos conforme categoria e legislação.</p>
        <button className="btn btn-primary" disabled={busy} onClick={()=>void run(()=>configure(config))}>Salvar configurações</button>
      </section>}
      {view==='individual'&&<section className="card time-sheet">
        <div className="time-filters"><label className="field"><span>Funcionário</span><select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
          <option value="">Selecione o funcionário</option>{activeEmployees.map(e=><option key={e.id} value={e.id}>{e.name} · {e.registration||e.cpf}</option>)}
        </select></label><span>Competência: <strong>{competence}</strong></span></div>
        {!employeeId?<p>Selecione um funcionário para cadastrar, importar, revisar e fechar sua ficha.</p>:sheet&&<>
          <div className="time-status"><span>{selected?.name} · {sheet.status==='closed'?'Fechada':'Rascunho'}</span>
            <small>Trabalhadas {duration(sheet.summary.workedMinutes)} | Extras {duration(sheet.summary.overtimeMinutes)} | Déficit {duration(sheet.summary.deficitMinutes)} | Noturnas {duration(sheet.summary.nightMinutes)} | Saldo banco {bankBalance<0?'-':'+'}{duration(bankBalance)}</small></div>
          <div className="time-mini-config"><strong>Jornada deste funcionário</strong>
            {fields.map(field=><label key={field}>{timeLabel[field]}<input type="time" value={schedule[field]} disabled={sheet.status==='closed'} onChange={e=>setScheduleField(field,e.target.value)}/></label>)}
            <button className="btn btn-secondary" disabled={busy||sheet.status==='closed'} onClick={()=>void run(saveSchedule)}>Salvar jornada</button></div>
          <div className="time-actions">
            <button className="btn btn-secondary" disabled={busy||sheet.status==='closed'} onClick={()=>{
              const registered=new Set(days.map(d=>d.date));
              const blanks=previewMonth(competence,schedule,0).filter(d=>!registered.has(d.date))
                .map(d=>({...d,source:'manual' as const,start:'',breakStart:'',breakEnd:'',end:''}));
              setDays(current=>[...current,...blanks].sort((a,b)=>a.date.localeCompare(b.date)));
              setNotice('Calendário vazio criado. Informe as batidas reais e salve.');
            }}>Criar ficha manual</button>
            <button className="btn btn-secondary" disabled={busy||sheet.status==='closed'} onClick={()=>void run(async()=>{const result=await window.holerites.autofillTimeSheet({employeeId,competence});setSheet(result);setDays(result.days);setNotice('Calendário sugerido. Confira os horários reais individualmente.');})}>Gerar calendário sugerido</button>
            <button className="btn btn-primary" disabled={busy||sheet.status==='closed'||!changedDays.length} onClick={()=>void run(saveDays)}>Salvar {changedDays.length} alteração(ões)</button>
            <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.exportTimePDF({employeeId,competence});})}>PDF</button>
            <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.printTimeSheet({employeeId,competence});})}>Imprimir</button>
            {sheet.status==='draft'?<button className="btn btn-primary" disabled={busy||changedDays.length>0} onClick={()=>{if(window.confirm('Fechar a ficha? Dias úteis sem marcação real ou ocorrência confirmada impedirão o fechamento.'))void run(async()=>{await window.holerites.closeTimeSheet({employeeId,competence});await loadSheet();setNotice('Ficha fechada.');});}}>Fechar competência</button>:
            <><button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.applyTimeToPayroll({employeeId,competence});onPayrollUpdated();setNotice('Rubricas de ponto integradas ao rascunho do holerite, sem duplicação.');})}>Enviar para holerite</button>
              <button className="btn btn-secondary" disabled={busy} onClick={()=>{const reason=window.prompt('Justificativa da reabertura (mín. 8 caracteres):');if(reason)void run(async()=>{await window.holerites.reopenTimeSheet({employeeId,competence,reason});await loadSheet();});}}>Reabrir</button></>}
          </div>
          <div className="table-scroll time-table"><table className="data-table"><thead><tr>
            <th>Dia</th><th>Tipo</th><th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída</th><th>Origem</th><th>Observações</th><th>Ação</th>
          </tr></thead><tbody>{days.map(day=><tr key={day.date} className={day.source==='suggested'?'time-suggested':''}>
            <td>{dayText(day.date)}</td><td><select aria-label={'Tipo '+day.date} disabled={busy||sheet.status==='closed'} value={day.kind} onChange={e=>changeDay(day.date,{kind:e.target.value as PointDay['kind']})}>
              {Object.entries(kindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
            {fields.map(field=><td key={field}><input aria-label={timeLabel[field]+' '+day.date} type="time" value={day[field]} disabled={busy||sheet.status==='closed'||day.kind!=='work'}
              onChange={e=>changeDay(day.date,{[field]:e.target.value})}/></td>)}
            <td><span className={'time-source '+day.source}>{day.source==='suggested'?'Sugestão':day.source==='imported'?'Importado':'Manual'}</span></td>
            <td><input aria-label={'Observação '+day.date} value={day.notes} maxLength={500} disabled={busy||sheet.status==='closed'} onChange={e=>changeDay(day.date,{notes:e.target.value})}/></td>
            <td>{day.source==='suggested'&&sheet.status!=='closed'&&
              <button className="btn btn-secondary time-confirm" disabled={busy} onClick={()=>{
                if(window.confirm('Confirma que os horários e a ocorrência deste dia correspondem à realidade?'))
                  changeDay(day.date,{source:'manual'});
              }}>Conferir</button>}</td>
          </tr>)}</tbody></table></div>
          {!days.length&&<p>Ficha vazia. Use “Gerar calendário sugerido” ou a importação de planilha.</p>}
          {audit.length>0&&<details className="time-audit"><summary>Histórico de alterações ({audit.length})</summary><ul>
            {audit.slice(0,30).map((row,i)=><li key={i}>{row.created_at} · {row.date||competence} · {row.action} {row.reason}</li>)}
          </ul></details>}
        </>}
      </section>}
      {view==='matrix'&&<section className="card time-sheet">
        <div className="time-actions"><h2>Matriz mensal da equipe</h2>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
            for(const e of activeEmployees)await window.holerites.autofillTimeSheet({employeeId:e.id,competence});
            await loadMatrix();setNotice('Calendários sugeridos, sem substituir dados reais.');
          })}>Criar calendários da equipe</button>
          <button className="btn btn-primary" disabled={busy||!Object.keys(matrixDrafts).length} onClick={()=>void run(saveMatrix)}>Salvar {Object.keys(matrixDrafts).length} dia(s)</button>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.exportTimeMatrix({companyId,competence,format:'xlsx'});})}>Exportar Excel</button>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.exportTimeMatrix({companyId,competence,format:'csv'});})}>Exportar CSV</button>
        </div>
        <p>Uma linha por funcionário/dia. Cole várias células do Excel nos campos de horário; linhas já fechadas ficam protegidas.</p>
        <input placeholder="Filtrar por nome ou data" aria-label="Buscar na matriz" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}/>
        <div className="table-scroll time-table"><table className="data-table"><thead><tr>
          <th>Funcionário</th><th>Data</th><th>Tipo</th><th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída</th><th>Horas reais</th><th>Observações</th>
        </tr></thead><tbody>{visibleMatrixRows.map((row,index)=>{
          const day=matrixDrafts[row.key]||row.day;
          const locked=matrix.find(s=>s.employeeId===row.employeeId)?.status==='closed';
          return <tr key={row.key} className={day.source==='suggested'?'time-suggested':''}>
            <td>{row.employeeName}</td><td>{dayText(day.date)}</td>
            <td><select disabled={busy||locked} value={day.kind} aria-label={'Tipo '+row.key}
              onChange={e=>matrixEdit(row.key,row.day,{kind:e.target.value as PointDay['kind']})}>
              {Object.entries(kindLabels).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></td>
            {fields.map((field,f)=> <td key={field}><input type="time" value={day[field]} disabled={busy||locked||day.kind!=='work'}
              aria-label={timeLabel[field]+' '+row.key} onChange={e=>matrixEdit(row.key,row.day,{[field]:e.target.value})}
              onPaste={event=>{const text=event.clipboardData.getData('text/plain');if(text.includes('\t')||text.includes('\n')){event.preventDefault();pasteMatrix(text,index,f);}}}/></td>)}
            <td>{day.kind==='work'&&day.source!=='suggested'&&day.start&&day.breakStart&&day.breakEnd&&day.end?duration(workedMinutes(day)):'—'}</td>
            <td><input value={day.notes} disabled={busy||locked} maxLength={500} aria-label={'Observações '+row.key}
              onChange={e=>matrixEdit(row.key,row.day,{notes:e.target.value})}/></td>
          </tr>;
        })}</tbody></table></div>
        <div className="time-pagination"><span>{matrixRows.length} dias · Página {page+1} de {Math.max(1,Math.ceil(matrixRows.length/100))}</span>
          <button className="btn btn-secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button>
          <button className="btn btn-secondary" disabled={(page+1)*100>=matrixRows.length} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
      </section>}
      {view==='import'&&<section className="card time-sheet">
        <h2>Importar ficha de ponto CSV / Excel</h2>
        <p>Identifique os funcionários por CPF, matrícula ou nome. Revise o mapeamento antes da gravação. Limite de 500 linhas e 10 MB por arquivo.</p>
        <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
          await window.holerites.exportTimeMatrix({companyId,competence,format:'template'});
        })}>Baixar modelo XLSX</button>
        <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{
          const choice=await window.holerites.chooseTimeFile(companyId);
          setImportChoice(choice);setMapping(choice?.suggestedMapping??{});setPreview(null);
        })}>Selecionar arquivo CSV/XLSX</button>
        {importChoice&&<>
          <p><strong>{importChoice.filename}</strong> · {importChoice.count} linhas</p>
          <div className="time-form-grid">{importFields.map(field=><label key={field.key} className="field">
            <span>{field.label}</span><select value={mapping[field.key]||''} onChange={e=>{setMapping(current=>({...current,[field.key]:e.target.value}));setPreview(null);}}>
              <option value="">Não importar</option>{importChoice.headers.map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </label>)}</div>
          <div className="time-actions">
            <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>setPreview(await window.holerites.previewTimeFile({token:importChoice.token,mapping})))}>Conferir prévia</button>
            <label><input type="checkbox" checked={allowReplace} onChange={e=>setAllowReplace(e.target.checked)}/> Substituir marcações reais existentes nas mesmas datas</label>
            <button className="btn btn-primary" disabled={busy||!preview||preview.errors.length>0||preview.accepted===0}
              onClick={()=>void run(async()=>{
                const result=await window.holerites.commitTimeFile({token:importChoice.token,mapping,allowReplace});
                setNotice(result.imported+' marcações importadas com sucesso.');
                setImportChoice(null);setPreview(null);await loadMatrix();if(employeeId)await loadSheet();
              })}>Importar {preview?.accepted||0} linhas</button>
          </div>
          {preview&&<><p>{preview.accepted} válidas · {preview.errors.length} com erro</p>
            {preview.errors.length>0&&<ul className="time-import-errors">{preview.errors.slice(0,30).map((err,i)=><li key={i}>{err}</li>)}</ul>}
            <table className="data-table"><thead><tr><th>Funcionário</th><th>Data</th><th>Tipo</th><th>Entrada</th><th>Saída</th></tr></thead>
              <tbody>{preview.samples.map((row,i)=><tr key={i}><td>{row.employee}</td><td>{row.date}</td><td>{row.kind}</td><td>{row.start}</td><td>{row.end}</td></tr>)}</tbody></table>
          </>}
        </>}
      </section>}
    </>}
    {!enabled&&<section className="card"><h3>Módulo desativado</h3>
      <p>Ative acima para cadastrar jornadas, gerar fichas, importar planilhas e integrar os valores conferidos à folha mensal. O uso de holerites não depende deste módulo.</p>
    </section>}
    <p className="time-legal">Ferramenta de administração/tratamento interno. Não substitui REP-C, REP-A, REP-P ou a escrituração oficial. Horas noturnas, reflexos e regras convencionais exigem revisão profissional.</p>
  </div>;
}
