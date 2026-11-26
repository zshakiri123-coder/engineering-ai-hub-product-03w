'use strict';
const {chromium,webkit,devices}=require('playwright');
const engine=process.env.BROWSER||'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('Unsupported BROWSER: '+engine);
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'));
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const contextOptions=engine==='webkit'?{...devices['iPhone 13']}:{viewport:{width:390,height:844}};
 const context=await browser.newContext(contextOptions);
 const page=await context.newPage();
 page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.accept());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const langs=['tr','en','de','fr','es','ar','fa','ru','zh','ja'];
 const sections=['dashboard','qto','daily','costs','quality','rfis','materials','equipment','labor','reports','release','data'];
 let visits=0;
 for(const lang of langs){
   await page.locator('#lang-select').click();
   await page.locator('#pref-options [data-pref-value="'+lang+'"]').click();
   for(const section of sections){
     await page.locator('[data-nav="'+section+'"]').click();
     assert.equal(await page.locator('section.panel.active').getAttribute('id'),section,'active section '+section+' / '+lang);
     visits++;
   }
 }
 console.log('STEP: navigated all '+visits+' language/section combinations');
 await page.locator('#lang-select').click();
 await page.locator('#pref-options [data-pref-value="en"]').click();
 await page.locator('[data-action="load-sample-site"]').first().click();
 await page.locator('[data-nav="qto"]').click();
 await page.locator('#qto [data-action="edit-task"]').first().click();
 assert.equal(await page.locator('#editor').getAttribute('open'),'','task dialog opened');
 await page.locator('#edit_title').fill('QA PERSISTENCE WORK ITEM 2026');
 await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),null,'editor closes after save');
 await page.reload();
 await page.locator('[data-nav="qto"]').click();
 assert.ok((await page.locator('#qto').innerText()).includes('QA PERSISTENCE WORK ITEM 2026'),'task editing persisted after reload');
 console.log('STEP: edited task saved and restored');
 // Cancel and Escape must discard edits and leave navigation usable.
 const saved=await page.evaluate(()=>localStorage.getItem('product03w.sitecontrol.rev3_5.project'));
 for(const dismiss of ['cancel','escape']){
   await page.locator('#qto [data-action="edit-task"]').first().click();
   await page.locator('#edit_title').fill('MUST NOT BE SAVED');
   if(dismiss==='cancel')await page.locator('#cancel').click();else await page.keyboard.press('Escape');
   assert.equal(await page.locator('#editor').getAttribute('open'),null,'dismiss closes editor');
   assert.equal(await page.evaluate(()=>localStorage.getItem('product03w.sitecontrol.rev3_5.project')),saved,'discarded edit leaves persisted state unchanged');
 }
 for(let n=0;n<3;n++){
   await page.locator('#lang-select').click();await page.locator('#pref-close').click();
   assert.equal(await page.locator('#pref-dialog').getAttribute('open'),null,'repeated preference close');
 }
 await page.locator('[data-nav="reports"]').click();
 await page.locator('[data-nav="qto"]').click();
 assert.equal(await page.locator('section.panel.active').getAttribute('id'),'qto','navigation usable after dialog dismissal');
 await page.locator('[data-nav="daily"]').click();
 await page.locator('#daily [data-action="edit-daily"]').first().click();
 const imageData=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=32;c.height=32;
   const ctx=c.getContext('2d');ctx.fillStyle='#2b8a8a';ctx.fillRect(0,0,32,32);
   return c.toDataURL('image/png');
 });
 await page.locator('#daily-picker').setInputFiles({name:'qa-camera-image.png',mimeType:'image/png',buffer:Buffer.from(imageData.split(',')[1],'base64')});
 await page.waitForFunction(()=>document.querySelector('#evidence-list')?.textContent.includes('qa-camera-image.png'));
 await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),null,'evidence editor closes on save');
 let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('product03w.sitecontrol.rev3_5.project')));
 assert.ok(data.daily.some(x=>Array.isArray(x.attachments)&&x.attachments.some(a=>a.name==='qa-camera-image.png'&&a.data.startsWith('data:image/'))),'photo stored with daily record');
 await page.reload();
 data=await page.evaluate(()=>JSON.parse(localStorage.getItem('product03w.sitecontrol.rev3_5.project')));
 assert.ok(data.daily.some(x=>Array.isArray(x.attachments)&&x.attachments.some(a=>a.name==='qa-camera-image.png')),'photo persists after reload');
 assert.ok(data.tasks.some(x=>x.title==='QA PERSISTENCE WORK ITEM 2026'),'edited task remains after reload');

 // Exercise the new CPM controls through real browser forms, not engine calls.
 const cpmProject={schema:3,mode:'REAL',project:{name:'CPM BROWSER QA',reportDate:'2026-11-06',standardHours:8,currency:'CAD',isExample:true},tasks:[
   {id:'A',title:'CPM A',unit:'m³',qty:10,budget:1000,start:'2026-11-02',finish:'2026-11-03',baselineHours:16},
   {id:'B',title:'CPM B',unit:'m³',qty:10,budget:1000,start:'2026-11-02',finish:'2026-11-04',baselineHours:24},
   {id:'C',title:'CPM C',unit:'m³',qty:10,budget:1000,start:'2026-11-02',finish:'2026-11-02',baselineHours:8,predecessors:'B'}
 ],daily:[],costs:[],qa:[],rfis:[],materials:[],equipment:[],labor:[]};
 await page.locator('[data-nav="data"]').click();
 await page.locator('#import-file').setInputFiles({name:'cpm-browser-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(cpmProject))});
 await page.locator('#project-name').filter({hasText:'CPM BROWSER QA'}).waitFor({state:'attached'});
 await page.locator('[data-nav="qto"]').click();
 await page.locator('#qto [data-action="edit-task"][data-id="B"]').click();
 await page.locator('#edit_predecessors').fill('A');
 await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),null,'CPM predecessor form saves');
 assert.match(await page.locator('#qto').innerText(),/CPM · 6 working days/,'CPM network recalculates from form input');
 await page.reload();await page.locator('[data-nav="qto"]').click();
 assert.match(await page.locator('#qto').innerText(),/CPM · 6 working days/,'CPM links persist after reload');
 await page.locator('#qto [data-action="delete-task"][data-id="A"]').click();
 assert.equal(await page.locator('#qto [data-action="edit-task"][data-id="A"]').count(),1,'linked predecessor cannot be deleted');
 await page.locator('#qto [data-action="edit-task"][data-id="A"]').click();
 await page.locator('#edit_predecessors').fill('C');
 await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),'','cycle is rejected without closing form');
 assert.match(await page.locator('#formerrors').innerText(),/cyclic/,'cycle error is visible');
 await page.locator('#cancel').click();
 await page.locator('[data-nav="reports"]').click();
 assert.match(await page.locator('#reports').innerText(),/CPM · 6 working days/,'CPM report matches saved network');
 console.log('STEP: CPM form, reload, cycle rejection, deletion guard and report PASS');

 const paymentProject=JSON.parse(JSON.stringify(cpmProject));
 paymentProject.project.name='SYNTHETIC PAYMENT QA';
 paymentProject.daily=[{id:'D-PAY',taskId:'A',date:'2026-11-06',qty:0,hours:8,people:1,cost:125}];
 paymentProject.costs=[{id:'C-PAY',taskId:'A',date:'2026-11-06',amount:125,category:'Other'}];
 await page.locator('[data-nav="data"]').click();
 await page.locator('#import-file').setInputFiles({name:'synthetic-payments.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(paymentProject))});
 await page.locator('#project-name').filter({hasText:'SYNTHETIC PAYMENT QA'}).waitFor({state:'attached'});
 await page.locator('[data-nav="daily"]').click();
 assert.equal(await page.locator('#daily [data-cost-warning]').count(),1,'legacy cross-ledger duplicate warning visible');
 await page.locator('#daily [data-action="edit-daily"]').first().click();
 await page.locator('#edit_paymentRef').fill('SYN-P1');await page.locator('#save-edit').click();
 await page.locator('[data-nav="costs"]').click();
 await page.locator('#costs [data-action="edit-cost"]').first().click();
 await page.locator('#edit_paymentRef').fill('SYN-P1');await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),'','duplicate payment identity save blocked');
 assert.match(await page.locator('#formerrors').innerText(),/Duplicate payment ID/);
 const failedSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('product03w.sitecontrol.rev3_5.project')));
 assert.ok(!failedSave.costs[0].paymentRef,'blocked identity is not persisted');
 await page.locator('#edit_paymentRef').fill('SYN-P2');await page.locator('#save-edit').click();
 assert.equal(await page.locator('#editor').getAttribute('open'),null,'distinct payment identity saved');
 assert.equal(await page.locator('#costs [data-cost-warning]').count(),0,'distinct traceable payments resolve possible duplicate');
 await page.locator('[data-nav="daily"]').click();
 await page.locator('#daily [data-action="edit-daily"]').first().click();
 await page.locator('#edit_cost').fill('0');await page.locator('#edit_paymentRef').fill('SYN-P2');
 await page.locator('#save-edit').click();await page.reload();
 const reconciled=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('product03w.sitecontrol.rev3_5.project'));return {daily:s.daily.length,costs:s.costs.length,AC:SiteEngine.calc(s).AC,EV:SiteEngine.calc(s).EV,warnings:SiteEngine.costWarnings(s).length};});
 assert.deepEqual(reconciled,{daily:1,costs:1,AC:125,EV:0,warnings:0},'explicit reconciliation retains records and counts amount once');
 console.log('STEP: synthetic duplicate payment warning, blocked save, distinct identities and explicit zero-cost reconciliation PASS');

 // Imported historical conflicts must be repairable one at a time.
 const twoGroups=JSON.parse(JSON.stringify(paymentProject));twoGroups.project.name='MULTIPLE SYNTHETIC CONFLICTS';
 twoGroups.daily=[{id:'D-G1',taskId:'A',date:'2026-11-06',qty:0,hours:8,people:1,cost:125,paymentRef:'G1'},{id:'D-G2',taskId:'A',date:'2026-11-06',qty:0,hours:8,people:1,cost:200,paymentRef:'G2'}];
 twoGroups.costs=[{id:'C-G1',taskId:'A',date:'2026-11-06',amount:125,paymentRef:'G1',category:'Other'},{id:'C-G2',taskId:'A',date:'2026-11-06',amount:200,paymentRef:'G2',category:'Other'}];
 await page.locator('[data-nav="data"]').click();
 await page.locator('#import-file').setInputFiles({name:'multiple-synthetic-conflicts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(twoGroups))});
 await page.locator('#project-name').filter({hasText:'MULTIPLE SYNTHETIC CONFLICTS'}).waitFor({state:'attached'});
 await page.locator('[data-nav="costs"]').click();
 for(const id of ['C-G1','C-G2']){
   await page.locator('#costs [data-action="edit-cost"][data-id="'+id+'"]').click();
   await page.locator('#edit_amount').fill('0');await page.locator('#save-edit').click();
   assert.equal(await page.locator('#editor').getAttribute('open'),null,'each existing duplicate can be reconciled independently');
 }
 const finalPayments=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('product03w.sitecontrol.rev3_5.project'));return {AC:SiteEngine.calc(s).AC,warnings:SiteEngine.costWarnings(s).length,records:s.daily.length+s.costs.length};});
 assert.deepEqual(finalPayments,{AC:325,warnings:0,records:4},'multiple conflicts resolved while preserving all records');
 console.log('STEP: multiple existing payment conflicts can be reconciled one at a time PASS');
 assert.deepEqual(errors,[],'no uncaught JS errors');
 console.log(JSON.stringify({result:'PASS',languageSectionNavigations:visits,viewport:engine==='webkit'?'iPhone 13 WebKit emulation (not physical Safari)':'390x844 Chromium emulation',dismissalFlows:'PASS',cpmBrowserFlows:'PASS',paymentReconciliation:'PASS',taskEditPersistence:'PASS',photoAttachmentPersistence:'PASS',jsErrors:errors.length}));

 // The header and project scenario use a fresh browser profile; never the real app origin/data.
 const fixtureContext=await browser.newContext({ ...contextOptions, viewport:{width:320,height:844} });
 const fixture=await fixtureContext.newPage();
 const fixtureErrors=[];fixture.on('pageerror',e=>fixtureErrors.push(e.message));
 await fixture.goto('http://127.0.0.1:'+server.address().port+'/');
 const tb=fixture.locator('#site-toolbar button');
 assert.equal(await tb.count(),5);
 assert.equal(await fixture.locator('#project-name').isVisible(),false);
 assert.equal(await fixture.locator('#active-project-strip').isVisible(),false);
 assert.equal(await fixture.locator('#save-status').isVisible(),false);
 for(const width of [320,390]){
   await fixture.setViewportSize({width,height:844});
   const boxes=await Promise.all((await tb.all()).map(b=>b.boundingBox()));
   assert.ok(boxes.every(b=>b&&b.width>=44&&b.height>=44),'touch targets at '+width);
   assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1),'single toolbar row at '+width);
 }
 const localized=[
  ['tr','Görünüm','Tema','Kaydet'],['en','Appearance','Theme','Save'],['de','Darstellung','Design','Speichern'],
  ['fr','Apparence','Thème','Enregistrer'],['es','Apariencia','Tema','Guardar'],['ar','المظهر','السمة','حفظ'],
  ['fa','ظاهر','پوسته','ذخیره'],['ru','Оформление','Тема','Сохранить'],['zh','外观','主题','保存'],['ja','外観','テーマ','保存']
 ];
 for(const [lang,caption,theme,save] of localized){
   await fixture.locator('#lang-select').click();
   await fixture.locator('[data-pref-value="'+lang+'"]').click();
   await fixture.locator('#appearance-open').click();
   assert.equal(await fixture.locator('#appearance-title').innerText(),caption);
   assert.equal(await fixture.locator('#appearance-mode-label').innerText(),theme);
   assert.equal(await fixture.locator('#save-project').innerText(),save);
   await fixture.locator('#appearance-close').click();
 }
 await fixture.locator('#lang-select').click();await fixture.locator('[data-pref-value="tr"]').click();
 await fixture.locator('#dashboard [data-action="edit-project"]').click();
 await fixture.locator('#edit_name').fill('Synthetic Site Control QA');
 await fixture.locator('#edit_number').fill('TEST-SC-AUTO');
 await fixture.locator('#edit_location').fill('Synthetic test site');
 await fixture.locator('#save-edit').click();
 await fixture.locator('[data-nav="qto"]').click();
 await fixture.locator('#qto [data-action="new-task"]').click();
 await fixture.locator('#edit_title').fill('Synthetic slab');
 await fixture.locator('[data-action="choose-field"][data-id="geometryType"]').click();
 await fixture.locator('[data-choice-value="volume"]').click();
 for(const [key,value] of Object.entries({length:'10',width:'5',depth:'0.2',count:'1',unitRate:'200'}))await fixture.locator('#edit_'+key).fill(value);
 await fixture.locator('[data-action="geometry-calc"]').click();
 const formValues=await Promise.all(['qty','budget','unit'].map(k=>fixture.locator('#edit_'+k).inputValue()));
 assert.deepEqual(formValues,['10','2000','m³'],'QTO geometry produces 10 m³ and CAD 2,000');
 await fixture.locator('#save-edit').click();
 await fixture.locator('[data-nav="daily"]').click();
 await fixture.locator('#daily [data-action="new-daily"]').click();
 await fixture.locator('[data-action="choose-field"][data-id="taskId"]').click();
 await fixture.locator('[data-choice-value="T-001"]').click();
 for(const [key,value] of Object.entries({qty:'4',hours:'16',people:'2',cost:'900',workArea:'QA zone'}))await fixture.locator('#edit_'+key).fill(value);
 await fixture.locator('#save-edit').click();
 assert.match(await fixture.locator('#daily article').innerText(),/DAY-001/);
 await fixture.locator('[data-nav="dashboard"]').click();
 const before=await fixture.locator('#dashboard .metric strong').allTextContents();
 assert.deepEqual([before[0],before[1],before[2],before[4]],['$2,000','$900','$800','40.0%']);
 await fixture.locator('#appearance-open').click();
 await fixture.locator('#appearance-mode').selectOption('dark');
 await fixture.locator('#appearance-close').click();
 await fixture.locator('#save-project').click();
 assert.match(await fixture.locator('#toast').innerText(),/kaydedildi/);
 await fixture.reload();
 assert.deepEqual(await fixture.locator('#dashboard .metric strong').allTextContents(),before);
 assert.equal(await fixture.locator('html').getAttribute('data-sc-mode'),'dark');
 await fixture.locator('[data-nav="data"]').click();
 assert.match(await fixture.locator('#data .data-grid').innerText(),/TEST-SC-AUTO/);
 assert.deepEqual(fixtureErrors,[],'no errors in synthetic project');
 console.log('STEP: 10 localized toolbars; 320/390 layout; QTO, cost, daily progress, and same-origin save/reload PASS');
 await fixtureContext.close();

 await context.close();
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();});
