import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const configuration=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));

test('the Windows executable, installer and desktop shortcut use the ArtiSys branded icon',()=>{
  assert.equal(configuration.build.win.icon,'build/icon.ico');
  assert.equal(configuration.build.nsis.installerIcon,'build/icon.ico');
  assert.equal(configuration.build.nsis.uninstallerIcon,'build/icon.ico');
  assert.equal(configuration.build.nsis.createDesktopShortcut,true);
  assert.equal(configuration.build.appId,'dev.artisys.holerites');
  assert.equal(configuration.build.productName,'ArtiSys Holerites');
  assert.match(configuration.scripts.prebuild,/generate-icon\.mjs/);
});

test('generator creates a true multi-size Windows ICO including small shortcut sizes',()=>{
  execFileSync(process.execPath,[join(root,'scripts/generate-icon.mjs')],{cwd:root,stdio:'pipe'});
  const icon=readFileSync(join(root,'build/icon.ico'));
  assert.equal(icon.readUInt16LE(0),0);
  assert.equal(icon.readUInt16LE(2),1);
  const count=icon.readUInt16LE(4);
  const sizes=[];
  for(let i=0;i<count;i++){
    const offset=6+i*16;
    const w=icon.readUInt8(offset)||256;
    const h=icon.readUInt8(offset+1)||256;
    const length=icon.readUInt32LE(offset+8);
    const imageStart=icon.readUInt32LE(offset+12);
    assert.equal(w,h);
    assert.ok(length>100);
    assert.ok(imageStart>=6+count*16);
    assert.ok(imageStart+length<=icon.length);
    assert.equal(icon.readUInt32LE(imageStart),40); // 32-bit BMP DIB frame
    assert.equal(icon.readInt32LE(imageStart+4),w);
    assert.equal(icon.readInt32LE(imageStart+8),h*2);
    assert.equal(icon.readUInt16LE(imageStart+14),32);
    sizes.push(w);
  }
  assert.deepEqual(sizes,[16,24,32,48,64,128,256]);
  assert.ok(statSync(join(root,'build/icon.png')).size>10000);
});
