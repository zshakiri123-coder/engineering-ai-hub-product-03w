'use strict';
/* Product 03W: run with node --test tests/sitecontrol-engine.test.cjs
 * No external dependencies. Tests execute the REAL engine embedded in index.html.
 * These are software validation scenarios, NOT independent field approvals.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.ok(scripts.length>=3,'Expected real application scripts');
const sandbox={module:{exports:{}}};
vm.runInNewContext(scripts[0],sandbox,{timeout:3000});
const E=sandbox.module.exports;
assert.equal(typeof E.release,'function');
function sample(){
 const s=E.newProject();
 s.project={name:'Site Control Test 001',number:'TEST-SC-001',reportDate:'2026-10-24',currency:'CAD',standardHours:8};
 s.tasks=[{id:'T-001',title:'Temel betonu',wbs:'03.01',unit:'m³',qty:10,budget:2400,unitRate:240,
 start:'2026-10-24',finish:'2026-10-24',baselineHours:40,baselineApproved:true,baselineRef:'TEST-BL-REV00',
 sourceRef:'TEST-BOQ-03.01',qtoChecker:'Seyitali',qtoApproved:true,
 ssotVerified:false,ssotRef:'TEST-ONLY-SSOT-001',ssotChecker:''}];
 s.daily=[{id:'DAY-001',taskId:'T-001',date:'2026-10-24',qty:4,hours:16,people:2,cost:900}];
 s.qa=[{id:'QA-001',taskId:'T-001',status:'OPEN',evidence:'',inspector:'',note:'Test kaydıdır. Gerçek denetim yapılmadı.'}];
 return s;
}
const metrics=E.calc(sample());
for(const [field,value] of Object.entries({BAC:2400,EV:960,PV:2400,AC:900,SPI:.4,progress:.4,plannedProgress:1,actualHours:16,earnedHours:16}))
 test('benchmark '+field,()=>assert.equal(metrics[field],value));
test('benchmark CPI',()=>assert.ok(Math.abs(metrics.CPI-960/900)<1e-7));
test('benchmark physical quantity',()=>assert.equal(metrics.items[0].actualQty,4));
test('benchmark has 5 gates',()=>assert.equal(E.gates(sample()).rows.length,5));
for(const [code,count] of Object.entries({'CHK-006':0,'CHK-008':0,'CHK-010':1,'CHK-014':0,'CHK-015':1}))
 test('benchmark gate '+code,()=>assert.equal(E.gates(sample()).rows.find(g=>g.code===code).open,count));
test('overall test release stays HOLD',()=>assert.equal(E.release(sample()).status,'HOLD'));
test('test references rejected for official release',()=>assert.match(E.release(sample()).problems.join(' '),/TEST\/MOCK\/DUMMY/));
test('open QA stays HOLD',()=>{const s=sample();s.qa[0].evidence='DOC-QA';s.qa[0].inspector='Inspector';assert.equal(E.gates(s).rows[2].open,1);});
test('empty QA stays HOLD',()=>{const s=sample();s.qa=[];assert.equal(E.gates(s).rows[2].open,1);});
test('SSOT requires verified true',()=>{const s=sample();s.tasks[0].ssotChecker='Independent';assert.equal(E.gates(s).rows[4].open,1);});
test('independent SSOT cannot have same QTO checker (case-insensitive)',()=>{
 const s=sample();s.tasks[0].sourceRef='DRG-1';s.tasks[0].baselineRef='BL-1';s.tasks[0].ssotRef='SS-1';
 s.tasks[0].ssotVerified=true;s.tasks[0].qtoChecker='Alice';s.tasks[0].ssotChecker=' alice ';
 assert.equal(E.gates(s).rows[4].open,1);
});
test('independent SSOT with different checker may clear its gate',()=>{
 const s=sample();s.tasks[0].ssotVerified=true;s.tasks[0].ssotChecker='Independent Reviewer';
 assert.equal(E.gates(s).rows[4].open,0);
});
test('all gate fields can pass with non-mock refs; not field authenticity',()=>{
 const s=sample();s.tasks[0].sourceRef='DRG-001';s.tasks[0].baselineRef='BL-001';
 s.tasks[0].ssotRef='REV-001';s.tasks[0].ssotVerified=true;s.tasks[0].ssotChecker='Reviewer B';
 s.qa[0]={id:'QA-001',taskId:'T-001',status:'PASS',evidence:'INS-001',inspector:'Reviewer C'};
 assert.equal(E.gates(s).allPass,true);assert.equal(E.release(s).status,'PASS');
});
test('mock QA evidence blocks final release even with gate PASS',()=>{
 const s=sample();s.tasks[0].sourceRef='DRG-001';s.tasks[0].baselineRef='BL-001';
 s.tasks[0].ssotRef='REV-001';s.tasks[0].ssotVerified=true;s.tasks[0].ssotChecker='Reviewer B';
 s.qa[0]={id:'QA-001',taskId:'T-001',status:'PASS',evidence:'TEST-QA-001',inspector:'Reviewer C'};
 assert.equal(E.gates(s).allPass,true);assert.equal(E.release(s).status,'HOLD');
});
test('sample project cannot release',()=>{
 const s=sample();s.project.isExample=true;
 s.tasks[0].sourceRef='DRG-001';s.tasks[0].baselineRef='BL-001';
 s.tasks[0].ssotRef='REV-001';s.tasks[0].ssotVerified=true;s.tasks[0].ssotChecker='Reviewer B';
 s.qa[0]={id:'QA-001',taskId:'T-001',status:'PASS',evidence:'INS-001',inspector:'Reviewer C'};
 assert.equal(E.release(s).status,'HOLD');
});
test('cost ledger counted once',()=>{const s=sample();s.costs=[{id:'C-1',date:'2026-10-24',amount:100}];assert.equal(E.calc(s).AC,1000);});
test('future daily excluded',()=>{const s=sample();s.daily[0].date='2026-10-25';assert.equal(E.calc(s).AC,0);assert.equal(E.calc(s).EV,0);});
test('daily overtime detected',()=>{const s=sample();s.daily[0].hours=17;assert.equal(E.gates(s).rows[1].open,1);});
test('approved overtime cleared',()=>{const s=sample();Object.assign(s.daily[0],{hours:17,overtimeApproved:true,overtimeRef:'OT-001'});assert.equal(E.gates(s).rows[1].open,0);});
test('overtime numeric ref no crash',()=>{const s=sample();Object.assign(s.daily[0],{hours:17,overtimeApproved:true,overtimeRef:123});assert.equal(E.gates(s).rows[1].open,1);});
test('QA numeric evidence no crash',()=>{const s=sample();s.qa[0].status='PASS';s.qa[0].inspector='Name';s.qa[0].evidence=123;assert.equal(E.gates(s).rows[2].open,1);});
test('QTO numeric ref no crash',()=>{const s=sample();s.tasks[0].sourceRef=123;assert.equal(E.gates(s).rows[0].open,1);});
test('reject malformed QTO ref on import',()=>{const s=sample();s.tasks[0].sourceRef=123;assert.throws(()=>E.safeImport(s),/sourceRef/);});
test('reject malformed QA evidence on import',()=>{const s=sample();s.qa[0].evidence=123;assert.throws(()=>E.safeImport(s),/evidence/);});
test('negative daily quantity rejected on import',()=>{const s=sample();s.daily[0].qty=-2;assert.throws(()=>E.safeImport(s));});
test('duplicate tasks rejected on import',()=>{const s=sample();s.tasks.push({...s.tasks[0]});assert.throws(()=>E.safeImport(s));});
test('unknown task reference rejected on import',()=>{const s=sample();s.daily[0].taskId='UNKNOWN';assert.throws(()=>E.safeImport(s));});
test('valid import preserves quantities and mandatory schema',()=>{
 const s=E.safeImport(sample());assert.equal(s.schema,3);assert.equal(s.project.unitSystem,'SI');assert.equal(s.daily[0].qty,4);
});
test('image attachment roundtrip',()=>{
 const s=sample();s.daily[0].attachments=[{id:'IMG-1',name:'evidence.png',type:'image/png',size:3,data:'data:image/png;base64,YWJj'}];
 const r=E.safeImport(JSON.parse(JSON.stringify(s)));assert.equal(r.daily[0].attachments.length,1);assert.equal(r.daily[0].attachments[0].data,'data:image/png;base64,YWJj');
});
test('no more than 4 daily images',()=>{
 const s=sample();s.daily[0].attachments=Array.from({length:5},(_,i)=>({id:'IMG-'+i,name:'a.png',type:'image/png',size:3,data:'data:image/png;base64,YWJj'}));
 assert.throws(()=>E.safeImport(s));
});
test('excess completion capped in EV',()=>{const s=sample();s.daily[0].qty=12;assert.equal(E.calc(s).EV,2400);});
test('missing baseline finish HOLD',()=>{const s=sample();s.tasks[0].finish='';assert.equal(E.gates(s).rows[3].open,1);});
test('missing source reference HOLD',()=>{const s=sample();s.tasks[0].sourceRef='';assert.equal(E.gates(s).rows[0].open,1);});
test('calendar leap date valid',()=>assert.equal(E.validDate('2024-02-29'),true));
test('impossible calendar date rejected',()=>assert.equal(E.validDate('2026-02-30'),false));
test('negative actual cost issue',()=>{const s=sample();s.daily[0].cost=-100;assert.ok(E.issues(s).length>0);});
test('invalid report date issue',()=>{const s=sample();s.project.reportDate='2026-13-31';assert.ok(E.issues(s).length>0);});
test('multilingual nav 10 languages',()=>{for(const lang of ['tr','en','fr','de','es','ar','fa','ru','zh','ja'])assert.ok(html.includes(lang+':[')||html.includes(lang+': ['),'missing '+lang);});
