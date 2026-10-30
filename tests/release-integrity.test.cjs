'use strict';
// Data integrity gates: full-field PASS is never authentic field engineering sign-off.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const moduleShim = {exports:{}};
new Function('module',scripts[0][1])(moduleShim);
const E = moduleShim.exports;

function valid() {
 const s = E.newProject();
 s.project.name = 'VALID FIELDS, NOT DOCUMENT AUTHENTICITY';
 s.project.reportDate = '2026-10-30';
 s.tasks = [{id:'T-001',qty:10,budget:1000,sourceRef:'BOQ-100',
  qtoChecker:'Reviewer',qtoApproved:true,start:'2026-10-26',finish:'2026-10-30',
  baselineHours:32,baselineApproved:true,baselineRef:'BL-100',
  ssotRef:'SS-100',ssotChecker:'Independent',ssotVerified:true}];
 s.qa = [{id:'QA-001',status:'PASS',inspector:'Reviewer',evidence:'INSP-100',taskId:'T-001'}];
 return s;
}
test('Complete fixture passes data completeness only',()=>assert.equal(E.release(valid()).status,'PASS'));
const cases=[
 ['Invalid report date',s=>s.project.reportDate='2026-02-30'],
 ['Missing report date',s=>delete s.project.reportDate],
 ['Negative cost amount',s=>s.costs=[{id:'C-001',amount:-7}]],
 ['Duplicate QA identifiers',s=>s.qa.push({...s.qa[0]})],
 ['Orphan QA linked to unknown work item',s=>s.qa[0].taskId='T-404'],
 ['Invalid daily log date',s=>s.daily=[{id:'D-001',taskId:'T-001',date:'2026-02-30',qty:1,hours:1,people:1,cost:100}]],
 ['Duplicate cost identifiers',s=>s.costs=[{id:'C-001',amount:7},{id:'C-001',amount:10}]],
 ['Test-only marker embedded in QA evidence',s=>s.qa[0].evidence='Report TEST-ONLY-QA-1'],
 ['Test-only marker embedded in SSOT reference',s=>s.tasks[0].ssotRef='Document TEST-ONLY-SSOT-1'],
 ['Negative materials cost',s=>s.materials=[{id:'M-001',unitCost:-9}]],
 ['Duplicate daily identifiers',s=>s.daily=[{id:'D-001',taskId:'T-001',date:'2026-10-30',qty:1,hours:2,people:1,cost:0},{id:'D-001',taskId:'T-001',date:'2026-10-30',qty:2,hours:2,people:1,cost:0}]],
 ['Invalid work hours > 24',s=>s.project.standardHours=25]
];
for(const [label,change] of cases){
 test(label+' must HOLD',()=>{
  const s=valid();change(s);
  assert.equal(E.release(s).status,'HOLD',label);
  assert.ok(E.release(s).problems.length>0,label+': issue must be visible');
 });
}
test('Formal inspection with word test in legitimate reference is not automatically rejected',()=>{
 const s=valid();s.qa[0].evidence='Concrete test report TR-80';
 assert.equal(E.release(s).status,'PASS');
});
