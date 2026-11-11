'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = fs.readFileSync('index.html','utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
assert.ok(scripts.length >= 2,'Expected application scripts in published index.html');
const context = {module:{exports:{}},Date,Number,String,Math,Map,Set,JSON,Error,RegExp,console};
vm.createContext(context);
vm.runInContext(scripts[0],context,{timeout:3000,filename:'site-engine.js'});
const E = context.module.exports;
assert.ok(E&&typeof E.calc==='function'&&typeof E.gates==='function');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const s=E.newProject();
 s.project={name:'Acceptance test',number:'QA-AUTO-001',currency:'CAD',reportDate:'2026-10-26',standardHours:8,isExample:false,unitSystem:'SI'};
 s.tasks=[{id:'T-001',title:'Foundation concrete',qty:10,budget:2400,unitRate:240,unit:'m³',
  baselineHours:40,start:'2026-10-26',finish:'2026-10-26',baselineApproved:true,baselineRef:'BL-REV-01',
  sourceRef:'BOQ-03.01',qtoChecker:'Engineer One',qtoApproved:true,
  ssotRef:'SSOT-REVIEW-01',ssotChecker:'Independent Engineer Two',ssotVerified:true}];
 s.daily=[{id:'DAY-001',taskId:'T-001',date:'2026-10-26',qty:4,hours:16,people:2,cost:900,overtimeApproved:false}];
 s.qa=[{id:'QA-001',taskId:'T-001',status:'PASS',inspector:'Inspector Three',evidence:'QA-REPORT-2026-01'}];
 return s;
}
function gate(s,id){return E.gates(s).rows.find(r=>r.code===id);}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-6, String(a)+' != '+String(b));}

