'use strict';
/**
 * Product 03W regression tests.
 * Runs the ACTUAL deterministic SiteEngine embedded in index.html.
 * All names and documents here are synthetic; PASS is an input-field gate,
 * NOT an independent engineering certification or site approval.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('<script>/* Product 03W');
const end = html.indexOf('</script>', start);
assert.ok(start >= 0 && end > start, 'Embedded SiteEngine script found');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(html.slice(start + '<script>'.length, end), sandbox, {timeout: 5000, filename:'embedded-site-engine.js'});
const E = sandbox.module.exports;
assert.equal(typeof E.calc, 'function');
const clone = value => JSON.parse(JSON.stringify(value));

const initial = {
  schema: 3, mode:'REAL',
  project:{ name:'Site Control Test 001', number:'TEST-SC-001', reportDate:'2026-10-24', currency:'CAD', standardHours:8 },
  tasks:[{
    id:'T-001', title:'Temel betonu', wbs:'03.01', unit:'m³', qty:10, budget:2400,
    unitRate:240, start:'2026-10-24', finish:'2026-10-24', baselineHours:40,
    baselineApproved:true, baselineRef:'DOC-BL-001', sourceRef:'DOC-BOQ-001',
    qtoChecker:'Seyitali', qtoApproved:true,
    ssotVerified:false, ssotRef:'TEST-ONLY-SSOT-001', ssotChecker:''
  }],
  daily:[{id:'DAY-001', taskId:'T-001', date:'2026-10-24', qty:4, hours:16, people:2, cost:900}],
  qa:[{id:'QA-001', taskId:'T-001', status:'OPEN', evidence:'', inspector:'',
       note:'Test kaydıdır. Gerçek saha denetimi yapılmadı.'}],
  costs:[], rfis:[], materials:[], equipment:[], labor:[]
};
const workdayState = () => {
  const st=clone(initial);
  st.project.reportDate='2026-10-26';
  st.tasks[0].start=st.tasks[0].finish='2026-10-26';
  st.daily[0].date='2026-10-26';
  return st;
};
const approvedFieldState = () => {
  const st=workdayState();
  st.tasks[0].ssotVerified=true;
  st.tasks[0].ssotRef='DOC-SSOT-001';
  st.tasks[0].ssotChecker='Independent reviewer';
  st.qa[0].status='PASS';
  st.qa[0].evidence='DOC-QA-001';
  st.qa[0].inspector='Other inspector';
  return st;
};
const gate=(st,code)=>E.gates(st).rows.find(row=>row.code===code);
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7, actual+' != '+expected);

test('earned value, actual cost, planned value and performance ratios', () => {
  const c=E.calc(initial);
  assert.equal(c.BAC,2400); assert.equal(c.EV,960);
  assert.equal(c.PV,2400); assert.equal(c.AC,900);
  approx(c.progress,0.4); approx(c.SPI,0.4); approx(c.CPI,960/900);
  assert.equal(c.actualHours,16); assert.equal(c.earnedHours,16);
});
test('QTO, overtime and approved baseline data gate inputs',()=>{
  const st=workdayState();
  assert.equal(gate(st,'CHK-006').open,0);
  assert.equal(gate(st,'CHK-008').open,0);
  assert.equal(gate(st,'CHK-014').open,0);
  st.tasks[0].sourceRef='';
  assert.equal(gate(st,'CHK-006').open,1);
  st.tasks[0].sourceRef='DOC-BOQ-001';
  st.tasks[0].baselineRef='';
  assert.equal(gate(st,'CHK-014').open,1);
});
test('QA field gate rejects open or unsubstantiated inspections',()=>{
  const st=workdayState();
  assert.equal(gate(st,'CHK-010').open,1);
  st.qa[0].status='PASS';st.qa[0].evidence='DOC-QA-001';
  assert.equal(gate(st,'CHK-010').open,1);
  st.qa[0].inspector='Other inspector';
  assert.equal(gate(st,'CHK-010').open,0);
});
test('SSOT gate rejects missing or non-independent checker',()=>{
  const st=workdayState();
  assert.equal(gate(st,'CHK-015').open,1);
  st.tasks[0].ssotVerified=true;st.tasks[0].ssotRef='DOC-SSOT-001';st.tasks[0].ssotChecker='SEYITALI';
  assert.equal(gate(st,'CHK-015').open,1);
  st.tasks[0].ssotChecker='Independent reviewer';
  assert.equal(gate(st,'CHK-015').open,0);
});
test('Overtime must carry authorization and a reference',()=>{
  const st=workdayState();
  st.daily[0].hours=20;
  assert.equal(gate(st,'CHK-008').open,1);
  st.daily[0].overtimeApproved=true;
  assert.equal(gate(st,'CHK-008').open,1);
  st.daily[0].overtimeRef='DOC-OT-001';
  assert.equal(gate(st,'CHK-008').open,0);
});
test('Saturday-only baseline cannot be approved under Mon-Fri CPM calendar',()=>{
  assert.equal(E.workdays('2026-10-24','2026-10-24'),0);
  assert.equal(E.cpm(initial).valid,false);
  assert.equal(gate(initial,'CHK-014').open,1,
    'CHK-014 must agree with actual CPM duration rather than blindly trusting checkbox');
  assert.equal(E.release(initial).status,'HOLD');
});
test('Full release input-field gate passes for consistent synthetic weekday records',()=>{
  const st=approvedFieldState();
  assert.equal(E.gates(st).allPass,true);
  assert.equal(E.release(st).status,'PASS');
  assert.equal(E.release(st).problems.length,0);
});
test('Fake TEST-ONLY SSOT document always blocks global release',()=>{
  const st=approvedFieldState();
  st.tasks[0].ssotRef='TEST-ONLY-SSOT-001';
  assert.equal(gate(st,'CHK-015').open,0);
  assert.equal(E.release(st).status,'HOLD');
  assert.ok(E.release(st).problems.some(s=>s.includes('TEST/MOCK/DUMMY')));
});
test('Example project cannot receive global release',()=>{
  const st=approvedFieldState();
  st.project.isExample=true;
  assert.equal(E.release(st).status,'HOLD');
});
test('Future-dated daily records excluded from earned value and cost',()=>{
  const st=workdayState();
  st.project.reportDate='2026-10-25';
  const c=E.calc(st);
  assert.equal(c.AC,0);assert.equal(c.EV,0);assert.equal(c.actualHours,0);
});
test('Actual quantity over budget quantity cannot earn over 100 percent',()=>{
  const st=workdayState();st.daily[0].qty=20;
  assert.equal(E.calc(st).EV,2400);assert.equal(E.calc(st).progress,1);
});
test('Duplicate payment IDs detected',()=>{
  const st=workdayState();
  st.daily[0].paymentRef='INV-001';
  st.costs=[{id:'C-001',taskId:'T-001',date:'2026-10-26',amount:900,paymentRef:'INV-001'}];
  assert.ok(E.costWarnings(st).some(w=>w.type==='identity'));
  assert.ok(E.issues(st).some(w=>w.includes('Duplicate payment')));
});
test('Leap day and invalid calendar dates',()=>{
  assert.equal(E.validDate('2024-02-29'),true);
  assert.equal(E.validDate('2026-02-29'),false);
  assert.equal(E.validDate('2026-02-30'),false);
  assert.equal(E.validDate('2026-10-26'),true);
});
test('CPM forward/backward passes identify actual critical path',()=>{
  const st={tasks:[
    {id:'A',start:'2026-10-19',finish:'2026-10-20'},
    {id:'B',start:'2026-10-21',finish:'2026-10-23',predecessors:'A'},
    {id:'C',start:'2026-10-21',finish:'2026-10-21',predecessors:'A'},
    {id:'D',start:'2026-10-26',finish:'2026-10-26',predecessors:'B,C'}
  ]};
  const out=E.cpm(st);
  assert.equal(out.valid,true);assert.equal(out.duration,6);
  assert.equal(JSON.stringify(out.criticalIds),JSON.stringify(['A','B','D']));
  assert.equal(out.items.find(x=>x.id==='C').totalFloat,2);
});
test('CPM cyclic predecessors are rejected',()=>{
  const out=E.cpm({tasks:[
    {id:'A',start:'2026-10-19',finish:'2026-10-19',predecessors:'B'},
    {id:'B',start:'2026-10-20',finish:'2026-10-20',predecessors:'A'}
  ]});
  assert.equal(out.valid,false);assert.ok(out.errors.some(x=>x.includes('cyclic')));
});
test('Import validates schema and referenced task codes',()=>{
  assert.throws(()=>E.safeImport({...workdayState(),schema:5}),/şema/);
  const st=workdayState();st.daily[0].taskId='MISSING';
  assert.throws(()=>E.safeImport(st),/bilinmeyen iş kodu/);
});
test('Project files are canonical SI even when UI preference uses USC',()=>{
  const st=workdayState();st.project.unitSystem='USC';
  const imported=E.safeImport(st);
  assert.equal(imported.project.unitSystem,'SI');
  assert.equal(imported.tasks[0].qty,10);
});
test('Evidence attachment survives JSON roundtrip without changing release status',()=>{
  const st=workdayState();
  st.daily[0].attachments=[{id:'IMG-1',name:'photo.png',type:'image/png',size:70,data:'data:image/png;base64,abc'}];
  const imported=E.safeImport(JSON.parse(JSON.stringify(st)));
  assert.equal(imported.daily[0].attachments.length,1);
  assert.equal(imported.daily[0].attachments[0].name,'photo.png');
  assert.equal(E.release(imported).status,'HOLD');
});
