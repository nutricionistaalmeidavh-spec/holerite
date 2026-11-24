import {parentPort,workerData} from 'node:worker_threads';
import {createDatabaseService} from './db-service';
const port=parentPort;
if(!port)throw new Error('Worker de banco sem canal.');
const service=createDatabaseService(String(workerData.path));
let queue=Promise.resolve();
port.on('message',(message:{id:number;method:string;arg:unknown})=>{
  queue=queue.then(async()=>{
    try{
      const value=message.method==='close'?service.close():await service.run(message.method,message.arg);
      port.postMessage({id:message.id,ok:true,value});
      if(message.method==='close')port.close();
    }catch(error){port.postMessage({id:message.id,ok:false,error:error instanceof Error?error.message:String(error)});}
  });
});
port.postMessage({ready:true});
