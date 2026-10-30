'use strict';
/* Product 03W deterministic regression suite. Run: node --test tests/engine-regression.test.cjs
   PASS here confirms programmed behaviour, not physical site inspection or document authenticity. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const begin=html.indexOf('<script>/* Product 03W');
assert.ok(begin>=0,'SiteEngine source present');
const end=html.indexOf('</script>',begin);
assert.ok(end>begin,'Engine script closed');
const source=html.slice(begin+8,end);
const isolatedModule={exports:{}};
new Function('module',source)(isolatedModule);
const E=isolatedModule.exports;
function base(){
 const s=E.newProject();
 s.project={name:'Factory A',reportDate:'2026-10-24',standardHours:8,currency:'CAD',isExample:false};
 s.tasks=[{id:'T-001',title:'Foundation',qty:10,budget:2400,baselineHours:40,
  start:'2026-10-24',finish:'2026-10-24',sourceRef:'BOQ-03.01',
  qtoChecker:'Inspector',qtoApproved:true,baselineApproved:true,baselineRef:'BL-REV00',
  ssotRef:'SSOT-001',ssotChecker:'Independent',ssotVerified:true}];
 s.daily=[{id:'D-001',taskId:'T-001',date:'2026-10-24',qty:4,hours:16,people:2,cost:900}];
 s.qa=[{id:'QA-001',taskId:'T-001',title:'Foundation QA',status:'PASS',
  inspector:'Inspector',evidence:'INS-001'}];
 return s;
}
const check=(name,fn)=>test(name,()=>assert.ok(fn()));
const near=(a,b)=>Math.abs(a-b)<1e-6;
check('Exports full API',()=>['newProject','calc','gates','release','validDate','safeImport','issues'].every(k=>typeof E[k]==='function'));
check('Schema version 3',()=>E.newProject().schema===3);
check('Empty project HOLD',()=>E.release(E.newProject()).status==='HOLD');
for(const index of [0,2,3,4])check('Empty gate '+index+' HOLD',()=>E.gates(E.newProject()).rows[index].open===1);
check('All 5 gates pass with complete fixture',()=>E.gates(base()).allPass);
check('Full ordinary fixture release PASS (field completeness only)',()=>E.release(base()).status==='PASS');
const expected={BAC:2400,EV:960,PV:2400,AC:900,CPI:1.06666667,SPI:0.4,progress:0.4,plannedProgress:1,actualHours:16,earnedHours:16};
for(const [key,value] of Object.entries(expected))check('Engine computes '+key,()=>near(E.calc(base())[key],value));
const gateCases=[
 ['QTO unapproved',0,s=>s.tasks[0].qtoApproved=false],
 ['QTO source missing',0,s=>s.tasks[0].sourceRef=''],
 ['QTO invalid budget',0,s=>s.tasks[0].budget='oops'],
 ['QA OPEN',2,s=>s.qa[0].status='OPEN'],
 ['QA evidence missing',2,s=>s.qa[0].evidence=''],
 ['QA inspector missing',2,s=>s.qa[0].inspector=''],
 ['Baseline unapproved',3,s=>s.tasks[0].baselineApproved=false],
 ['Baseline reference missing',3,s=>s.tasks[0].baselineRef=''],
 ['Baseline hours missing',3,s=>delete s.tasks[0].baselineHours],
 ['SSOT unverified',4,s=>s.tasks[0].ssotVerified=false],
 ['SSOT checker missing',4,s=>s.tasks[0].ssotChecker=''],
 ['SSOT reference missing',4,s=>s.tasks[0].ssotRef='']
];
for(const [name,index,mutate] of gateCases)check(name+' -> HOLD',()=>{const s=base();mutate(s);return E.gates(s).rows[index].open===1});
check('Overtime without approval HOLD',()=>{const s=base();s.daily[0].hours=17;return E.gates(s).rows[1].open===1});
check('Overtime properly approved PASS',()=>{const s=base();s.daily[0].hours=17;s.daily[0].overtimeApproved=true;s.daily[0].overtimeRef='OT-001';return E.gates(s).rows[1].open===0});
check('Future daily excluded from EV and AC',()=>{const s=base();s.daily[0].date='2026-10-25';return E.calc(s).EV===0&&E.calc(s).AC===0});
check('Progress capped at plan quantity',()=>{const s=base();s.daily[0].qty=20;return E.calc(s).EV===2400});
check('Separate actual cost included',()=>{const s=base();s.costs=[{id:'C-001',date:'2026-10-24',amount:50}];return E.calc(s).AC===950});
check('Duplicate task detected',()=>{const s=base();s.tasks.push({...s.tasks[0]});return E.issues(s).some(x=>x.includes('Tekrarlı'))});
check('Dangling daily task reference detected',()=>{const s=base();s.daily[0].taskId='NONE';return E.issues(s).some(x=>x.includes('bilinmeyen'))});
check('Invalid daily quantity detected',()=>{const s=base();s.daily[0].qty=-3;return E.issues(s).length>0});
check('Invalid budget detected',()=>{const s=base();s.tasks[0].budget='BAD';return E.issues(s).length>0});
check('Invalid leap date rejected',()=>!E.validDate('2026-02-29'));
check('Valid leap date accepted',()=>E.validDate('2024-02-29'));
check('Five weekday span',()=>E.workdays('2026-10-26','2026-10-30')===5);
check('Weekend workdays zero',()=>E.workdays('2026-10-24','2026-10-25')===0);
check('JSON import good roundtrip',()=>E.safeImport(base()).tasks.length===1);
check('JSON invalid schema rejected',()=>{try{E.safeImport({schema:1,project:{}});return false}catch{return true}});
check('Example project cannot release',()=>{const s=base();s.project.isExample=true;return E.release(s).status==='HOLD'});
for(const [name,mutate] of [
 ['QA test evidence',s=>s.qa[0].evidence='TEST-ONLY-QA-001'],
 ['QTO test source',s=>s.tasks[0].sourceRef='TEST-BOQ-001'],
 ['Baseline test document',s=>s.tasks[0].baselineRef='TEST-BL-001'],
 ['Independent test document',s=>s.tasks[0].ssotRef='TEST-ONLY-SSOT-001']])
 check(name+' cannot release',()=>{const s=base();mutate(s);return E.release(s).status==='HOLD'});
