import {useEffect,useState} from 'react';
import type {AuthState,LocalOperator,LocalRole} from '../../electron/access-control';

export function LocalAccessPanel({auth,onChange,onClose,required=false}:{
  auth:AuthState;onChange:()=>Promise<void>;onClose:()=>void;required?:boolean;
}) {
  const [name,setName]=useState('');
  const [pin,setPin]=useState('');
  const [role,setRole]=useState<LocalRole>('hr');
  const [users,setUsers]=useState<LocalOperator[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const isAdmin=auth.operator?.role==='admin';
  useEffect(()=>{
    if(isAdmin)window.holerites.getLocalOperators().then(setUsers).catch(e=>setError(String(e)));
  },[isAdmin]);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    setError('');setBusy(true);
    try{
      if(!auth.configured)await window.holerites.setupLocalAccess({name,pin});
      else if(!auth.operator)await window.holerites.loginLocal({name,pin});
      else if(isAdmin){await window.holerites.addLocalOperator({name,pin,role});setUsers(await window.holerites.getLocalOperators());}
      setName('');setPin('');await onChange();
      if(!auth.operator)onClose();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const logout=async()=>{
    setError('');setBusy(true);
    try{await window.holerites.logoutLocal();await onChange();onClose();}
    catch(e){setError(String(e));}
    finally{setBusy(false);}
  };
  return <div className="modal-backdrop" role="presentation">
    <section className="modal" role="dialog" aria-modal="true" aria-label="Perfis e acesso local" style={{maxWidth:560}}>
      <div className="modal-heading"><div><div className="eyebrow">ACESSO LOCAL / SEM INTERNET</div>
        <h2>{!auth.configured?'Ativar perfis de acesso':!auth.operator?'Entrar no sistema':'Gerenciar operadores'}</h2></div>
        {!required&&<button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">×</button>}</div>
      {!auth.configured&&<p>A ativação é opcional e não remove os dados existentes. Depois de criar o responsável, o PIN será exigido na abertura do aplicativo. Guarde o PIN: não há recuperação por e-mail ou serviço externo.</p>}
      {auth.operator&&<p>Operador conectado: <strong>{auth.operator.name}</strong> · {auth.operator.role==='admin'?'Administrador':auth.operator.role==='hr'?'RH':'Consulta (somente leitura)'}</p>}
      {error&&<div className="error-banner" role="alert">{error}</div>}
      {(!auth.operator||isAdmin)&&<form className="form-grid" onSubmit={e=>void submit(e)}>
        <label className="field"><span>{!auth.configured?'Nome do responsável':auth.operator?'Nome do novo operador':'Nome do operador'}</span>
          <input required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} autoFocus/></label>
        <label className="field"><span>PIN local (6 a 16 dígitos)</span>
          <input required type="password" inputMode="numeric" pattern="[0-9]{6,16}" autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)}/></label>
        {isAdmin&&<label className="field"><span>Permissões do novo usuário</span>
          <select value={role} onChange={e=>setRole(e.target.value as LocalRole)}>
            <option value="hr">RH — gerenciar ponto e folha</option><option value="viewer">Consulta — visualizar e exportar</option>
            <option value="admin">Administrador — gerenciar usuários</option>
          </select></label>}
        <div className="form-actions"><button className="btn btn-primary" disabled={busy} type="submit">
          {!auth.configured?'Criar administrador e ativar':auth.operator?'Adicionar operador':'Entrar'}</button>
          {!required&&<button className="btn btn-secondary" disabled={busy} type="button" onClick={onClose}>Fechar</button>}</div>
      </form>}
      {isAdmin&&<div className="time-audit"><h3>Usuários locais</h3><ul>{users.map(user=><li key={user.id}>{user.name} — {user.role==='admin'?'Administrador':user.role==='hr'?'RH':'Consulta'}</li>)}</ul></div>}
      {auth.operator&&<div className="form-actions"><button className="btn btn-secondary" disabled={busy} type="button" onClick={()=>void logout()}>Sair deste operador</button></div>}
    </section>
  </div>;
}
