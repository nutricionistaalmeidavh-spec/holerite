import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import iconv from 'iconv-lite';
import {HoleriteDatabase} from './database';
import {EmployeeImporter} from './employee-import';
import {TimeImporter} from './time-import';
import {CombinedImporter} from './combined-import';
import {makeTemplate} from './template-workbook';
import {defaultSchedule} from '../src/shared/time';

function createDb(){
  const db=new HoleriteDatabase(':memory:');
  const company=db.saveCompany({legalName:'Empresa QA',tradeName:'',cnpj:'',address:''});
  return {db,company};
}
test('CSV Windows-1252 com aspas, acentos e ponto e vírgula reconhece colunas sem configuração',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'csv-1252-'));
  const {db,company}=createDb();
  try{
    const file=join(folder,'equipe.csv');
    writeFileSync(file,iconv.encode('Nome;CPF;Matrícula;Cargo;Admissão;Salário mensal (R$)\r\n'+
      '"José; Silva";12345678909;007;Técnico;01/11/2026;3500,50\r\n','win1252'));
    const importer=new EmployeeImporter(db),choice=await importer.choose(company.id,file);
    assert.equal(choice.suggestedMapping.salary,'Salário mensal (R$)');
    assert.equal(importer.preview(choice.token,choice.suggestedMapping).created,1);
    importer.commit(choice.token,choice.suggestedMapping);
    assert.equal(db.snapshot().employees[0].name,'José; Silva');
    assert.equal(db.snapshot().employees[0].salaryCents,350050);
    assert.equal(db.snapshot().employees[0].registration,'007');
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('prévia de funcionários permite corrigir uma célula e opção explícita de importar somente válidos',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'partial-import-'));
  const {db,company}=createDb();
  try{
    const file=join(folder,'equipe.csv');
    writeFileSync(file,'Nome;CPF;Matrícula;Cargo;Admissão;Salário mensal (R$)\n'+
      'Ana;12345678909;1;Auxiliar;01/11/2026;2200,00\n'+
      'Bia;12345678910;2;Auxiliar;01/11/2026;errado\n','utf8');
    const importer=new EmployeeImporter(db),choice=await importer.choose(company.id,file);
    const preview=importer.preview(choice.token,choice.suggestedMapping);
    assert.equal(preview.created,1);
    assert.equal(preview.errors.length,1);
    assert.throws(()=>importer.commit(choice.token,choice.suggestedMapping),/Revise/);
    assert.equal(db.snapshot().employees.length,0);
    const edited=importer.preview(choice.token,choice.suggestedMapping,{3:{salary:'2500,00'}});
    assert.equal(edited.created,2);
    assert.equal(edited.errors.length,0);
    assert.deepEqual(importer.commit(choice.token,choice.suggestedMapping,false,{3:{salary:'2500,00'}}),{created:2,skipped:0});
    assert.equal(db.snapshot().employees.length,2);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('importação parcial respeita confirmação sem gravar linhas inválidas',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'partial-confirm-'));
  const {db,company}=createDb();
  try{
    const file=join(folder,'equipe.csv');
    writeFileSync(file,'Nome;CPF;Matrícula;Cargo;Admissão;Salário mensal (R$)\n'+
      'Ana;12345678909;1;Auxiliar;01/11/2026;2200,00\n'+
      'Bia;12345678910;2;Auxiliar;01/11/2026;errado\n','utf8');
    const importer=new EmployeeImporter(db),choice=await importer.choose(company.id,file);
    assert.deepEqual(importer.commit(choice.token,choice.suggestedMapping,true),{created:1,skipped:0});
    assert.equal(db.snapshot().employees[0].name,'Ana');
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('matriz mensal XLSX oficial reconhece colunas por dia e permite importar somente datas preenchidas',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'wide-point-'));
  const {db,company}=createDb();
  try{
    const person=db.saveEmployee({companyId:company.id,name:'Ana',cpf:'12345678909',registration:'007',
      role:'Analista',admissionDate:'2026-01-01',salaryCents:310000,dependents:0,active:true});
    db.attendance.setConfig(company.id,{enabled:true,variationMinutes:0,schedule:defaultSchedule()});
    const book=makeTemplate('matrix'),sheet=book.getWorksheet('Matriz mensal')!;
    const data:Array<string|number> = Array(sheet.columnCount).fill('');
    data[0]='Ana';data[1]='12345678909';data[2]='007';data[3]='2026-11';
    data[4]='08:00';data[5]='12:00';data[6]='13:00';data[7]='17:00';
    data[10]='08:10';data[11]='12:00';data[12]='13:00';data[13]='17:10';
    sheet.addRow(data);
    const file=join(folder,'matriz.xlsx');await book.xlsx.writeFile(file);
    const importer=new TimeImporter(db.attendance,()=>db.snapshot().employees);
    const choice=await importer.choose(company.id,file);
    assert.equal(choice.layout,'monthly');
    assert.equal(choice.count,2);
    const preview=importer.preview(choice.token,choice.suggestedMapping);
    assert.equal(preview.errors.length,0);
    assert.deepEqual(importer.commit(choice.token,choice.suggestedMapping),{imported:2});
    assert.equal(db.attendance.getSheet(person.id,'2026-11').days.length,2);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('pacote XLSX reconhece ambas as abas e grava funcionário + ponto atomica e localmente',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'bundle-import-'));
  const {db,company}=createDb();
  try{
    db.attendance.setConfig(company.id,{enabled:true,variationMinutes:0,schedule:defaultSchedule()});
    const book=makeTemplate('combined');
    book.getWorksheet('Funcionários')!.addRow(['Ana Souza','12345678909','009','Técnica','05/11/2026','3500,00']);
    book.getWorksheet('Ponto')!.addRow(['Ana Souza','12345678909','009','05/11/2026','Trabalho','08:00','12:00','13:00','17:00','']);
    const file=join(folder,'pacote.xlsx');await book.xlsx.writeFile(file);
    const importer=new CombinedImporter(db);
    const choice=await importer.choose(company.id,file);
    assert.ok(choice.employees.suggestedMapping.salary);
    assert.ok(choice.time.suggestedMapping.date);
    const input={employeeToken:choice.employees.token,timeToken:choice.time.token,
      employeeMapping:choice.employees.suggestedMapping,timeMapping:choice.time.suggestedMapping};
    const preview=importer.preview(input);
    assert.equal(preview.employees.created,1);
    assert.equal(preview.time?.accepted,1);
    assert.deepEqual(importer.commit(input),{created:1,skipped:0,imported:1});
    const person=db.snapshot().employees[0];
    assert.equal(db.attendance.getSheet(person.id,'2026-11').days[0].source,'imported');
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('pacote com ficha inválida não insere parcialmente funcionários',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'bundle-invalid-'));
  const {db,company}=createDb();
  try{
    const book=makeTemplate('combined');
    book.getWorksheet('Funcionários')!.addRow(['Ana','12345678909','009','Técnica','05/11/2026','3500,00']);
    book.getWorksheet('Ponto')!.addRow(['Ana','12345678909','009','data ruim','Trabalho','08:00','12:00','13:00','17:00','']);
    const file=join(folder,'pacote.xlsx');await book.xlsx.writeFile(file);
    const importer=new CombinedImporter(db);
    const c=await importer.choose(company.id,file);
    const input={employeeToken:c.employees.token,timeToken:c.time.token,
      employeeMapping:c.employees.suggestedMapping,timeMapping:c.time.suggestedMapping};
    assert.equal(importer.preview(input).time?.errors.length,1);
    assert.throws(()=>importer.commit(input),/Corrija os erros/);
    assert.equal(db.snapshot().employees.length,0);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
