import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectDraftChanges,filterPayrollRecords,filterReportRows,operationCompleted} from './workspace-scope';

test('salva inclusive linhas ocultadas pelo filtro atual',()=>{
  const rows=[{key:'a',employeeId:'1',competence:'2026-11',revision:2},{key:'b',employeeId:'2',competence:'2026-11',revision:3}];
  assert.deepEqual(collectDraftChanges(rows,{a:'A',b:'B'}),[
    {employeeId:'1',competence:'2026-11',expectedRevision:2,day:'A'},
    {employeeId:'2',competence:'2026-11',expectedRevision:3,day:'B'}
  ]);
});
test('exportação preserva empresa, competência, tipo e busca',()=>{
  const records=[{companyId:'a',competence:'2026-11',kind:'monthly',status:'draft',details:{employee:{name:'Ana'}}},{companyId:'b',competence:'2026-11',kind:'monthly',status:'draft',details:{employee:{name:'Ana'}}},{companyId:'a',competence:'2026-10',kind:'monthly',status:'draft',details:{employee:{name:'Ana'}}}];
  assert.deepEqual(filterPayrollRecords(records,{companyId:'a',competence:'2026-11',kind:'monthly',search:'ana'}),[records[0]]);
});
test('relatório exporta somente funcionários selecionados inclusive seleção vazia',()=>{
  const rows=[{employeeId:'a'},{employeeId:'b'}];
  assert.deepEqual(filterReportRows(rows,['b']),[rows[1]]);
  assert.deepEqual(filterReportRows(rows,[]),[]);
});
test('cancelamento não é sucesso',()=>{
  assert.equal(operationCompleted(false),false);
  assert.equal(operationCompleted(true),true);
  assert.equal(operationCompleted(undefined),true);
});
