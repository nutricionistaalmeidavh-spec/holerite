import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerUpdateFlow, type UpdateBridge, type UpdateDialogs } from './updates';

type Listener = (info: {version: string}) => void | Promise<void>;
function fixture(downloadApproved = true, installApproved = true) {
  const calls: string[] = [];
  let available: Listener = () => {};
  let downloaded: Listener = () => {};
  const updater: UpdateBridge = {
    configureManual: () => { calls.push('manual'); },
    onAvailable: callback => { available = callback; },
    onDownloaded: callback => { downloaded = callback; },
    onError: () => { calls.push('error-listener'); },
    check: async () => { calls.push('check'); },
    download: async () => { calls.push('download'); },
    install: () => { calls.push('install'); }
  };
  const dialogs: UpdateDialogs = {
    confirmDownload: async version => { calls.push('ask-download:'+version); return downloadApproved; },
    confirmInstall: async version => { calls.push('ask-install:'+version); return installApproved; },
    downloadFailed: async () => { calls.push('download-failed'); }
  };
  return {calls, updater, dialogs, emitAvailable: (version:string) => available({version}), emitDownloaded: (version:string) => downloaded({version})};
}

test('não consulta releases em desenvolvimento ou fora do Windows', async () => {
  for (const options of [{packaged:false, platform:'win32'}, {packaged:true,platform:'linux'}]) {
    const f=fixture();
    await registerUpdateFlow(options,f.updater,f.dialogs)();
    assert.deepEqual(f.calls, []);
  }
});

test('verifica a release ao abrir e oferece baixar antes do download', async () => {
  const f=fixture();
  await registerUpdateFlow({packaged:true,platform:'win32'},f.updater,f.dialogs)();
  assert.deepEqual(f.calls,['manual','error-listener','check']);
  await f.emitAvailable('0.2.0');
  assert.deepEqual(f.calls,['manual','error-listener','check','ask-download:0.2.0','download']);
  await f.emitDownloaded('0.2.0');
  assert.deepEqual(f.calls.slice(-2),['ask-install:0.2.0','install']);
});

test('recusa de download ou instalação nunca instala silenciosamente', async () => {
  const a=fixture(false);
  await registerUpdateFlow({packaged:true,platform:'win32'},a.updater,a.dialogs)();
  await a.emitAvailable('0.2.0');
  assert.equal(a.calls.includes('download'),false);
  const b=fixture(true,false);
  await registerUpdateFlow({packaged:true,platform:'win32'},b.updater,b.dialogs)();
  await b.emitAvailable('0.2.0');
  await b.emitDownloaded('0.2.0');
  assert.equal(b.calls.includes('install'),false);
});

test('não abre vários avisos para a mesma atualização', async () => {
  const f=fixture();
  await registerUpdateFlow({packaged:true,platform:'win32'},f.updater,f.dialogs)();
  await f.emitAvailable('0.2.0');
  await f.emitAvailable('0.2.0');
  assert.equal(f.calls.filter(c=>c.startsWith('ask-download')).length,1);
});

test('falha de conexão na consulta não bloqueia abertura do aplicativo', async () => {
  const f=fixture();
  f.updater.check=async()=>{throw new Error('offline');};
  await assert.doesNotReject(registerUpdateFlow({packaged:true,platform:'win32'},f.updater,f.dialogs)());
});

test('falha no download informa o usuário sem instalar', async () => {
  const f=fixture();
  f.updater.download=async()=>{throw new Error('download failed');};
  await registerUpdateFlow({packaged:true,platform:'win32'},f.updater,f.dialogs)();
  await f.emitAvailable('0.2.0');
  assert.equal(f.calls.includes('download-failed'),true);
  assert.equal(f.calls.includes('install'),false);
});
