import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

export type LocalRole='admin'|'hr'|'viewer';
export interface LocalOperator {id:string;name:string;role:LocalRole;}
export interface AuthState {configured:boolean;operator:LocalOperator|null;}
type Row=Record<string,unknown>;
const READ_ONLY=new Set([
  'snapshot','workspace','payroll-page','time-overview','time-config','time-schedule','time-sheet','time-matrix','time-matrix-page','time-audit',
  'time-import-history','time-audit-page','time-import-page','time-bank-balance','time-attachment-list','time-attachment-save',
  'time-export-matrix','time-export-pdf','time-export-batch-pdf','time-export-report',
  'time-print','time-print-batch','export-pdf','print','export-csv','export-backup'
]);
const hashPin=(pin:string,salt:string)=>scryptSync(pin,salt,64).toString('hex');
function validName(value:string){
  if(typeof value!=='string'||value.trim().length<2||value.trim().length>80)throw new Error('Nome do operador deve ter entre 2 e 80 caracteres.');
  return value.trim();
}
function validPin(pin:string){
  if(typeof pin!=='string'||!/^[0-9]{6,16}$/.test(pin))throw new Error('PIN deve conter de 6 a 16 dígitos numéricos.');
  return pin;
}
export class LocalAccess {
  private operator:LocalOperator|null=null;
  private failures=0;
  private lockedUntil=0;
  constructor(private db:DatabaseSync){
    this.db.exec(`CREATE TABLE IF NOT EXISTS time_operators(
      id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin','hr','viewer')),
      pin_salt TEXT NOT NULL,pin_hash TEXT NOT NULL,created_at TEXT NOT NULL
    );`);
  }
  state():AuthState {
    const count=this.db.prepare('SELECT COUNT(*) AS n FROM time_operators').get() as Row;
    return {configured:Number(count.n)>0,operator:this.operator?{...this.operator}:null};
  }
  private create(name:string,pin:string,role:LocalRole):LocalOperator {
    name=validName(name);validPin(pin);
    if(!['admin','hr','viewer'].includes(role))throw new Error('Perfil inválido.');
    const id=randomUUID(),salt=randomBytes(16).toString('hex');
    this.db.prepare('INSERT INTO time_operators(id,name,role,pin_salt,pin_hash,created_at) VALUES(?,?,?,?,?,?)')
      .run(id,name,role,salt,hashPin(pin,salt),new Date().toISOString());
    return {id,name,role};
  }
  setup(name:string,pin:string):LocalOperator {
    if(this.state().configured)throw new Error('Perfil administrador já configurado.');
    this.operator=this.create(name,pin,'admin');
    return {...this.operator};
  }
  login(name:string,pin:string):LocalOperator {
    if(!this.state().configured)throw new Error('Perfis locais não foram configurados.');
    if(Date.now()<this.lockedUntil)throw new Error('Muitas tentativas. Tente novamente após o período de bloqueio.');
    const row=this.db.prepare('SELECT * FROM time_operators WHERE name=? COLLATE NOCASE').get(String(name||'').trim()) as Row|undefined;
    const correct=typeof pin==='string'&&row&&/^[0-9]{6,16}$/.test(pin) &&
      timingSafeEqual(Buffer.from(hashPin(pin,String(row.pin_salt)),'hex'),Buffer.from(String(row.pin_hash),'hex'));
    if(!correct){
      this.failures++;
      if(this.failures>=5){this.lockedUntil=Date.now()+30_000;this.failures=0;}
      throw new Error('Credenciais inválidas.');
    }
    this.failures=0;this.lockedUntil=0;
    this.operator={id:String(row.id),name:String(row.name),role:String(row.role) as LocalRole};
    return {...this.operator};
  }
  logout(){this.operator=null;}
  requireAccess(method:string):void {
    if(!this.state().configured)return; // Migração: sistemas antigos continuam abertos até ativação explícita.
    if(!this.operator)throw new Error('Autenticação local obrigatória.');
    if(this.operator.role==='viewer'&&!READ_ONLY.has(method))throw new Error('Sem permissão para alterar dados.');
  }
  listUsers():LocalOperator[] {
    if(!this.operator||this.operator.role!=='admin')throw new Error('Sem permissão para administrar usuários.');
    return (this.db.prepare('SELECT id,name,role FROM time_operators ORDER BY name').all() as Row[])
      .map(row=>({id:String(row.id),name:String(row.name),role:String(row.role) as LocalRole}));
  }
  addUser(name:string,pin:string,role:LocalRole):LocalOperator {
    if(!this.operator||this.operator.role!=='admin')throw new Error('Sem permissão para administrar usuários.');
    return this.create(name,pin,role);
  }
}