test('Production HTML includes versioned Product 03W title',()=>assert.match(html,/<title>Product 03W[^<]*REV 3\.11\.\d+<\/title>/));
test('All embedded Javascript scripts pass parsing',()=>{for(const [i,js] of scripts.entries())assert.doesNotThrow(()=>new vm.Script(js,{filename:'inline-'+i+'.js'}));});
test('Engine exposes expected functions',()=>['newProject','calc','gates','release','safeImport','cpm','workdays','costWarnings','validDate'].forEach(k=>assert.equal(typeof E[k],'function')));
test('new project has eight clean record arrays',()=>{const s=E.newProject();['tasks','daily','costs','qa','rfis','materials','equipment','labor'].forEach(k=>assert.equal(s[k].length,0));});
test('EVM values are BAC 2400, EV 960, PV 2400, AC 900',()=>{const x=E.calc(fixture());assert.equal(x.BAC,2400);assert.equal(x.EV,960);assert.equal(x.PV,2400);assert.equal(x.AC,900);approx(x.progress,.4);approx(x.SPI,.4);approx(x.CPI,960/900);});
test('Days after reporting date never counted as actual',()=>{const s=fixture();s.daily[0].date='2026-10-27';const x=E.calc(s);assert.equal(x.EV,0);assert.equal(x.AC,0);assert.equal(x.actualHours,0);});
test('Overproduction caps earned value at BAC',()=>{const s=fixture();s.daily[0].qty=50;assert.equal(E.calc(s).EV,2400);});
test('Independent cost ledger adds to actual costs once',()=>{const s=fixture();s.costs.push({id:'C-01',taskId:'T-001',date:'2026-10-26',amount:75});assert.equal(E.calc(s).AC,975);});
test('Five evidence gates pass on fully populated non-test fixture',()=>{const s=fixture();assert.equal(E.gates(s).allPass,true);assert.equal(E.gates(s).holdCount,0);assert.equal(E.release(s).status,'PASS');});
test('Empty project cannot be released',()=>assert.equal(E.release(E.newProject()).status,'HOLD'));
test('Example project forced HOLD despite good fields',()=>{const s=fixture();s.project.isExample=true;assert.equal(E.release(s).status,'HOLD');});
test('QTO gate refuses absent checked source',()=>{const s=fixture();s.tasks[0].qtoApproved=false;assert.equal(gate(s,'CHK-006').open,1);});
test('SSOT gate refuses missing independent controller',()=>{const s=fixture();s.tasks[0].ssotChecker='';assert.equal(gate(s,'CHK-015').open,1);});
test('SSOT gate refuses same QTO reviewer and SSOT reviewer',()=>{const s=fixture();s.tasks[0].ssotChecker='ENGINEER ONE';assert.equal(gate(s,'CHK-015').open,1);});
test('SSOT gate refuses unchecked approval flag',()=>{const s=fixture();s.tasks[0].ssotVerified=false;assert.equal(gate(s,'CHK-015').open,1);});
test('QA gate refuses OPEN inspection',()=>{const s=fixture();s.qa[0].status='OPEN';assert.equal(gate(s,'CHK-010').open,1);});
test('QA gate refuses missing inspection evidence',()=>{const s=fixture();s.qa[0].evidence='';assert.equal(gate(s,'CHK-010').open,1);});
test('QA gate refuses missing inspector',()=>{const s=fixture();s.qa[0].inspector='';assert.equal(gate(s,'CHK-010').open,1);});
test('Baseline gate refuses missing signed reference',()=>{const s=fixture();s.tasks[0].baselineRef='';assert.equal(gate(s,'CHK-014').open,1);});
test('Overtime gate refuses unauthorized overtime',()=>{const s=fixture();s.daily[0].hours=17;assert.equal(gate(s,'CHK-008').open,1);});
test('Overtime gate passes reference plus approval',()=>{const s=fixture();s.daily[0].hours=17;s.daily[0].overtimeApproved=true;s.daily[0].overtimeRef='OT-AUTH-23';assert.equal(gate(s,'CHK-008').open,0);});
test('Fake TEST-only SSOT reference prevents overall release',()=>{const s=fixture();s.tasks[0].ssotRef='TEST-ONLY-SSOT-001';assert.equal(E.gates(s).allPass,true);assert.equal(E.release(s).status,'HOLD');assert.ok(E.release(s).problems.some(p=>p.includes('TEST')));});
test('Duplicate payment identity prevents overall release',()=>{const s=fixture();s.daily[0].paymentRef='INV-123';s.costs.push({id:'C-1',taskId:'T-001',date:'2026-10-26',amount:900,paymentRef:'INV-123'});assert.equal(E.release(s).status,'HOLD');});
test('Invalid and leap dates',()=>{assert.equal(E.validDate('2026-02-29'),false);assert.equal(E.validDate('2024-02-29'),true);assert.equal(E.validDate('2026-13-01'),false);});
test('Safe JSON import/export keeps project and records',()=>{const s=fixture();const copied=E.safeImport(clone(s));assert.equal(copied.project.name,s.project.name);assert.equal(copied.tasks[0].qty,10);assert.equal(copied.daily[0].cost,900);});
test('Safe import rejects incompatible schema',()=>{const s=fixture();s.schema=999;assert.throws(()=>E.safeImport(s));});
test('Safe import rejects negative quantities and duplicate IDs',()=>{const s=fixture();s.tasks[0].qty=-1;assert.throws(()=>E.safeImport(s));const z=fixture();z.daily.push(clone(z.daily[0]));assert.throws(()=>E.safeImport(z));});
test('Safe import rejects unknown work code',()=>{const s=fixture();s.daily[0].taskId='MISSING';assert.throws(()=>E.safeImport(s));});
test('Safe import accepts valid small photo attachment',()=>{const s=fixture();s.daily[0].attachments=[{id:'A-001',name:'photo.png',type:'image/png',size:3,data:'data:image/png;base64,AAAA'}];assert.equal(E.safeImport(s).daily[0].attachments.length,1);});
test('Safe import rejects malformed attachment payload',()=>{const s=fixture();s.daily[0].attachments=[{id:'A-001',name:'bad',type:'image/png',size:100,data:'javascript:alert(1)'}];assert.throws(()=>E.safeImport(s));});
test('Safe import rejects more than four daily photos',()=>{const s=fixture();s.daily[0].attachments=Array.from({length:5},(_,i)=>({id:'A'+i,name:'img.png',type:'image/png',size:3,data:'data:image/png;base64,AAAA'}));assert.throws(()=>E.safeImport(s));});
test('CPM finish-to-start chain computes critical path',()=>{const s=fixture();s.tasks=[{id:'A',start:'2026-10-26',finish:'2026-10-27'},{id:'B',start:'2026-10-28',finish:'2026-10-28',predecessors:'A'}];const c=E.cpm(s);assert.equal(c.valid,true);assert.equal(c.duration,3);assert.equal(c.criticalIds.join(','),'A,B');assert.equal(c.items[1].ES,2);});
test('CPM rejects cyclic dependencies',()=>{const s=fixture();s.tasks=[{id:'A',start:'2026-10-26',finish:'2026-10-26',predecessors:'B'},{id:'B',start:'2026-10-27',finish:'2026-10-27',predecessors:'A'}];assert.equal(E.cpm(s).valid,false);});
test('CPM rejects missing predecessor and weekend only duration',()=>{const s=fixture();s.tasks=[{id:'A',start:'2026-10-24',finish:'2026-10-25',predecessors:'X'}];assert.equal(E.cpm(s).valid,false);});
test('Report calculation ignores future costs in ledger',()=>{const s=fixture();s.costs.push({id:'C-1',taskId:'T-001',date:'2026-10-27',amount:250});assert.equal(E.calc(s).AC,900);});
test('Missing approved baseline remains HOLD even with all other gates passed',()=>{const s=fixture();s.tasks[0].baselineApproved=false;assert.equal(E.release(s).status,'HOLD');});
