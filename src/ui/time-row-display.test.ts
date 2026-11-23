import assert from 'node:assert/strict';
import test from 'node:test';
import {pointSourceLabel,pointRowStatus} from './time-row-display';

test('matrix distinguishes suggested, reviewed, manual and imported records without representing suggestions as real punches',()=>{
 assert.equal(pointSourceLabel('suggested'),'Gerada');
 assert.equal(pointSourceLabel('reviewed'),'Gerada · conferida');
 assert.equal(pointSourceLabel('manual'),'Manual');
 assert.equal(pointSourceLabel('imported'),'Importada');
});
test('matrix status prioritizes alerts and never calls unreviewed records confirmed',()=>{
 assert.deepEqual(pointRowStatus('suggested',false),{label:'Sugestão',tone:'suggested'});
 assert.deepEqual(pointRowStatus('manual',false),{label:'Registrada',tone:'neutral'});
 assert.deepEqual(pointRowStatus('imported',false),{label:'Registrada',tone:'neutral'});
 assert.deepEqual(pointRowStatus('reviewed',false),{label:'Conferida',tone:'reviewed'});
 assert.deepEqual(pointRowStatus('reviewed',true),{label:'Aviso',tone:'warning'});
 assert.deepEqual(pointRowStatus('suggested',true),{label:'Aviso',tone:'warning'});
});
