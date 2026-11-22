import test from 'node:test';
import assert from 'node:assert/strict';
import {HoleriteDatabase} from './database';

test('anexos de atestado permanecem no SQLite e sao isolados por funcionario',()=>{
  const db=new HoleriteDatabase(':memory:');
  try {
    const company=db.saveCompany({legalName:'Empresa Teste',tradeName:'',cnpj:'',address:''});
    const person=(name:string,cpf:string)=>db.saveEmployee({companyId:company.id,name,cpf,role:'Auxiliar',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
    const a=person('Alice','11111111111'),b=person('Bruno','22222222222');
    const file=Buffer.from('%PDF-1.4\\nSAMPLE');
    const record=db.attendance.addAttachment(a.id,'2026-11-05','atestado.pdf','application/pdf',file);
    assert.equal(db.attendance.listAttachments(a.id,'2026-11').length,1);
    assert.equal(db.attendance.getAttachment(a.id,record.id).content.toString(),file.toString());
    assert.throws(()=>db.attendance.getAttachment(b.id,record.id),/não encontrado/i);
    db.attendance.removeAttachment(a.id,record.id);
    assert.equal(db.attendance.listAttachments(a.id,'2026-11').length,0);
  }finally{db.close();}
});
