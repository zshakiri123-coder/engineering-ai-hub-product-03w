'use strict';
/* Browser-controller persistence failure regression tests.
   Run: node --test tests/storage-rollback.test.cjs
   Simulates storage quota failures; does not certify physical site inspection. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length>=3,'app script exists');
const app=scripts[2][1];

function extract(begin,end){
 const a=app.indexOf(begin),b=app.indexOf(end,a);
 assert.ok(a>=0 && b>a,'source function '+begin);
 return app.slice(a,b);
}
const deleteFn=extract('function deleteRecord(kind,id)','function fileDownload');
const importFn=extract('async function handleFile(e)','function runAction');
const actionFn=extract('function runAction(act,id)',"let preferenceTarget='language'");

function initial(){
 return {schema:3,mode:'REAL',project:{name:'KEEP THIS PROJECT',reportDate:'2026-10-30'},
  tasks:[],daily:[],costs:[{id:'C-001',amount:20}],qa:[],rfis:[],materials:[],equipment:[],labor:[]};
}
function harness(allowWrite=true,allowConfirm=true){
 const spec={state:initial(),allowWrite,allowConfirm};
 const program=[
  'let state=spec.state; let storageOK=true; let navCount=0; let renderCount=0; const messages=[];',
  "const collection={cost:'costs'};",
  "const E={newProject:()=>({...spec.state,project:{name:'NEW PROJECT',reportDate:'2026-10-30'},costs:[]}),safeImport:x=>x};",
  "const SAMPLE_SITE={...spec.state,project:{name:'SAMPLE PROJECT',reportDate:'2026-10-30'},costs:[]};",
  'const copy=x=>JSON.parse(JSON.stringify(x));',
  'const confirm=()=>spec.allowConfirm;',
  'const localizedPrompt=x=>x;',
  'const $=()=>({textContent:"",value:""});',
  'function normalizeCollections(){}',
  'function persist(){storageOK=spec.allowWrite;}',
  'function nav(){navCount++;}',
  'function render(){renderCount++;}',
  'function toast(t){messages.push(t);}',
  deleteFn,importFn,actionFn,
  'return {getState:()=>state,getNavCount:()=>navCount,getRenderCount:()=>renderCount,',
  'getMessages:()=>messages,handleFile,deleteRecord,runAction};'
 ].join('\n');
 return {spec,ctl:new Function('spec',program)(spec)};
}
const mockFile=project=>({target:{files:[{size:1024,text:async()=>JSON.stringify(project)}],value:'selected.json'}});
test('Failed JSON import retains previous project in memory and does not navigate',async()=>{
 const {ctl}=harness(false);
 await ctl.handleFile(mockFile({...initial(),project:{name:'IMPORTED',reportDate:'2026-10-30'}}));
 assert.equal(ctl.getState().project.name,'KEEP THIS PROJECT');
 assert.equal(ctl.getNavCount(),0);
 assert.ok(ctl.getMessages().some(m=>m.includes('Yükleme hatası')));
});
test('Successful JSON import replaces project',async()=>{
 const {ctl}=harness(true);
 await ctl.handleFile(mockFile({...initial(),project:{name:'IMPORTED',reportDate:'2026-10-30'}}));
 assert.equal(ctl.getState().project.name,'IMPORTED');
 assert.equal(ctl.getNavCount(),1);
});
test('Cancelled JSON import keeps prior data',async()=>{
 const {ctl}=harness(true,false);
 await ctl.handleFile(mockFile({...initial(),project:{name:'IMPORTED',reportDate:'2026-10-30'}}));
 assert.equal(ctl.getState().project.name,'KEEP THIS PROJECT');
});
test('Failed delete restores record in memory',()=>{
 const {ctl}=harness(false);
 ctl.deleteRecord('cost','C-001');
 assert.equal(ctl.getState().costs.length,1);
 assert.ok(ctl.getMessages().some(m=>m.includes('Eski kayıt korundu')));
});
test('Successful delete removes record',()=>{
 const {ctl}=harness(true);
 ctl.deleteRecord('cost','C-001');
 assert.equal(ctl.getState().costs.length,0);
});
test('Failed new project retains prior project',()=>{
 const {ctl}=harness(false);
 ctl.runAction('new-project');
 assert.equal(ctl.getState().project.name,'KEEP THIS PROJECT');
 assert.equal(ctl.getNavCount(),0);
});
test('Successful new project creates new project',()=>{
 const {ctl}=harness(true);
 ctl.runAction('new-project');
 assert.equal(ctl.getState().project.name,'NEW PROJECT');
});
test('Failed sample import retains prior project',()=>{
 const {ctl}=harness(false);
 ctl.runAction('load-sample-site');
 assert.equal(ctl.getState().project.name,'KEEP THIS PROJECT');
 assert.equal(ctl.getNavCount(),0);
});
test('Successful sample import replaces project',()=>{
 const {ctl}=harness(true);
 ctl.runAction('load-sample-site');
 assert.equal(ctl.getState().project.name,'SAMPLE PROJECT');
});
test('All embedded scripts parse as JavaScript',()=>{
 for(let i=0;i<scripts.length;i++) assert.doesNotThrow(()=>new Function(scripts[i][1]),'script '+i);
});
