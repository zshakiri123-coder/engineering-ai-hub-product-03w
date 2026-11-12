'use strict';
// Executes the actual CSV controller, not a second implementation of its mappings.
// Synthetic records only; spreadsheet delivery is not engineering/site approval.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(process.env.CSV_SOURCE||path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const mod={exports:{}};vm.runInNewContext(scripts[0][1],{module:mod});const E=mod.exports;
const app=scripts[2][1];
function extract(a,b){const i=app.indexOf(a),j=app.indexOf(b,i);assert.ok(i>=0&&j>i,a);return app.slice(i,j);}
const fields=extract('const fieldSets=','const collection=');
const csv=extract('function csvCell(','function exportJson(');
const action=extract('function runAction(act,id)',"let preferenceTarget='language'");
function harness(){
 const saved=[],mappings=[];
 const state=E.newProject();state.project={name:'SYNTHETIC CSV QA',number:'CSV-001',reportDate:'2026-11-06',currency:'CAD',standardHours:8,isExample:true};
 const x=new Function('state','E','saved','mappings',[
  fields,csv,action,
  'const originalDownloadCsv=downloadCsv;downloadCsv=(name,rows,headers)=>{mappings.push(headers.map(h=>h.slice()));originalDownloadCsv(name,rows,headers);};',
  "function fileDownload(name,content,mime){saved.push({name,content,mime});} function toast(){}",
  'return {state,fieldSets,runAction,csvCell};'
 ].join('\n'))(state,E,saved,mappings);
 const map={task:'tasks',daily:'daily',cost:'costs',qa:'qa',rfi:'rfis',material:'materials',equipment:'equipment',labor:'labor'};
 for(const [kind,section] of Object.entries(map)){
  const row={};for(const [key,,type] of x.fieldSets[kind])if(key!=='#')row[key]=type==='number'?2:type==='checkbox'?true:type==='date'?'2026-11-06':key+' CSV, "value"\nsecond line';
  row.id=kind+'-1';if(kind!=='task')row.taskId='task-1';
  state[section]=[row];
 }
 Object.assign(state.tasks[0],{qty:10,budget:2400,unit:'m³',baselineHours:40,start:'2026-11-02',finish:'2026-11-06',predecessors:''});
 Object.assign(state.daily[0],{qty:4,hours:16,people:2,cost:900,paymentRef:'PAY-D-1',temperature:-4.5,attachments:[{name:'evidence, "one".png',data:'data:image/png;base64,private'}]});
 Object.assign(state.costs[0],{amount:125,paymentRef:'PAY-C-1'});
 Object.assign(state.labor[0],{crew:5,hours:8,overtime:4});
 return {...x,saved,mappings,map};
}
function parseCsv(s){
 assert.equal(s[0],'\ufeff','UTF-8 BOM for Excel');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=1;i<s.length;i++){
  const c=s[i];
  if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\r'&&!quoted&&s[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
  else cell+=c;
 }
 assert.equal(quoted,false,'quotes balanced');row.push(cell);rows.push(row);
 const [headers,...values]=rows;for(const r of values)assert.equal(r.length,headers.length,'rectangular CSV');
 return {headers,rows:values.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]]))),values};
}
function exported(h,route){h.runAction('export-'+route);assert.equal(h.saved.length,1);return parseCsv(h.saved[0].content);}
for(const [route,kind] of Object.entries({qto:'task',daily:'daily',costs:'cost',qa:'qa',rfis:'rfi',materials:'material',equipment:'equipment',labor:'labor'})){
 test(route+' CSV preserves all editable audit fields without mutating project',()=>{
  const h=harness(),before=JSON.stringify(h.state),data=exported(h,route),record=h.state[h.map[kind]][0];
  for(const [key] of h.fieldSets[kind])if(key!=='#'){const index=h.mappings[0].findIndex(h=>h[0]===key);assert.ok(index>=0,route+' includes '+key);assert.equal(data.values[0][index],String(record[key]??''),route+' preserves '+key);}
  assert.equal(data.rows[0].exportUnitSystem,'SI');assert.equal(data.rows[0].exportCurrency,'CAD');assert.equal(data.rows[0].exportReportDate,'2026-11-06');assert.equal(data.rows[0].exportProjectCode,'CSV-001');
  assert.equal(JSON.stringify(h.state),before,'export must not mutate stored values');
 });
}
test('Daily CSV retains payment ID, quantity unit and evidence names, without embedding image bytes',()=>{
 const h=harness(),{rows}=exported(h,'daily'),r=rows[0];assert.equal(r.paymentRef,'PAY-D-1');assert.equal(r.quantityUnit,'m³');assert.equal(r.attachmentCount,'1');assert.equal(r.attachmentNames,'evidence, "one".png');assert.equal(r.temperature,'-4.5');assert.ok(!h.saved[0].content.includes('data:image/'));
});
test('Cost CSV retains traceable payment and invoice identity',()=>{
 const h=harness(),r=exported(h,'costs').rows[0];assert.equal(r.paymentRef,'PAY-C-1');assert.equal(r.invoice,h.state.costs[0].invoice);assert.equal(r.supplier,h.state.costs[0].supplier);
});
test('Labor CSV separates hours per person from total man-hours',()=>{
 const h=harness(),r=exported(h,'labor').rows[0];assert.equal(r.HoursPerPerson,'8');assert.equal(r.totalManHours,'40');assert.equal(r.id,'labor-1');
});
test('Summary and QTO exports use the same report-date calculation as dashboard',()=>{
 const h=harness(),r=exported(h,'summary').rows[0],c=E.calc(h.state);assert.equal(Number(r['Bütçe']),c.BAC);assert.equal(Number(r['Kazanılan değer']),c.EV);assert.equal(Number(r['Gerçek maliyet']),c.AC);assert.equal(r.exportCurrency,'CAD');assert.equal(r.exportUnitSystem,'SI');
});
test('CSV neutralizes spreadsheet formulas while preserving numbers, quotes and Unicode',()=>{
 const h=harness();for(const s of ['=1+1','+1+1','@SUM(1,2)','-2+3',' \t=HYPERLINK("x")'])assert.ok(h.csvCell(s).startsWith('"\''));assert.equal(h.csvCell(-12),'"-12"');assert.equal(h.csvCell('İş, "бетон"\n施工'),'"İş, ""бетон""\n施工"');
});
test('Empty exported collections keep stable headers without inventing records',()=>{
 const h=harness();h.state.costs=[];const r=exported(h,'costs');assert.equal(r.rows.length,0);assert.ok(r.headers.includes('paymentRef'));assert.ok(r.headers.includes('exportCurrency'));
});
