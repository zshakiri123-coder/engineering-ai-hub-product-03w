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
 const context=await browser.newContext(engine==='webkit'?{...devices['iPhone 13']}:{viewport:{width:390,height:844}});
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
 assert.deepEqual(errors,[],'no uncaught JS errors');
 console.log(JSON.stringify({result:'PASS',languageSectionNavigations:visits,viewport:engine==='webkit'?'iPhone 13 WebKit emulation (not physical Safari)':'390x844 Chromium emulation',dismissalFlows:'PASS',taskEditPersistence:'PASS',photoAttachmentPersistence:'PASS',jsErrors:errors.length}));
 await context.close();
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();});
