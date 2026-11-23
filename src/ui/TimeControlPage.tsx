import {useCallback,useEffect,useMemo,useState} from 'react';
import type {Employee,PointAttachment} from '../shared/types';
import type {TimeConfig,TimeSheet,MatrixChange} from '../../electron/attendance';
import type {ImportChoice,ImportMapping,ImportPreview,ImportField} from '../../electron/time-import';
import type {PointDay,WorkSchedule} from '../shared/time';
import {defaultSchedule,previewMonth,workedMinutes,diagnosePointDays} from '../shared/time';
import {pointSourceLabel,pointRowStatus} from './time-row-display';

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
function actualHours(day:PointDay):string {
  if(day.kind!=='work'||day.source==='suggested'||!day.start||!day.breakStart||!day.breakEnd||!day.end)return '—';
  try{return duration(workedMinutes(day));}catch{return '—';}
}
const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
type View='individual'|'matrix'|'import'|'settings'|'reports';
type GenerationRequest={scope:'individual'|'team';companyId:string;competence:string;employeeId?:string};

export function TimeControlPage({companyId,competence,employees,onPayrollUpdated,initialEmployeeId=''}:{
  companyId:string;competence:string;employees:Employee[];
  initialEmployeeId?:string;onPayrollUpdated:(employeeId:string)=>void
}){
  const [config,setConfig]=useState<TimeConfig|null>(null);
  const [employeeId,setEmployeeId]=useState('');
  const [schedule,setSchedule]=useState<WorkSchedule>(defaultSchedule());
  const [sheet,setSheet]=useState<TimeSheet|null>(null);
  const [days,setDays]=useState<PointDay[]>([]);
  const [view,setView]=useState<View>('individual');
  const [matrix,setMatrix]=useState<Array<TimeSheet&{employeeName:string}>>([]);
  const [matrixDrafts,setMatrixDrafts]=useState<Record<string,PointDay>>({});
  const [selectedForPrint,setSelectedForPrint]=useState<string[]>([]);
  const [filter,setFilter]=useState('');
  const [reportFilter,setReportFilter]=useState('');
  const [page,setPage]=useState(0);
  const [importChoice,setImportChoice]=useState<ImportChoice|null>(null);
  const [mapping,setMapping]=useState<ImportMapping>({});
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [allowReplace,setAllowReplace]=useState(false);
  const [audit,setAudit]=useState<Array<{date:string|null;action:string;reason:string;created_at:string;actor_name?:string}>>([]);
  const [attachments,setAttachments]=useState<PointAttachment[]>([]);
  const [bankBalance,setBankBalance]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [generationRequest,setGenerationRequest]=useState<GenerationRequest|null>(null);
  const ready=Boolean(config);
  const activeEmployees=useMemo(()=>employees.filter(e=>e.active&&e.companyId===companyId),[employees,companyId]);

  const run=async(task:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('');
    try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    let mounted=true;
    setGenerationRequest(null);setConfig(null);setEmployeeId(employees.some(e=>e.id===initialEmployeeId&&e.companyId===companyId)?initialEmployeeId:'');setSheet(null);setDays([]);setMatrix([]);setMatrixDrafts({});
    if(companyId)window.holerites.getTimeConfig(companyId).then(c=>{if(mounted){setConfig(c);setSchedule(c.schedule);}}).catch(e=>{if(mounted)setError(String(e));});
    return ()=>{mounted=false;};
  },[companyId]);
  const loadSheet=useCallback(async()=>{
    if(!employeeId||!ready)return;
    const [result,personSchedule,history,balance,documents]=await Promise.all([
      window.holerites.getTimeSheet({employeeId,competence}),window.holerites.getTimeSchedule(employeeId),
      window.holerites.getTimeAudit({employeeId,competence}),
      window.holerites.getTimeBankBalance({employeeId,competence}),
      window.holerites.getTimeAttachments({employeeId,competence})
    ]);
    setSheet(result);setDays(result.days);setSchedule(personSchedule);setAudit(history);setBankBalance(balance);setAttachments(documents);
  },[employeeId,competence,ready]);
  const loadMatrix=useCallback(async()=>{
    if(!ready||!companyId)return;
    const result=await window.holerites.getTimeMatrix({companyId,competence});
    setMatrix(result);setMatrixDrafts({});
  },[ready,companyId,competence]);
  useEffect(()=>{let active=true;if(!employeeId||!ready){setSheet(null);setDays([]);return;}
    loadSheet().catch(e=>{if(active)setError(String(e));});return()=>{active=false;};
  },[loadSheet,employeeId,ready]);
  useEffect(()=>{if((view==='matrix'||view==='reports')&&ready)loadMatrix().catch(e=>setError(String(e)));},[view,loadMatrix,ready]);
  const changeDay=(date:string,patch:Partial<PointDay>)=>{
    setDays(rows=>rows.map(day=>{
      if(day.date!==date)return day;
      const editedPunch=Object.keys(patch).some(key=>['kind','start','breakStart','breakEnd','end'].includes(key));
      return {...day,...patch,source:editedPunch?'manual':day.source,
        ...(patch.kind&&patch.kind!=='work'?{start:'',breakStart:'',breakEnd:'',end:''}:{})};
    }));
  };
  const selected=activeEmployees.find(e=>e.id===employeeId);
  const sheetIssues=useMemo(()=>diagnosePointDays(days,schedule,competence),[days,schedule,competence]);
  const matrixIssues=useMemo(()=>matrix.flatMap(s=>s.issues.map(issue=>({...issue,employeeId:s.employeeId,employeeName:s.employeeName}))),[matrix]);
  const matrixIssueKeys=useMemo(()=>new Set(matrixIssues.map(issue=>issue.employeeId+'|'+issue.date)),[matrixIssues]);
  const matrixSummary=useMemo(()=>({total:matrix.length,closed:matrix.filter(s=>s.status==='closed').length,suggested:matrix.reduce((sum,s)=>sum+s.days.filter(d=>d.source==='suggested').length,0)}),[matrix]);
  const reportRows=useMemo(()=>matrix.filter(s=>{
    const employee=activeEmployees.find(e=>e.id===s.employeeId);
    return [s.employeeName,employee?.sector,employee?.jobSite,employee?.costCenter].some(value=>(value||'').toLowerCase().includes(reportFilter.toLowerCase()));
  }),[matrix,activeEmployees,reportFilter]);
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
    setConfig(configSaved);setNotice('Parâmetros de jornada salvos para esta empresa.');
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
      const editedPunch=Object.keys(patch).some(field=>['kind','start','breakStart','breakEnd','end'].includes(field));
      return {...all,[key]:{...current,...patch,source:editedPunch?'manual':current.source,
        ...(patch.kind&&patch.kind!=='work'?{start:'',breakStart:'',breakEnd:'',end:''}:{})}};
    });
  };
  const pasteMatrix=(text:string,position:number,startColumn:number)=>{
    const cells=text.replace(/\r/g,'').trimEnd().split('\n').map(line=>line.split('\t'));
    const editable:Array<keyof PointDay|null>=['start','breakStart','breakEnd','end',null,'notes'];
    if(cells.length===1&&cells[0].length===1)return;
    const next={...matrixDrafts};
    cells.forEach((line,rowIndex)=>{
      const row=visibleMatrixRows[position+rowIndex];
      if(!row||matrix.find(s=>s.employeeId===row.employeeId)?.status==='closed')return;
      const current=next[row.key]||row.day;
      const state={...current};
      line.forEach((value,columnIndex)=>{
        const key=editable[startColumn+columnIndex];
        if(key){Object.assign(state,{[key]:value});if(key!=='notes')state.source='manual';}
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
  const generateFromDialog=async(includeInCalculation:boolean)=>{
    const request=generationRequest;
    if(!request)return;
    setGenerationRequest(null);
    if(request.companyId!==companyId||request.competence!==competence)return;
    await run(async()=>{
      if(request.scope==='individual'){
        if(!request.employeeId||request.employeeId!==employeeId)throw new Error('Funcionário alterado. Abra a ficha novamente.');
        await saveDays();
        await window.holerites.autofillTimeSheet({employeeId:request.employeeId,competence:request.competence});
        if(includeInCalculation){
          const reviewed=await window.holerites.reviewTimeSuggestions({employeeIds:[request.employeeId],competence:request.competence});
          await loadSheet();
          setNotice(reviewed.reviewed
            ?reviewed.reviewed+' dias gerados/conferidos incluídos imediatamente na apuração.'
            :'Nenhum horário sugerido pendente de inclusão na apuração.');
        }else{
          await loadSheet();
          setNotice('Calendário gerado sem inclusão na apuração. Use a conferência em lote quando desejar.');
        }
        return;
      }
      await saveMatrix();
      const editable=matrix.filter(s=>s.status==='draft').map(s=>s.employeeId);
      if(!editable.length)throw new Error('Não há funcionários com ficha editável nesta competência.');
      for(const id of editable)await window.holerites.autofillTimeSheet({employeeId:id,competence:request.competence});
      if(includeInCalculation){
        const reviewed=await window.holerites.reviewTimeSuggestions({employeeIds:editable,competence:request.competence});
        setNotice(reviewed.reviewed
          ?reviewed.reviewed+' dias de '+reviewed.employees+' funcionário(s) incluídos imediatamente na apuração.'
          :'Nenhum horário sugerido pendente de inclusão na apuração.');
      }else{
        setNotice('Calendários da equipe gerados sem inclusão na apuração.');
      }
      await loadMatrix();
      if(employeeId)await loadSheet();
    });
  };
  const saveSchedule=async()=>{
    if(employeeId){
      setSchedule(await window.holerites.setTimeSchedule({employeeId,schedule}));
      setNotice('Jornada personalizada do funcionário salva.');
    }else if(config)await configure({...config,schedule});
  };
  return <div className="time-page point-workspace">
    <section className="card time-settings-bar">
      <div>
        <h2>Controle de ponto <small>início da folha mensal</small></h2>
        <p>Preencha ou importe os horários, revise o mês inteiro e imprima as fichas para assinatura física. A conferência orienta e não bloqueia a emissão do holerite.</p>
        <ol className="time-steps" aria-label="Fluxo mensal">
          <li>1. Jornada</li><li>2. Preenchimento</li><li>3. Conferência em lote</li><li>4. Impressão e assinatura</li><li>5. Holerite</li>
        </ol>
      </div>
    </section>
    {error&&<div className="error-banner" role="alert">{error}<button aria-label="Fechar erro" onClick={()=>setError('')}>×</button></div>}
    {notice&&<div className="success-banner" role="status">{notice}</div>}
    {ready&&<>
      <div className="time-toolbar" role="tablist" aria-label="Áreas do controle de ponto">
        {([['individual','Ficha individual'],['matrix','Matriz da equipe'],['import','Importar planilha'],['reports','Relatórios'],['settings','Configurações']] as [View,string][]).map(([v,label])=>
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

          <label className="field"><span>Extra em domingos (%)</span><input type="number" min="0" max="300" value={config.schedule.sundayOvertimePercent??config.schedule.overtimePercent}
            onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,sundayOvertimePercent:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Extra em feriados (%)</span><input type="number" min="0" max="300" value={config.schedule.holidayOvertimePercent??config.schedule.overtimePercent}
            onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,holidayOvertimePercent:Number(e.target.value)}}:old)}/></label>
          <label className="field"><span>Escala</span><select value={config.schedule.cycle?'cycle':'weekly'} onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,cycle:e.target.value==='cycle'?(old.schedule.cycle??{workDays:1,restDays:1,anchorDate:competence+'-01'}):undefined}}:old)}>
            <option value="weekly">Semanal por dias</option><option value="cycle">Ciclo rotativo (12x36 / 6x1 / 5x1)</option>
          </select></label>
          {config.schedule.cycle&&<>
            <label className="field"><span>Dias de trabalho no ciclo</span><input type="number" min="1" max="30" value={config.schedule.cycle.workDays} onChange={e=>setConfig(old=>old&&old.schedule.cycle?{...old,schedule:{...old.schedule,cycle:{...old.schedule.cycle,workDays:Number(e.target.value)}}}:old)}/></label>
            <label className="field"><span>Dias de folga no ciclo</span><input type="number" min="1" max="30" value={config.schedule.cycle.restDays} onChange={e=>setConfig(old=>old&&old.schedule.cycle?{...old,schedule:{...old.schedule,cycle:{...old.schedule.cycle,restDays:Number(e.target.value)}}}:old)}/></label>
            <label className="field"><span>Primeiro dia de trabalho do ciclo</span><input type="date" value={config.schedule.cycle.anchorDate} onChange={e=>setConfig(old=>old&&old.schedule.cycle?{...old,schedule:{...old.schedule,cycle:{...old.schedule.cycle,anchorDate:e.target.value}}}:old)}/></label>
          </>}
          <label className="field"><span>Feriados estaduais/municipais (AAAA-MM-DD separados por vírgula)</span><input placeholder="2026-07-09, 2026-12-08" value={(config.schedule.holidayDates??[]).join(', ')} onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,holidayDates:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}}:old)}/></label>
          <label className="field"><span>Redução da hora noturna</span><select value={config.schedule.nightHourReduction?'yes':'no'} onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,nightHourReduction:e.target.value==='yes'}}:old)}><option value="no">Desativada (histórico)</option><option value="yes">52min30s (configurável por empresa)</option></select></label>
          <label className="field"><span>DSR estimado sobre extras</span><select value={config.schedule.dsrOnOvertime?'yes':'no'} onChange={e=>setConfig(old=>old?{...old,schedule:{...old.schedule,dsrOnOvertime:e.target.value==='yes'}}:old)}><option value="no">Desativado</option><option value="yes">Ativado (requer revisão do DP)</option></select></label>
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
        {!employeeId?<p>Selecione um funcionário para preencher ou importar a jornada, conferir e fechar a ficha. O holerite é gerado depois.</p>:sheet&&<>
          <div className="time-status"><span>{selected?.name} · {sheet.status==='closed'?'Fechada':'Rascunho'}</span>
            <small>Trabalhadas {duration(sheet.summary.workedMinutes)} | Extras {duration(sheet.summary.overtimeMinutes)} | Déficit {duration(sheet.summary.deficitMinutes)} | Noturnas {duration(sheet.summary.nightMinutes)} | Saldo banco {bankBalance<0?'-':'+'}{duration(bankBalance)}</small></div>
          {sheetIssues.length>0&&<details className="time-audit"><summary>Conferências recomendadas: {sheetIssues.length} aviso(s), sem impedimento</summary><ul>{sheetIssues.slice(0,35).map((issue,i)=><li key={i}>{dayText(issue.date)} · {issue.message}</li>)}</ul></details>}
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
            <button className="btn btn-secondary" disabled={busy||sheet.status==='closed'}
              onClick={()=>setGenerationRequest({scope:'individual',companyId,competence,employeeId})}>Gerar calendário sugerido</button>
            <button className="btn btn-primary" disabled={busy||sheet.status==='closed'||!days.some(day=>day.source==='suggested')}
              onClick={()=>void run(async()=>{
                await saveDays();
                const result=await window.holerites.reviewTimeSuggestions({employeeIds:[employeeId],competence});
                await loadSheet();
                setNotice(result.reviewed+' dias conferidos em lote; a origem gerada permanece registrada.');
              })}>Conferir mês em lote</button>
            <button className="btn btn-primary" disabled={busy||sheet.status==='closed'||!changedDays.length} onClick={()=>void run(saveDays)}>Salvar {changedDays.length} alteração(ões)</button>
            <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await saveDays();await window.holerites.exportTimePDF({employeeId,competence});})}>PDF</button>
            <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await saveDays();await window.holerites.printTimeSheet({employeeId,competence});})}>Imprimir</button>
            {sheet.status==='draft'?<button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await saveDays();await window.holerites.closeTimeSheet({employeeId,competence});await loadSheet();setNotice('Ficha fechada.');})}>Fechar competência</button>:
              <button className="btn btn-secondary" disabled={busy} onClick={()=>{const reason=window.prompt('Justificativa da reabertura (mín. 8 caracteres):');if(reason)void run(async()=>{await window.holerites.reopenTimeSheet({employeeId,competence,reason});await loadSheet();});}}>Reabrir</button>}
            <button className="btn btn-primary" disabled={busy} onClick={()=>void run(async()=>{await saveDays();await window.holerites.applyTimeToPayroll({employeeId,competence});onPayrollUpdated(employeeId);})}>Gerar holerite do ponto</button>
          </div>
          <div className="table-scroll time-table"><table className="data-table"><thead><tr>
            <th>Dia</th><th>Tipo</th><th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída</th><th>Origem</th><th>Observações</th><th>Documentos</th>
          </tr></thead><tbody>{days.map(day=><tr key={day.date} className={day.source==='suggested'?'time-suggested':''}>
            <td>{dayText(day.date)}</td><td><select aria-label={'Tipo '+day.date} disabled={busy||sheet.status==='closed'} value={day.kind} onChange={e=>changeDay(day.date,{kind:e.target.value as PointDay['kind']})}>
              {Object.entries(kindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
            {fields.map(field=><td key={field}><input aria-label={timeLabel[field]+' '+day.date} type="time" value={day[field]} disabled={busy||sheet.status==='closed'||day.kind!=='work'}
              onChange={e=>changeDay(day.date,{[field]:e.target.value})}/></td>)}
            <td><span className={'time-source '+day.source}>{day.source==='suggested'?'Sugestão':day.source==='reviewed'?'Gerado · conferido':day.source==='imported'?'Importado':'Manual'}</span></td>
            <td><input aria-label={'Observação '+day.date} value={day.notes} maxLength={500} disabled={busy||sheet.status==='closed'} onChange={e=>changeDay(day.date,{notes:e.target.value})}/></td>
            <td><div className="time-actions">
              <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{
                const item=await window.holerites.addTimeAttachment({employeeId,date:day.date});
                if(item)setAttachments(await window.holerites.getTimeAttachments({employeeId,competence}));
              })}>Anexar</button>
              {attachments.filter(item=>item.date===day.date).map(item=><span key={item.id}>
                <button className="btn btn-ghost" title={'Salvar '+item.filename} disabled={busy} onClick={()=>void run(async()=>{await window.holerites.saveTimeAttachment({employeeId,id:item.id});})}>{item.filename}</button>
                <button className="btn btn-ghost" title={'Remover '+item.filename} disabled={busy} onClick={()=>{
                  if(window.confirm('Remover o anexo '+item.filename+'?'))void run(async()=>{await window.holerites.removeTimeAttachment({employeeId,id:item.id});setAttachments(await window.holerites.getTimeAttachments({employeeId,competence}));});
                }}>×</button>
              </span>)}
            </div></td>
          </tr>)}</tbody></table></div>
          {!days.length&&<p>Ficha vazia. Use “Gerar calendário sugerido” ou a importação de planilha.</p>}
          {audit.length>0&&<details className="time-audit"><summary>Histórico de alterações ({audit.length})</summary><ul>
            {audit.slice(0,30).map((row,i)=><li key={i}>{row.created_at} · {row.actor_name||'Operador legado'} · {row.date||competence} · {row.action} {row.reason}</li>)}
          </ul></details>}
        </>}
      </section>}
      {view==='matrix'&&<section className="card time-sheet time-matrix-workspace">
        <div className="time-matrix-heading">
          <div><div className="atlas-overline">REGISTROS DA COMPETÊNCIA</div><h2>Matriz mensal da equipe</h2>
            <p>Uma linha por colaborador e dia, com edição direta e conferência em lote.</p></div>
          <div className="time-matrix-summary" aria-label="Resumo da matriz carregada">
            <div><strong>{matrixSummary.total}</strong><span>Fichas carregadas</span></div>
            <div><strong>{matrixSummary.closed}</strong><span>Fichas fechadas</span></div>
            <div><strong>{matrixIssues.length}</strong><span>Avisos para revisar</span></div>
            <div><strong>{Object.keys(matrixDrafts).length}</strong><span>Dias alterados</span></div>
          </div>
        </div>
        <div className="time-actions time-matrix-actions">
          <button className="btn btn-secondary" disabled={busy||!matrix.some(s=>s.status==='draft')}
            onClick={()=>setGenerationRequest({scope:'team',companyId,competence})}>Criar calendários da equipe</button>
          <button className="btn btn-primary" disabled={busy||!Object.keys(matrixDrafts).length} onClick={()=>void run(saveMatrix)}>Salvar {Object.keys(matrixDrafts).length} dia(s)</button>
          <button className="btn btn-primary" disabled={busy||!matrix.some(s=>s.status==='draft'&&s.days.some(day=>day.source==='suggested'))}
            onClick={()=>void run(async()=>{
              await saveMatrix();
              const ids=matrix.filter(s=>s.status==='draft').map(s=>s.employeeId);
              const result=await window.holerites.reviewTimeSuggestions({employeeIds:ids,competence});
              await loadMatrix();if(employeeId)await loadSheet();
              setNotice(result.reviewed+' dias de '+result.employees+' funcionário(s) conferidos em lote.');
            })}>Conferir equipe em lote</button>

          <button className="btn btn-secondary" disabled={busy||!matrix.length} onClick={()=>void run(async()=>{await saveMatrix();await window.holerites.exportTimeBatchPDF({companyId,competence,employeeIds:selectedForPrint});})}>PDF fichas em lote</button>
          <button className="btn btn-secondary" disabled={busy||!matrix.length} onClick={()=>void run(async()=>{await saveMatrix();await window.holerites.printTimeBatch({companyId,competence,employeeIds:selectedForPrint});})}>Imprimir equipe</button>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.exportTimeMatrix({companyId,competence,format:'xlsx'});})}>Exportar Excel</button>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>void run(async()=>{await window.holerites.exportTimeMatrix({companyId,competence,format:'csv'});})}>Exportar CSV</button>
        </div>

        <p>Uma linha por funcionário/dia. Cole do Excel, salve ajustes e confira em lote as sugestões geradas para a equipe. A assinatura será feita no documento impresso.</p>
        <details className="time-audit"><summary>Selecionar funcionários para impressão (nenhum selecionado = todos)</summary>
          <div className="time-weekdays">{matrix.map(s=><label key={s.employeeId}><input type="checkbox" checked={selectedForPrint.includes(s.employeeId)}
            onChange={e=>setSelectedForPrint(current=>e.target.checked?[...current,s.employeeId]:current.filter(id=>id!==s.employeeId))}/>{s.employeeName}</label>)}</div>
        </details>
        {matrixIssues.length>0&&<details className="time-audit"><summary>Conferência da equipe: {matrixIssues.length} aviso(s), sem bloquear a apuração</summary><ul>{matrixIssues.slice(0,70).map((issue,i)=><li key={i}>{issue.employeeName} · {dayText(issue.date)} · {issue.message}</li>)}</ul></details>}
        <div className="time-matrix-search">
          <label htmlFor="time-matrix-filter">Buscar nos registros</label>
          <input id="time-matrix-filter" placeholder="Funcionário ou data" aria-label="Buscar na matriz" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}/>
          <span>{matrixRows.length} registro(s) nesta seleção · {matrixSummary.suggested} sugestão(ões) pendentes na equipe</span>
        </div>
        <div className="table-scroll time-table"><table className="data-table"><thead><tr>
          <th>Funcionário</th><th>Data</th><th>Tipo</th><th>Entrada</th><th>Saída almoço</th><th>Retorno</th><th>Saída</th><th>Horas reais</th><th>Observações</th><th>Origem</th><th>Conferência</th>
        </tr></thead><tbody>{visibleMatrixRows.map((row,index)=>{
          const day=matrixDrafts[row.key]||row.day;
          const locked=matrix.find(s=>s.employeeId===row.employeeId)?.status==='closed';
          const rowHasIssues=matrixIssueKeys.has(row.key);
          const visualStatus=pointRowStatus(day.source,rowHasIssues);
          return <tr key={row.key} className={[day.source==='suggested'?'time-suggested':'',rowHasIssues?'time-row-issue':''].filter(Boolean).join(' ')}>
            <td>{row.employeeName}</td><td>{dayText(day.date)}</td>
            <td><select disabled={busy||locked} value={day.kind} aria-label={'Tipo '+row.key}
              onChange={e=>matrixEdit(row.key,row.day,{kind:e.target.value as PointDay['kind']})}>
              {Object.entries(kindLabels).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></td>
            {fields.map((field,f)=> <td key={field}><input type="time" value={day[field]} disabled={busy||locked||day.kind!=='work'}
              aria-label={timeLabel[field]+' '+row.key} onChange={e=>matrixEdit(row.key,row.day,{[field]:e.target.value})}
              onPaste={event=>{const text=event.clipboardData.getData('text/plain');if(text.includes('\t')||text.includes('\n')){event.preventDefault();pasteMatrix(text,index,f);}}}/></td>)}
            <td>{actualHours(day)}</td>
            <td><input value={day.notes} disabled={busy||locked} maxLength={500} aria-label={'Observações '+row.key}
              onChange={e=>matrixEdit(row.key,row.day,{notes:e.target.value})}/></td>
            <td><span className={'time-origin time-origin-'+day.source}>{pointSourceLabel(day.source)}</span></td>
            <td><span className={'time-state time-state-'+visualStatus.tone}>{visualStatus.label}</span></td>
          </tr>;
        })}</tbody></table></div>
        <div className="time-pagination"><span>{matrixRows.length} dias · Página {page+1} de {Math.max(1,Math.ceil(matrixRows.length/100))}</span>
          <button className="btn btn-secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button>
          <button className="btn btn-secondary" disabled={(page+1)*100>=matrixRows.length} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
      </section>}

      {view==='reports'&&<section className="card time-sheet">
        <div className="time-actions"><h2>Relatórios de ponto e indicadores</h2>
          <button className="btn btn-secondary" disabled={busy||!matrix.length} onClick={()=>void run(async()=>{await window.holerites.exportTimeReport({companyId,competence});})}>Exportar indicadores CSV</button>
        </div>
        <p>Indicadores calculados a partir das fichas salvas. Horários apenas sugeridos não entram na apuração; avisos não bloqueiam o trabalho.</p>
        <input value={reportFilter} onChange={e=>setReportFilter(e.target.value)} aria-label="Filtrar relatórios" placeholder="Filtrar por funcionário, obra, setor ou centro de custo"/>
        <div className="time-status"><span>{reportRows.length} funcionário(s) · {reportRows.reduce((v,s)=>v+s.summary.absences,0)} falta(s) · {matrixIssues.length} aviso(s)</span>
          <small>Trabalhadas {duration(reportRows.reduce((v,s)=>v+s.summary.workedMinutes,0))} | Extras {duration(reportRows.reduce((v,s)=>v+s.summary.overtimeMinutes,0))} | Atrasos {duration(reportRows.reduce((v,s)=>v+s.summary.lateMinutes,0))}</small></div>
        <div className="table-scroll time-table"><table className="data-table"><thead><tr><th>Funcionário</th><th>Setor</th><th>Obra</th><th>Centro de custo</th><th>Trabalhadas</th><th>Extras</th><th>Noturnas</th><th>Atrasos</th><th>Faltas</th><th>Status</th></tr></thead>
          <tbody>{reportRows.map(s=>{const employee=activeEmployees.find(e=>e.id===s.employeeId);return <tr key={s.employeeId}><td>{s.employeeName}</td><td>{employee?.sector||'—'}</td><td>{employee?.jobSite||'—'}</td><td>{employee?.costCenter||'—'}</td><td>{duration(s.summary.workedMinutes)}</td><td>{duration(s.summary.overtimeMinutes)}</td><td>{duration(s.summary.nightMinutes)}</td><td>{duration(s.summary.lateMinutes)}</td><td>{s.summary.absences}</td><td>{s.status==='closed'?'Fechado':'Aberto'}</td></tr>;})}</tbody>
        </table></div>
      </section>}
      {view==='import'&&<section className="card time-sheet">
        <h2>Importar ficha de ponto CSV / Excel</h2>
        <p>Identifique os funcionários por CPF, matrícula ou nome. Revise o mapeamento antes da gravação. Até 30.000 linhas e 30 MB por arquivo. O mapeamento é reutilizado automaticamente para planilhas com as mesmas colunas.</p>
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
    {!ready&&<section className="card"><h3>Preparando controle de ponto</h3>
      <p>Carregando a configuração de jornada da empresa...</p>
    </section>}
    <p className="time-legal">Ferramenta de administração/tratamento interno. Não substitui REP-C, REP-A, REP-P ou a escrituração oficial. Horas noturnas, reflexos e regras convencionais exigem revisão profissional.</p>
    {generationRequest&&<div className="modal-backdrop" role="presentation"
      onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setGenerationRequest(null);}}>
      <div className="modal time-generation-modal" role="dialog" aria-modal="true"
        aria-labelledby="time-generation-title" aria-describedby="time-generation-description"
        onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();setGenerationRequest(null);}}}>
        <div className="modal-heading"><div>
          <div className="eyebrow">PREENCHIMENTO DE PONTO</div>
          <h2 id="time-generation-title">Incluir horários gerados na apuração?</h2>
        </div><button type="button" className="icon-btn" disabled={busy}
          onClick={()=>setGenerationRequest(null)} aria-label="Fechar diálogo">×</button></div>
        <p id="time-generation-description">
          {generationRequest.scope==='team'
            ?'Os calendários serão gerados para os funcionários com fichas abertas nesta competência.'
            :'O calendário mensal será gerado para este funcionário.'}
          {' '}Escolha se deseja incluir agora os horários sugeridos nos cálculos de horas e da folha.
        </p>
        <div className="time-generation-explain">
          <strong>Ao incluir na apuração</strong>
          <span>Os horários gerados serão identificados como conferidos administrativamente e passarão a compor os cálculos. Horários manuais e importados serão preservados.</span>
          <strong>Ao gerar sem incluir</strong>
          <span>Os horários continuarão como sugestões, disponíveis para edição e conferência em lote posteriormente.</span>
        </div>
        <p className="time-legal">A confirmação não substitui o registro real de jornada nem a assinatura do funcionário após a impressão da ficha.</p>
        <div className="form-actions time-generation-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>setGenerationRequest(null)}>Cancelar</button>
          <button type="button" className="btn btn-secondary" autoFocus disabled={busy}
            onClick={()=>void generateFromDialog(false)}>Gerar sem incluir</button>
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={()=>void generateFromDialog(true)}>Gerar e incluir na apuração</button>
        </div>
      </div>
    </div>}
  </div>;
}
