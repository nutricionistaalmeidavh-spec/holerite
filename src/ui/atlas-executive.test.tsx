import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {TimeControlPage} from './TimeControlPage';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const theme=()=>readFileSync(join(root,'executive.css'),'utf8');

test('Atlas Executive is a local theme with reduced motion and keyboard-visible controls',()=>{
 const css=theme();
 assert.match(css,/\.atlas-executive/);
 assert.match(css,/\.time-matrix-summary/);
 assert.match(css,/prefers-reduced-motion:\s*reduce/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/@import\s+url\(/i);
 assert.doesNotMatch(css,/https?:\/\//i);
 const entry=readFileSync(join(root,'main.tsx'),'utf8');
 assert.match(entry,/import '\.\/executive\.css'/);
});
test('time workspace keeps the full five-step flow and honest suggestion terminology',()=>{
 const html=renderToStaticMarkup(<TimeControlPage companyId="" competence="2026-11" employees={[]} onPayrollUpdated={()=>{}}/>);
 for(const heading of ['Jornada','Preenchimento','Conferência em lote','Impressão e assinatura','Holerite']){
  assert.ok(html.includes(heading),'Missing original step '+heading);
 }
 assert.match(html,/point-workspace/);
 assert.match(html,/A conferência orienta e não bloqueia/);
});

test('Visão geral is the initial screen and navigation follows the company-to-payroll workflow',()=>{
 const app=readFileSync(join(root,'App.tsx'),'utf8');
 assert.match(app,/useState<Tab>\('dashboard'\)/);
 const nav=app.split('<nav aria-label="Menu principal">')[1]?.split('</nav>')[0]??'';
 const order=Array.from(nav.matchAll(/\['([^']+)','[^']+','[^']+'\]/g),match=>match[1]);
 assert.deepEqual(order,['dashboard','companies','employees','time','payroll','history']);
});
