'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const mod={exports:{}};new Function('module',html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);const E=mod.exports;
function fixture(){const s=E.newProject();s.project.reportDate='2026-10-30';s.tasks=[{id:'T1',qty:10,budget:1000,sourceRef:'BOQ1',qtoChecker:'A',qtoApproved:true,start:'2026-10-26',finish:'2026-10-30',baselineHours:40,baselineApproved:true,baselineRef:'B1',ssotRef:'S1',ssotChecker:'B',ssotVerified:true}];s.qa=[{id:'Q1',taskId:'T1',status:'PASS',inspector:'A',evidence:'Q1'}];return s;}
for(const id of ['__proto__','constructor','toString'])test('Task code '+id+' does not corrupt calculated progress',()=>{const s=fixture();s.tasks[0].id=id;s.qa[0].taskId=id;s.daily=[{id:'D1',taskId:id,date:'2026-10-30',qty:4,hours:8,people:1,cost:500}];assert.equal(E.calc(s).EV,400);assert.equal(E.calc(s).items[0].actualQty,4);});
for(const section of ['daily','costs'])for(const date of [undefined,''])test(section+' missing date blocks false release PASS: '+String(date),()=>{const s=fixture();s[section]=section==='daily'?[{id:'D1',taskId:'T1',date,qty:4,hours:8,people:1,cost:500}]:[{id:'C1',date,amount:500}];assert.equal(E.release(s).status,'HOLD');});
test('Malformed project arrays rejected before import mutation',()=>assert.throws(()=>E.safeImport({schema:3,project:[]})));
for(const section of ['daily','costs'])for(const date of [undefined,'','2026-02-30'])test('Import rejects '+section+' malformed date '+String(date),()=>{const s=fixture();s[section]=[{id:'R1',date,amount:500}];assert.throws(()=>E.safeImport(s),/tarih/);});
