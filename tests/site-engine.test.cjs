'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.ok(scripts.length>=3);
assert.match(scripts[0],/Site Control engine/);
const sandbox={};vm.runInNewContext(scripts[0],sandbox,{timeout:3000});
const E=sandbox.SiteEngine;
const clone=x=>JSON.parse(JSON.stringify(x));
function sample(){
  const s=E.newProject();s.project.reportDate='2026-10-10';
  s.tasks=[{id:'T-001',title:'Foundation concrete',unit:'m³',qty:10,budget:2400,baselineHours:40,
    start:'2026-10-01',finish:'2026-10-10',sourceRef:'DRAWING-101',qtoChecker:'Reviewer A',
    qtoApproved:true,baselineRef:'BASE-101',baselineApproved:true,
    ssotVerified:false,ssotRef:'TEST-ONLY-SSOT-001',ssotChecker:''}];
  s.qa=[{id:'QA-001',taskId:'T-001',status:'OPEN',evidence:'',inspector:''}];return s;
}
function checked(s){
 Object.assign(s.tasks[0],{ssotRef:'ENGINEER-DOC-101',ssotChecker:'Independent Reviewer',ssotVerified:true});
 Object.assign(s.qa[0],{status:'PASS',evidence:'QA-DOC-101',inspector:'Reviewer A'});return s;
}
const gate=(s,id)=>E.gates(s).rows.find(x=>x.code===id);
const shouldReject=s=>assert.throws(()=>E.safeImport(s));
test('Engine API loads from actual app',()=>['newProject','calc','gates','issues','release','safeImport','workdays','validDate'].forEach(k=>assert.equal(typeof E[k],'function')));
test('Version header REV 3.11.6',()=>assert.match(html,/Site Control REV 3\.11\.6/));
test('Unverified QA/SSOT: exactly 3 PASS 2 HOLD',()=>{
 const g=E.gates(sample()).rows;
 assert.equal(g.filter(x=>x.open===0).length,3);
 assert.deepEqual(Array.from(g.filter(x=>x.open>0).map(x=>x.code)),['CHK-010','CHK-015']);
});
test('Unverified records keep release HOLD',()=>assert.equal(E.release(sample()).status,'HOLD'));
test('TEST SSOT reference cannot produce PASS',()=>{
 const s=checked(sample());s.tasks[0].ssotRef='TEST-ONLY-SSOT-001';
 const r=E.release(s);assert.equal(r.status,'HOLD');assert.ok(r.problems.some(x=>x.includes('TEST/MOCK/DUMMY')));
});
test('Five data-completeness gates can PASS with valid-looking synthetic strings',()=>{
 const r=E.release(checked(sample()));
 assert.equal(r.gates.every(x=>x.open===0),true);assert.equal(r.status,'PASS');
 // This is not a genuine engineering approval and is never presented as one.
});
test('Example projects cannot pass formal release',()=>{const s=checked(sample());s.project.isExample=true;assert.equal(E.release(s).status,'HOLD')});
test('Empty project remains HOLD',()=>assert.equal(E.release(E.newProject()).status,'HOLD'));
test('Missing QTO signoff triggers CHK-006',()=>{const s=sample();s.tasks[0].qtoApproved=false;assert.equal(gate(s,'CHK-006').open,1)});
test('Missing baseline signoff triggers CHK-014',()=>{const s=sample();s.tasks[0].baselineApproved=false;assert.equal(gate(s,'CHK-014').open,1)});
test('Overtime without approval triggers CHK-008',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',people:1,hours:9,qty:1,cost:100}];
 assert.equal(gate(s,'CHK-008').open,1);
});
test('Overtime with approval and ref clears CHK-008',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',people:1,hours:9,qty:1,cost:100,overtimeApproved:true,overtimeRef:'AUTH-1'}];
 assert.equal(gate(s,'CHK-008').open,0);
});
test('Overtime approval without reference stays HOLD',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',people:1,hours:9,overtimeApproved:true}];
 assert.equal(gate(s,'CHK-008').open,1);
});
test('BAC EV AC completion and CPI arithmetic',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',qty:4,hours:8,people:1,cost:900}];
 const c=E.calc(s);assert.equal(c.BAC,2400);assert.equal(c.EV,960);assert.equal(c.AC,900);
 assert.equal(c.progress,0.4);assert.ok(Math.abs(c.CPI-960/900)<1e-6);
});
test('Future daily cost and quantities excluded at report date',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-11',qty:4,hours:8,people:1,cost:900}];
 assert.equal(E.calc(s).AC,0);assert.equal(E.calc(s).EV,0);
});
test('Independent expense ledger adds to daily AC once',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',qty:4,people:1,hours:8,cost:700}];
 s.costs=[{id:'C-1',date:'2026-10-03',amount:200}];assert.equal(E.calc(s).AC,900);
});
test('Earned value capped at 100 percent of planned quantity',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',date:'2026-10-03',qty:15,hours:8,people:1,cost:900}];
 assert.equal(E.calc(s).EV,2400);assert.equal(E.calc(s).progress,1);
});
test('Valid project can be imported as copy',()=>{
 const s=sample(),z=E.safeImport(s);assert.equal(z.tasks[0].id,'T-001');assert.equal(z.qa[0].status,'OPEN');
});
test('Wrong schema blocked',()=>{const s=sample();s.schema=999;shouldReject(s)});
test('Duplicate task IDs blocked',()=>{const s=sample();s.tasks.push(clone(s.tasks[0]));shouldReject(s)});
test('Unknown linked task ID blocked',()=>{const s=sample();s.qa[0].taskId='UNKNOWN';shouldReject(s)});
test('Negative labor values blocked',()=>{const s=sample();s.labor=[{id:'L-1',hours:-5}];shouldReject(s)});
test('Malformed embedded evidence blocked',()=>{
 const s=sample();s.daily=[{id:'D-1',taskId:'T-001',attachments:[{id:'a',name:'x.png',type:'image/png',size:1,data:'javascript:alert(1)'}]}];shouldReject(s);
});
test('February 30 invalid',()=>assert.equal(E.validDate('2026-02-30'),false));
test('Zero QTO flags error',()=>{const s=sample();s.tasks[0].qty=0;assert.ok(E.issues(s).some(x=>x.includes('miktar')))});
test('Schedule finish before start flags error',()=>{
 const s=sample();s.tasks[0].start='2026-10-15';assert.ok(E.issues(s).some(x=>x.includes('başlangıçtan önce')));
});
test('Ten language navigation groups each have 12 labels',()=>{
 const m=html.match(/const LANG_NAV=(\{[\s\S]*?\});\nconst /);assert.ok(m);
 const nav=vm.runInNewContext('('+m[1]+')');
 assert.deepEqual(Object.keys(nav).sort().join(','),['tr','en','de','fr','es','ar','fa','ru','zh','ja'].sort().join(','));
 Object.values(nav).forEach(x=>assert.equal(x.length,12));
});
test('SI-USC conversion and JSON workflows are present',()=>{
 assert.match(html,/const USC=/);assert.match(html,/const SIof=/);
 assert.match(html,/function exportJson\(\)/);assert.match(html,/function importJson\(\)/);
});
test('Print report action exists',()=>assert.match(html,/window\.print\(/));
