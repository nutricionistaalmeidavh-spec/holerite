import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {LocalAccess} from './access-control';

test('usuarios locais so sao exigidos depois da ativacao explicita e PIN nao fica exposto',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const access=new LocalAccess(db);
    assert.equal(access.state().configured,false);
    access.requireAccess('save-employee');
    const admin=access.setup('Responsavel','123456');
    assert.equal(admin.role,'admin');
    assert.equal(access.state().configured,true);
    assert.equal(JSON.stringify(access.listUsers()).includes('123456'),false);
    access.addUser('Operador','654321','viewer');
    access.logout();
    assert.throws(()=>access.requireAccess('snapshot'),/Autenticação/i);
    assert.throws(()=>access.login('Operador','999999'),/credenciais/i);
    const viewer=access.login('Operador','654321');
    assert.equal(viewer.role,'viewer');
    access.requireAccess('time-sheet');
    assert.throws(()=>access.requireAccess('time-save-matrix'),/permissão/i);
    assert.throws(()=>access.addUser('Outro','111111','hr'),/permissão/i);
    access.logout();
    access.login('Responsavel','123456');
    assert.equal(access.listUsers().length,2);
  }finally{db.close();}
});
