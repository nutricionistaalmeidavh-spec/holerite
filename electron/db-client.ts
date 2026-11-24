import {Worker} from 'node:worker_threads';
type Pending={resolve:(value:any)=>void;reject:(error:Error)=>void};
export class DatabaseClient {
  private worker:Worker;
  private pending=new Map<number,Pending>();
  private sequence=0;
  private failed:Error|null=null;
  private closing=false;
  readonly ready:Promise<void>;
  constructor(workerPath:string,path:string){
    this.worker=new Worker(workerPath,{workerData:{path}});
    let resolveReady!:()=>void,rejectReady!:(error:Error)=>void;
    this.ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const fail=(error:Error)=>{
      this.failed=error;rejectReady(error);
      for(const p of this.pending.values())p.reject(error);
      this.pending.clear();
    };
    this.worker.on('message',message=>{
      if(message.ready){resolveReady();return;}
      const p=this.pending.get(message.id);if(!p)return;
      this.pending.delete(message.id);
      if(message.ok)p.resolve(message.value);else p.reject(new Error(message.error));
    });
    this.worker.on('error',fail);
    this.worker.on('exit',code=>{if(!this.closing||this.pending.size)fail(new Error('Processamento do banco encerrado ('+code+').'));});
  }
  async call<T=unknown>(method:string,arg?:unknown):Promise<T>{
    await this.ready;
    if(this.failed)throw this.failed;
    if(this.closing&&method!=='close')throw new Error('Banco está encerrando.');
    return new Promise<T>((resolve,reject)=>{
      const id=++this.sequence;this.pending.set(id,{resolve,reject});
      try{this.worker.postMessage({id,method,arg});}catch(e){this.pending.delete(id);reject(e);}
    });
  }
  async close():Promise<void>{
    if(this.closing)return;this.closing=true;
    try{await this.call('close');}finally{await this.worker.terminate();}
  }
}
