'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const home=path.resolve(__dirname,'..');
const out=path.join(home,'browser-artifacts');
fs.mkdirSync(out,{recursive:true});
const pageHtml=fs.readFileSync(path.join(home,'index.html'));
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(pageHtml);
});
const listen=()=>new Promise(r=>server.listen(0,'127.0.0.1',r));
(async()=>{
  await listen();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const errors=[];
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:850}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  const url='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(url,{waitUntil:'load'});
  await page.locator('#project-name').waitFor();
  assert.equal(await page.locator('[data-nav]').count(),12,'all 12 navigation sections');
  const languages=['tr','en','de','fr','es','ar','fa','ru','zh','ja'];
  const languageResults=[];
  for(const lang of languages){
    await page.locator('#lang-select').click();
    await page.locator('#pref-options [data-pref-value="'+lang+'"]').click();
    const actual=await page.locator('html').getAttribute('lang');
    assert.equal(actual,lang,'language selection '+lang);
    const dir=await page.locator('html').getAttribute('dir');
    assert.equal(dir,['ar','fa'].includes(lang)?'rtl':'ltr','text direction '+lang);
    languageResults.push(lang+':'+dir);
  }
  await page.locator('#unit-select').click();
  await page.locator('#pref-options [data-pref-value="USC"]').click();
  assert.match(await page.locator('#unit-select').innerText(),/US Customary/);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'),'ja','language persists');
  assert.match(await page.locator('#unit-select').innerText(),/US Customary/,'units persist');
  await page.locator('#unit-select').click();
  await page.locator('#pref-options [data-pref-value="SI"]').click();
  assert.match(await page.locator('#unit-select').innerText(),/SI/,'SI restoration');
  await page.locator('[data-nav="data"]').click();
  await page.locator('[data-action="load-sample-site"]').click();
  const before=(await page.locator('#project-name').innerText()).trim();
  assert.ok(before.length>2,'sample project name');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-action="export-json"]').first().click();
  const download=await downloadPromise;
  const json=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.ok(json.project.name,'exported project name');
  assert.ok(Array.isArray(json.tasks),'exported task list');
  json.project.name='Web Browser QA Sample 2026-10-30';
  await page.locator('#import-file').setInputFiles({
    name:'qa-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))
  });
  assert.match(await page.locator('#project-name').innerText(),/Web Browser QA Sample/,'JSON imported');
  await page.reload();
  assert.match(await page.locator('#project-name').innerText(),/Web Browser QA Sample/,'JSON restored after reload');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.locator('[data-nav="reports"]').click();
  const pdf=await page.pdf({format:'A4',printBackground:true});
  assert.ok(pdf.byteLength>1000,'print PDF not empty');
  fs.writeFileSync(path.join(out,'sample-report.pdf'),pdf);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(out,'mobile-chromium.png'),fullPage:true});
  assert.equal(errors.length,0,'no uncaught browser errors: '+errors.join(' | '));
  console.log(JSON.stringify({
    result:'PASS',languages:languageResults,nav:12,unitToggle:'SI / USC PASS',
    localPersistence:'PASS',jsonExportImport:'PASS',pdfBytes:pdf.byteLength,
    sampleRecords:json.tasks.length,errors
  },null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());