'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
assert.ok(match, 'SiteEngine source is embedded in index.html');
const sandbox = vm.createContext({ module: { exports: {} } });
vm.runInContext(match[1], sandbox, { filename: 'SiteEngine.inline.js', timeout: 4000 });
const E = sandbox.module.exports;
assert.equal(typeof E.release, 'function');

function fixture() {
  const s = E.newProject();
  s.project.name = 'AUTOMATED TEST ONLY';
  s.project.reportDate = '2026-10-24';
  s.project.standardHours = 8;
  s.tasks = [{id:'T-001',wbs:'03.01',title:'Temel betonu',unit:'m³',qty:10,unitRate:240,budget:2400,baselineHours:40,
    start:'2026-10-24',finish:'2026-10-24',sourceRef:'TEST-BOQ-001',qtoChecker:'TEST-CHECKER',qtoApproved:true,
    baselineApproved:true,baselineRef:'TEST-BL-001',ssotVerified:true,ssotRef:'TEST-SSOT-001',ssotChecker:'TEST-INDEPENDENT-CHECKER'}];
  s.daily = [{id:'G-001',taskId:'T-001',date:'2026-10-24',qty:4,hours:16,people:2,cost:900}];
  s.qa = [{id:'QA-001',taskId:'T-001',title:'TEST QA ONLY',status:'PASS',inspector:'TEST-INSPECTOR',evidence:'TEST-EVIDENCE-REF'}];
  return s;
}
const gate = (state,code) => E.release(state).gates.find(g=>g.code===code).open;

test('Empty project is HOLD', () => assert.equal(E.release(E.newProject()).status,'HOLD'));
test('Metraj EV: BAC=2400, EV=960, AC=900, PV=2400', () => {
  const v=E.calc(fixture());
  assert.equal(v.BAC,2400);assert.equal(v.EV,960);assert.equal(v.AC,900);assert.equal(v.PV,2400);
  assert.equal(v.progress,0.4);assert.equal(v.CPI,1.06666667);assert.equal(v.SPI,0.4);
});
test('Synthetic TEST references satisfy five field gates but never authorize release', () => {assert.equal(E.gates(fixture()).allPass,true);assert.equal(E.release(fixture()).status,'HOLD')});
test('Missing QTO source blocks CHK-006', () => {const s=fixture();s.tasks[0].sourceRef='';assert.equal(gate(s,'CHK-006'),1);assert.equal(E.release(s).status,'HOLD')});
test('Overtime without approval blocks CHK-008', () => {const s=fixture();s.daily[0].hours=20;assert.equal(gate(s,'CHK-008'),1);s.daily[0].overtimeApproved=true;s.daily[0].overtimeRef='TEST-OT-REF';assert.equal(gate(s,'CHK-008'),0)});
test('Open QA blocks CHK-010', () => {const s=fixture();s.qa[0].status='OPEN';assert.equal(gate(s,'CHK-010'),1);assert.equal(E.release(s).status,'HOLD')});
test('Unapproved baseline blocks CHK-014', () => {const s=fixture();s.tasks[0].baselineApproved=false;assert.equal(gate(s,'CHK-014'),1)});
test('Missing independent checker blocks CHK-015', () => {const s=fixture();s.tasks[0].ssotChecker='';assert.equal(gate(s,'CHK-015'),1)});
test('Duplicate task ID always HOLD', () => {const s=fixture();s.tasks.push({...s.tasks[0]});assert.equal(E.release(s).status,'HOLD');assert.ok(E.issues(s).length>0)});
test('Invalid JSON schema rejected, valid fixture imported', () => {
 assert.throws(()=>E.safeImport({schema:2,project:{reportDate:'2026-10-24'}}));
 assert.throws(()=>E.safeImport({schema:3,project:{reportDate:'broken'}}));
 const v=E.safeImport(fixture());assert.equal(v.tasks.length,1);
});
test('JSON backup uses current REV 3.11.6 filename', () => {
 assert.ok(html.includes("JSONFILE='Site_Control_Project_REV3_11_6.json'"));
 assert.ok(!html.includes("JSONFILE='Site_Control_Project_REV3_10.json'"));
});
