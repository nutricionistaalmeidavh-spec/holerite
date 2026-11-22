import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {HoleriteDatabase} from './database';
import {EmployeeImporter} from './employee-import';

test('CSV brasileiro cadastra somente funcionários novos sem alterar os existentes',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'employee-import-csv-'));
  const db=new HoleriteDatabase(':memory:');
  try{
    const company=db.saveCompany({legalName:'Empresa Modelo',tradeName:'',cnpj:'',address:''});
    const saved=db.saveEmployee({companyId:company.id,name:'Existente',cpf:'12345678909',registration:'0001',role:'Auxiliar',
      admissionDate:'2025-01-01',salaryCents:400000,dependents:0,active:true});
    const file=join(folder,'funcionarios.csv');
    writeFileSync(file,'Nome;CPF;Matrícula;Cargo;Admissão;Salário mensal;Dependentes;Situação\n'+
      'Existente;12345678909;0001;Auxiliar;01/01/2025;1000,00;0;Ativo\n'+
      'Maria;12345678901;0002;Técnica;05/11/2026;3500,50;1;Ativo\n','utf8');
    const importer=new EmployeeImporter(db);
    const choice=await importer.choose(company.id,file);
    const preview=importer.preview(choice.token,choice.suggestedMapping);
    assert.deepEqual(preview.errors,[]);
    assert.equal(preview.created,1);
    assert.equal(preview.skipped,1);
    assert.deepEqual(importer.commit(choice.token,choice.suggestedMapping),{created:1,skipped:1});
    assert.equal(db.snapshot().employees.length,2);
    const maria=db.snapshot().employees.find(e=>e.name==='Maria');
    assert.equal(maria?.salaryCents,350050);
    assert.equal(maria?.admissionDate,'2026-11-05');
    assert.equal(maria?.dependents,1);
    assert.equal(db.getEmployee(saved.id).salaryCents,400000);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});

test('XLSX aceita CPF numérico e datas do Excel com prévia antes da gravação',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'employee-import-xlsx-'));
  const db=new HoleriteDatabase(':memory:');
  try{
    const company=db.saveCompany({legalName:'Empresa Modelo',tradeName:'',cnpj:'',address:''});
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Equipe');
    sheet.addRow(['Nome','CPF','Matrícula','Cargo','Admissão','Salário mensal']);
    sheet.addRow(['Joana',1234567890,'J-100','Administrativa',new Date('2026-08-01T00:00:00.000Z'),2800]);
    const file=join(folder,'funcionarios.xlsx');await book.xlsx.writeFile(file);
    const importer=new EmployeeImporter(db);
    const choice=await importer.choose(company.id,file);
    const preview=importer.preview(choice.token,choice.suggestedMapping);
    assert.equal(preview.created,1);
    assert.equal(preview.errors.length,0);
    assert.equal(db.snapshot().employees.length,0);
    importer.commit(choice.token,choice.suggestedMapping);
    assert.equal(db.snapshot().employees[0].cpf,'01234567890');
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});

test('importação é transacional e reverte o lote se uma linha falhar na validação do banco',()=>{
  const db=new HoleriteDatabase(':memory:');
  try{
    const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
    const input={companyId:company.id,name:'A',cpf:'12345678909',role:'Auxiliar',admissionDate:'2026-01-01',
      salaryCents:300000,dependents:0,active:true};
    assert.throws(()=>db.importEmployeeBatch([input,{...input,name:'B',cpf:'111'}]),/CPF/);
    assert.equal(db.snapshot().employees.length,0);
  }finally{db.close();}
});
