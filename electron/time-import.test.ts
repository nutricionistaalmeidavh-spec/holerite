import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {HoleriteDatabase} from './database';
import {TimeImporter,parseImportDate,parseImportTime} from './time-import';
import {exportTimeFile} from './time-export';
import {defaultSchedule} from '../src/shared/time';

test('accepts Brazilian Excel dates, serials and hour formats',()=>{
  assert.equal(parseImportDate('05/11/2026'),'2026-11-05');
  assert.equal(parseImportDate('31/11/2026'),'');
  assert.equal(parseImportDate(new Date('2026-11-05T00:00:00.000Z')),'2026-11-05');
  assert.equal(parseImportTime(0.5),'12:00');
  assert.equal(parseImportTime('8:15:00'),'08:15');
});

test('imports actual XLSX punches with mapped fields and exports the resulting matrix',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'time-import-'));
  const db=new HoleriteDatabase(':memory:');
  try {
    const company=db.saveCompany({legalName:'Empresa',tradeName:'',cnpj:'',address:''});
    const employee=db.saveEmployee({companyId:company.id,name:'João Exemplo',cpf:'12345678909',registration:'M-09',
      role:'Auxiliar',admissionDate:'2026-01-01',salaryCents:300000,dependents:0,active:true});
    db.attendance.setConfig(company.id,{enabled:true,variationMinutes:0,schedule:defaultSchedule()});
    const file=join(dir,'ponto.xlsx');
    const book=new ExcelJS.Workbook();
    const sheet=book.addWorksheet('Dados');
    sheet.addRow(['CPF','Data','Entrada','Saída almoço','Volta almoço','Saída']);
    sheet.addRow(['12345678909','05/11/2026','08:00','12:00','13:00','17:30']);
    await book.xlsx.writeFile(file);
    const importer=new TimeImporter(db.attendance,()=>db.snapshot().employees);
    const selection=await importer.choose(company.id,file);
    const preview=importer.preview(selection.token,selection.suggestedMapping);
    assert.deepEqual(preview.errors,[]);
    assert.equal(preview.accepted,1);
    assert.deepEqual(importer.commit(selection.token,selection.suggestedMapping),{imported:1});
    assert.equal(db.attendance.getSheet(employee.id,'2026-11').days[0].source,'imported');
    const duplicate=await importer.choose(company.id,file);
    assert.throws(()=>importer.commit(duplicate.token,duplicate.suggestedMapping),/já foi importado/);
    const exported=join(dir,'export.csv');
    const count=await exportTimeFile({store:db.attendance,employees:db.snapshot().employees,
      companyId:company.id,competence:'2026-11',format:'csv',filePath:exported});
    assert.equal(count,1);
    const fs=await import('node:fs/promises');
    const result=await fs.readFile(exported,'utf8');
    assert.match(result,/João Exemplo/);
    assert.match(result,/05/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('importa planilha com mais de 500 linhas como um lote e reutiliza mapeamento da empresa',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'time-import-bulk-'));
  const db=new HoleriteDatabase(':memory:');
  try {
    const company=db.saveCompany({legalName:'Empresa em lote',tradeName:'',cnpj:'',address:''});
    db.saveEmployee({companyId:company.id,name:'Maria Exemplo',cpf:'12345678909',registration:'R-01',role:'Analista',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true});
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Ponto');
    sheet.addRow(['CPF','Data','Entrada','Saída almoço','Volta almoço','Saída']);
    for(let i=0;i<520;i++){
      const date=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
      sheet.addRow(['12345678909',date,'08:00','12:00','13:00','17:00']);
    }
    const file=join(dir,'large.xlsx');await book.xlsx.writeFile(file);
    const importer=new TimeImporter(db.attendance,()=>db.snapshot().employees);
    const chosen=await importer.choose(company.id,file);
    assert.equal(chosen.count,520);
    const result=importer.commit(chosen.token,chosen.suggestedMapping);
    assert.equal(result.imported,520);
    assert.equal(db.attendance.getSheet(db.snapshot().employees[0].id,'2025-01').days.length,31);
    const again=await importer.choose(company.id,file);
    assert.deepEqual(again.suggestedMapping,chosen.suggestedMapping);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('import keeps columns beyond the former 50-column cutoff',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'time-import-wide-'));
  const db=new HoleriteDatabase(':memory:');
  try{
    const company=db.saveCompany({legalName:'Equipe',tradeName:'',cnpj:'',address:''});
    db.saveEmployee({companyId:company.id,name:'Pessoa',cpf:'12345678909',role:'Auxiliar',admissionDate:'2025-01-01',salaryCents:300000,dependents:0,active:true});
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Ponto');
    const filler=Array.from({length:51},(_,i)=>'Campo '+i);
    sheet.addRow([...filler,'CPF','Data','Entrada','Saída almoço','Volta almoço','Saída']);
    sheet.addRow([...filler.map(()=>''),'12345678909','05/11/2026','08:00','12:00','13:00','17:00']);
    const file=join(dir,'wide.xlsx');await book.xlsx.writeFile(file);
    const importer=new TimeImporter(db.attendance,id=>db.listEmployees(id));
    const chosen=await importer.choose(company.id,file);
    assert.equal(chosen.headers.length,57);
    assert.equal(importer.commit(chosen.token,chosen.suggestedMapping).imported,1);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
