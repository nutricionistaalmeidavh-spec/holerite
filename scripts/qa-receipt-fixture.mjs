import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {receiptHTML} from '../electron/receipt.ts';
import {calculatePayroll} from '../src/shared/payroll.ts';
const filename=process.argv[2],scenario=process.argv[3]||'compact';
if(!filename)throw new Error('Usage: qa-receipt-fixture <html file> <compact|extended>');
const extra=[
 {id:'adicional',code:'ADIC',description:'Adicional de Tempo de Serviço',kind:'earning',amountCents:12000,inssBase:true,irBase:true,fgtsBase:true},
 {id:'extra',code:'HE50',description:'Horas Extras 50%',kind:'earning',amountCents:37500,inssBase:true,irBase:true,fgtsBase:true},
 {id:'vt',code:'VT',description:'Vale-Transporte',kind:'deduction',amountCents:24000,inssBase:false,irBase:false,fgtsBase:false}
];
const long=Array.from({length:12},(_,i)=>({id:'l'+i,code:'C'+i,description:'Verba de conferência '+String(i+1).padStart(2,'0'),kind:'earning',amountCents:200+i,inssBase:false,irBase:false,fgtsBase:false}));
const entries=scenario==='extended'?[...extra,...long]:extra;
const calc=calculatePayroll({salaryCents:400000,competence:'2026-11',taxMode:'automatic',dependents:0,entries});
const company={id:'demo',legalName:'Empresa Demonstração QA Ltda.',tradeName:'Empresa QA',cnpj:'00.000.000/0001-00',address:'Endereço fictício para homologação',createdAt:''};
const employee={id:'emp',companyId:'demo',name:'Colaborador Demonstração QA',cpf:'000.000.000-00',registration:'0001',pis:'',workHours:'44 horas semanais',role:'Analista de Sistemas',admissionDate:'2024-01-10',salaryCents:400000,dependents:0,active:true,createdAt:''};
const record={id:'r1',companyId:'demo',employeeId:'emp',kind:'monthly',competence:'2026-11',status:'finalized',paidAt:null,createdAt:'',updatedAt:'',details:{...calc,employee,company,competence:'2026-11',taxMode:'automatic'}};
await mkdir(dirname(filename),{recursive:true});
await writeFile(filename,receiptHTML(record),'utf8');
console.log('HTML criado:',filename,scenario);
