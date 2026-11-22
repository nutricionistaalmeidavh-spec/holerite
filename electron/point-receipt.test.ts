import test from 'node:test';
import assert from 'node:assert/strict';
import {HoleriteDatabase} from './database';
import {pointReceiptHTML} from './point-receipt';

test('printed form identifies unreviewed generated hours and has paper signature fields',()=>{
  const db=new HoleriteDatabase(':memory:');
  try{
    const company=db.saveCompany({legalName:'Empresa de Teste',tradeName:'Teste',cnpj:'',address:''});
    const worker=db.saveEmployee({companyId:company.id,name:'Ana Silva',cpf:'12345678909',role:'Auxiliar',
      admissionDate:'2026-01-02',salaryCents:300000,dependents:0,active:true});
    const original=db.attendance.autofill(worker.id,'2026-11');
    const draft=pointReceiptHTML(original,worker,company);
    assert.match(draft,/NÃO CONFERIDO/);
    assert.match(draft,/Assinatura do funcionário/);
    assert.match(draft,/Data: ____\/____\/________/);
    db.attendance.reviewSuggestions([worker.id],'2026-11');
    const reviewed=pointReceiptHTML(db.attendance.getSheet(worker.id,'2026-11'),worker,company);
    assert.match(reviewed,/GERADO \/ CONFERIDO EM LOTE/);
    assert.doesNotMatch(reviewed,/NÃO CONFERIDO<\/td>/);
    assert.match(reviewed,/assinatura/i);
  }finally{db.close();}
});
