'use strict';
// Product 03W acceptance tests: isolate the actual no-dependency SiteEngine from the deployed index.html.
// Test records are synthetic; no result constitutes real engineering/site approval.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const scriptTags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.ok(scriptTags.length>=2,'No application JavaScript found');
let parsed=0;
for(const m of scriptTags){
 if(/type\s*=\s*["']application\/json["']/i.test(m[1]))continue;
 new vm.Script(m[2],{filename:'index.html (inline script '+(++parsed)+')'});
}
const engine=scriptTags.find(m=>m[2].includes('Product 03W • Site Control engine'));
assert.ok(engine,'Cannot find actual deterministic SiteEngine');
const ctx=vm.createContext({});
vm.runInContext(engine[2],ctx,{timeout:5000,filename:'index.html:SiteEngine'});
const E=ctx.SiteEngine;
assert.ok(E&&typeof E.calc==='function'&&typeof E.release==='function','Missing SiteEngine exports');
const clean=o=>JSON.parse(JSON.stringify(o));
const copy=o=>JSON.parse(JSON.stringify(o));
const testCases=[];
function test(name,fn){testCases.push({name,fn});}
function fixture(){
 const s=E.newProject();
 s.project={name:'Synthetic automated test',number:'QA-SYN-001',currency:'CAD',reportDate:'2026-10-24',standardHours:8,isExample:false};
 s.tasks=[{id:'T-001',title:'Foundation concrete',wbs:'03.01',unit:'m³',qty:10,unitRate:240,budget:2400,baselineHours:40,start:'2026-10-24',finish:'2026-10-24',sourceRef:'BOQ-03.01',qtoChecker:'A Reviewer',qtoApproved:true,baselineApproved:true,baselineRef:'BL-APP-01',ssotVerified:true,ssotRef:'SSOT-APP-01',ssotChecker:'B Reviewer'}];
 s.daily=[{id:'DAY-001',date:'2026-10-24',taskId:'T-001',qty:4,hours:16,people:2,cost:900}];
 s.qa=[{id:'QA-001',taskId:'T-001',status:'PASS',inspector:'C Inspector',evidence:'QC-INSPECTION-01'}];
 return s;
}
function gate(s,code){return E.gates(s).rows.find(x=>x.code===code);}
function close(a,b,eps=1e-7){assert.ok(Math.abs(a-b)<=eps,'Expected '+a+' to be near '+b);}
test('The deployed HTML has parsable JavaScript and deterministic SiteEngine',()=>assert.ok(parsed>=2));
test('Empty real project stays on HOLD',()=>assert.equal(E.release(E.newProject()).status,'HOLD'));
test('Synthetic complete fixture passes all 5 software-field gates',()=>{const s=fixture(),g=E.gates(s);assert.equal(g.rows.length,5);assert.equal(g.allPass,true);assert.equal(E.release(s).status,'PASS');});
test('BAC/EV/PV/AC and man-hours match hand computations',()=>{const r=E.calc(fixture());close(r.BAC,2400);close(r.EV,960);close(r.PV,2400);close(r.AC,900);close(r.actualHours,16);close(r.earnedHours,16);close(r.progress,.4);close(r.SPI,.4);close(r.CPI,960/900);});
test('QTO gate fails without source reference',()=>{const s=fixture();s.tasks[0].sourceRef='';assert.equal(gate(s,'CHK-006').open,1);assert.equal(E.release(s).status,'HOLD');});
test('QTO gate fails when approval flag is false',()=>{const s=fixture();s.tasks[0].qtoApproved=false;assert.equal(gate(s,'CHK-006').open,1);});
test('QTO gate fails without engineer reviewer',()=>{const s=fixture();s.tasks[0].qtoChecker='';assert.equal(gate(s,'CHK-006').open,1);});
test('Overtime gate passes at exactly normal crew capacity',()=>{const s=fixture();assert.equal(gate(s,'CHK-008').open,0);});
test('Overtime gate holds unauthorized overtime',()=>{const s=fixture();s.daily[0].hours=17;assert.equal(gate(s,'CHK-008').open,1);assert.equal(E.release(s).status,'HOLD');});
test('Overtime gate allows explicitly approved overtime with reference',()=>{const s=fixture();s.daily[0].hours=17;s.daily[0].overtimeApproved=true;s.daily[0].overtimeRef='OT-AUTH-01';assert.equal(gate(s,'CHK-008').open,0);});
test('QA gate holds open inspection with no real evidence',()=>{const s=fixture();s.qa[0].status='OPEN';s.qa[0].inspector='';s.qa[0].evidence='';assert.equal(gate(s,'CHK-010').open,1);assert.equal(E.release(s).status,'HOLD');});
test('QA gate holds PASS status with missing inspector',()=>{const s=fixture();s.qa[0].inspector='';assert.equal(gate(s,'CHK-010').open,1);});
test('QA gate holds PASS status with missing evidence reference',()=>{const s=fixture();s.qa[0].evidence='';assert.equal(gate(s,'CHK-010').open,1);});
test('CPM baseline gate holds invalid start/finish',()=>{const s=fixture();s.tasks[0].finish='2026-10-20';assert.equal(gate(s,'CHK-014').open,1);});
test('CPM baseline gate holds missing authorized reference',()=>{const s=fixture();s.tasks[0].baselineRef='';assert.equal(gate(s,'CHK-014').open,1);});
test('CPM baseline gate holds unapproved baseline',()=>{const s=fixture();s.tasks[0].baselineApproved=false;assert.equal(gate(s,'CHK-014').open,1);});
test('Independent SSOT gate holds missing verification checkbox',()=>{const s=fixture();s.tasks[0].ssotVerified=false;assert.equal(gate(s,'CHK-015').open,1);});
test('Independent SSOT gate holds missing controller',()=>{const s=fixture();s.tasks[0].ssotChecker='';assert.equal(gate(s,'CHK-015').open,1);});
test('Independent SSOT gate blocks identical reviewers regardless of case/space',()=>{const s=fixture();s.tasks[0].ssotChecker=' a reviewer ';assert.equal(gate(s,'CHK-015').open,1);});
test('Test-only SSOT document cannot obtain release PASS',()=>{const s=fixture();s.tasks[0].ssotRef='TEST-ONLY-SSOT-001';assert.equal(gate(s,'CHK-015').open,0);const r=E.release(s);assert.equal(r.status,'HOLD');assert.match(r.problems.join('; '),/TEST\/MOCK\/DUMMY/);});
test('Test-only BOQ and baseline documents block release',()=>{for(const field of ['sourceRef','baselineRef']){const s=fixture();s.tasks[0][field]='MOCK-REF-01';assert.equal(E.release(s).status,'HOLD');}});
test('Test-only QC evidence blocks overall release',()=>{const s=fixture();s.qa[0].evidence='TEST-QA-01';assert.equal(E.release(s).status,'HOLD');});
test('Explicit sample project cannot pass release',()=>{const s=fixture();s.project.isExample=true;assert.equal(E.release(s).status,'HOLD');});
test('Negative quantities and budgets are rejected by consistency validator',()=>{for(const k of ['qty','budget']){const s=fixture();s.tasks[0][k]=-5;assert.ok(E.issues(s).length>0);assert.equal(E.release(s).status,'HOLD');}});
test('Duplicate task IDs are detected',()=>{const s=fixture();s.tasks.push({...s.tasks[0]});assert.match(E.issues(s).join(' '),/Tekrarlı|duplicate/i);});
test('Payment identity duplicated in daily and costs is flagged',()=>{const s=fixture();s.daily[0].paymentRef='INV-001';s.costs=[{id:'C-001',taskId:'T-001',date:'2026-10-24',amount:900,paymentRef:'INV-001'}];assert.ok(E.costWarnings(s).some(w=>w.type==='identity'));assert.equal(E.release(s).status,'HOLD');});
test('Later daily logs are excluded at report date',()=>{const s=fixture();s.daily.push({id:'DAY-002',date:'2026-10-25',taskId:'T-001',qty:10,hours:8,people:1,cost:500});const r=E.calc(s);close(r.EV,960);close(r.AC,900);});
test('Earned value caps at authorized task quantity',()=>{const s=fixture();s.daily[0].qty=40;const r=E.calc(s);close(r.EV,2400);close(r.progress,1);});
test('Valid CPM chain gives expected ES EF LS LF float',()=>{const s=fixture();s.tasks=[{id:'A',start:'2026-11-02',finish:'2026-11-03'},{id:'B',start:'2026-11-04',finish:'2026-11-05',predecessors:'A'}];const r=E.cpm(s);assert.equal(r.valid,true);assert.equal(r.duration,4);assert.equal(r.items[0].EF,2);assert.equal(r.items[1].ES,2);assert.equal(r.items[1].LF,4);assert.equal(r.items[0].totalFloat,0);});
test('Cycle and missing CPM predecessor both fail safely',()=>{const s=fixture();s.tasks=[{id:'A',start:'2026-11-02',finish:'2026-11-02',predecessors:'B'},{id:'B',start:'2026-11-03',finish:'2026-11-03',predecessors:'A'}];assert.equal(E.cpm(s).valid,false);s.tasks[0].predecessors='UNKNOWN';assert.equal(E.cpm(s).valid,false);});
test('JSON import round-trip retains image attachment content',()=>{const s=fixture();s.daily[0].attachments=[{id:'IMG-1',name:'photo.png',type:'image/png',size:1,data:'data:image/png;base64,AA=='}];const imported=E.safeImport(copy(s));assert.equal(imported.daily[0].attachments[0].data,s.daily[0].attachments[0].data);assert.equal(imported.project.unitSystem,'SI');});
test('JSON import rejects wrong schema and duplicate record IDs',()=>{const a=fixture();a.schema=2;assert.throws(()=>E.safeImport(a));const b=fixture();b.daily.push({...b.daily[0]});assert.throws(()=>E.safeImport(b));});
test('JSON import rejects forged missing task link',()=>{const s=fixture();s.daily[0].taskId='UNKNOWN';assert.throws(()=>E.safeImport(s));});
test('JSON import rejects malformed image attachment',()=>{const s=fixture();s.daily[0].attachments=[{id:'x',name:'file.png',type:'image/png',size:1,data:'javascript:alert(1)'}];assert.throws(()=>E.safeImport(s));});
test('Ten languages are present in UI navigation table',()=>{for(const code of ['tr','en','fr','de','es','ar','zh','ru','fa','ja'])assert.match(html,new RegExp('\\b'+code+':\\s*\\['));});

let ok=0,failed=0;
for(const t of testCases){try{t.fn();ok++;console.log('PASS',t.name);}catch(err){failed++;console.error('FAIL',t.name,'\n',err.stack||String(err));}}
console.log('\nProduct 03W engine acceptance:',ok,'passed;',failed,'failed; total',testCases.length);
if(failed)process.exitCode=1;
