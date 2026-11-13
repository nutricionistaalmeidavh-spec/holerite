import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PayrollKindTabs, PAYROLL_KIND_LABELS} from './PayrollKindTabs';

test('five distinct kinds of payroll are discoverable as labeled, accessible controls', ()=>{
  const html=renderToStaticMarkup(<PayrollKindTabs value="vacation" onChange={()=>{}}/>);
  for(const label of Object.values(PAYROLL_KIND_LABELS)){
    assert.ok(html.includes(label), 'Missing kind '+label);
  }
  assert.equal((html.match(/aria-pressed="/g)||[]).length,5);
  assert.match(html,/role="group"/);
  assert.match(html,/aria-label="Tipo de documento"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/aria-pressed="false"/);
  assert.match(html,/type="button"/);
});
test('tabs keep vacation selection and display contextual help without clickable decorations', ()=>{
  const html=renderToStaticMarkup(<PayrollKindTabs value="vacation" onChange={()=>{}}/>);
  assert.match(html,/Férias/);
  assert.match(html,/Terço constitucional/);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
});
