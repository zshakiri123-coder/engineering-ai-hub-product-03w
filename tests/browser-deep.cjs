'use strict';
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'));
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const isWebKit=process.env.BROWSER_ENGINE==='webkit';
 browser=await (isWebKit?webkit:chromium).launch({headless:true,...(isWebKit?{}:{args:['--no-sandbox']})});
 const context=await browser.newContext(process.env.BROWSER_ENGINE==='webkit'?{...devices['iPhone 13'],viewport:{width:390,height:844}}:{viewport:{width:390,height:844}});
 const page=await context.newPage();
 page.setDefaultTimeout(15000);
 page.on('dialog',d=>d.accept());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const langs=['tr','en','de','fr','es','ar','fa','ru','zh','ja'];
 const sections=['dashboard','qto','daily','costs','quality','rfis','materials','equipment','labor','reports','release','data'];
 const expectedNavigation={
  tr:['Panel','Proje / Dosya'],en:['Dashboard','Project / Files'],de:['Übersicht','Projekt / Dateien'],
  fr:['Tableau de bord','Projet / Fichiers'],es:['Panel','Proyecto / Archivos'],
  ar:['لوحة التحكم','المشروع / الملفات'],fa:['داشبورد','پروژه / فایل‌ها'],
  ru:['Панель','Проект / Файлы'],zh:['仪表盘','项目 / 文件'],
  ja:['ダッシュボード','プロジェクト / ファイル']
 };
 const textOf=async(sel)=>(await page.locator(sel).innerText()).trim();
 const navLabels=[];
 let visits=0;
 for(const lang of langs){
   await page.locator('#lang-select').click();
   await page.locator('#pref-options [data-pref-value="'+lang+'"]').click();
   for(const section of sections){
     await page.locator('[data-nav="'+section+'"]').click();
     assert.equal(await page.locator('section.panel.active').getAttribute('id'),section,'active section '+section+' / '+lang);
     if(section==='dashboard'){
       const expected=expectedNavigation[lang][0];
       assert.equal(await textOf('[data-nav="dashboard"]'),expected,'dashboard translation '+lang);
     }
     if(section==='data'){
       const expected=expectedNavigation[lang][1];
       assert.equal(await textOf('[data-nav="data"]'),expected,'project/files translation '+lang);
       navLabels.push(lang+':'+expected);
     }
     visits++;
   }
 }
 console.log('STEP: navigated all '+visits+' language/section combinations');
 console.log('STEP: independently checked navigation text for all 10 languages: '+navLabels.join(' | '));
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
 console.log(JSON.stringify({result:'PASS',languageSectionNavigations:visits,viewport:process.env.BROWSER_ENGINE==='webkit'?'390x844 touch-enabled WebKit emulation':'390x844 Chromium emulation',taskEditPersistence:'PASS',photoAttachmentPersistence:'PASS',jsErrors:errors.length}));
 await context.close();
})().catch(err=>{console.error(err);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();});
