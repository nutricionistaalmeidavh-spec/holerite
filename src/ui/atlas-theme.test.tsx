import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const css=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../atlas.css'),'utf8');
const token=(key:string)=>{
 const hit=css.match(new RegExp('--atlas-'+key+':\\s*(#[0-9A-Fa-f]{6})\\s*;'));
 assert.ok(hit,'Missing six-digit token '+key);
 return hit[1];
};
function luminance(hex:string) {
 const nums=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255)
    .map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 return nums[0]*.2126+nums[1]*.7152+nums[2]*.0722;
}
function contrast(a:string,b:string) {
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('Atlas uses complete local six-digit palette without external font/CDN imports',()=>{
 for(const key of ['bg','surface','surface-muted','fg','fg-muted','primary','primary-fg','secondary','secondary-fg','accent','border']){
   assert.match(token(key),/^#[0-9A-Fa-f]{6}$/);
 }
 assert.doesNotMatch(css,/@import\s+url\(/);
});
test('Atlas semantic text pairs pass WCAG AA contrast minimum 4.5:1',()=>{
 for(const [foreground,background] of [
  ['fg','bg'],['fg','surface'],['fg','surface-muted'],
  ['fg-muted','bg'],['fg-muted','surface'],['fg-muted','surface-muted'],
  ['primary','bg'],['primary-fg','primary'],['secondary-fg','secondary'],
  ['accent','surface']
 ]){
  assert.ok(contrast(token(foreground),token(background))>=4.5,
   'Insufficient contrast for '+foreground+' on '+background);
 }
});
