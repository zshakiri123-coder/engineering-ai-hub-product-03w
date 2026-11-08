'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const mod={exports:{}};
new Function('module',html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);const E=mod.exports;
const task=(id,d,predecessors='')=>({id,start:'2026-11-02',finish:'2026-11-0'+(1+d),predecessors});
const run=tasks=>E.cpm({tasks});
test('CPM serial chain forward/backward pass and zero float',()=>{const r=run([task('A',2),task('B',3,'A'),task('C',1,'B')]);assert.equal(r.valid,true);assert.equal(r.duration,6);assert.deepEqual(r.items.map(n=>[n.ES,n.EF,n.LS,n.LF,n.totalFloat,n.freeFloat]),[[0,2,0,2,0,0],[2,5,2,5,0,0],[5,6,5,6,0,0]]);});
test('CPM fork/join gives correct float on shorter branch',()=>{const r=run([task('A',2),task('B',4,'A'),task('C',2,'A'),task('D',1,'B,C')]);assert.equal(r.duration,7);assert.deepEqual(r.criticalIds,['A','B','D']);assert.equal(r.items[2].totalFloat,2);assert.equal(r.items[2].freeFloat,2);});
test('CPM supports disconnected components and common finish',()=>{const r=run([task('A',5),task('B',2)]);assert.equal(r.duration,5);assert.equal(r.items[1].totalFloat,3);assert.equal(r.items[1].freeFloat,3);});
test('CPM equal branches both critical',()=>assert.deepEqual(run([task('A',2),task('B',2),task('C',1,'A,B')]).criticalIds,['A','B','C']));
test('CPM topological order independent of input order',()=>{const r=run([task('C',1,'B'),task('A',2),task('B',3,'A')]);assert.equal(r.duration,6);assert.equal(r.items[0].ES,5);});
test('CPM special work codes remain safe',()=>{const r=run([task('__proto__',2),task('constructor',3,'__proto__')]);assert.equal(r.valid,true);assert.equal(r.duration,5);});
for(const [name,tasks] of [
 ['empty',[]],['cycle',[task('A',1,'B'),task('B',1,'A')]],['self-link',[task('A',1,'A')]],
 ['unknown predecessor',[task('A',1,'X')]],['duplicate ID',[task('A',1),task('A',2)]],
 ['duplicate predecessor',[task('A',1),task('B',2,'A,A')]],['wrong predecessor type',[{...task('A',1),predecessors:['B']}]],
 ['invalid date',[{...task('A',1),start:'2026-02-30'}]],['weekend only',[{id:'A',start:'2026-11-07',finish:'2026-11-08'}]],
 ['reversed dates',[{id:'A',start:'2026-11-05',finish:'2026-11-02'}]]
])test('CPM rejects '+name,()=>{const r=run(tasks);assert.equal(r.valid,false);assert.ok(r.errors.length);assert.deepEqual(r.items,[]);});
test('CPM working days skip weekend',()=>assert.equal(run([{id:'A',start:'2026-11-06',finish:'2026-11-09'}]).duration,2));
test('CPM ignores empty separators and trims predecessor codes',()=>assert.equal(run([task('A',2),task('B',1,' A, ,')]).duration,3));
test('CPM does not mutate task inputs',()=>{const tasks=[task('A',2),task('B',1,'A')],snapshot=JSON.stringify(tasks);run(tasks);assert.equal(JSON.stringify(tasks),snapshot);});
test('CPM randomized DAGs match independent exhaustive path oracle (100 networks)',()=>{
 let seed=82371;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let sample=0;sample<100;sample++){
  const tasks=Array.from({length:7},(_,i)=>task('T'+i,1+Math.floor(rand()*5),Array.from({length:i},(_,j)=>'T'+j).filter(()=>rand()<0.3).join(',')));
  const paths=[];const successors=t=>tasks.filter(n=>n.predecessors.split(',').includes(t.id));
  function visit(t,ids,sum){const next=successors(t);const path=[...ids,t.id],length=sum+E.workdays(t.start,t.finish);if(!next.length)paths.push({ids:path,length});else for(const n of next)visit(n,path,length);}
  tasks.filter(t=>!t.predecessors).forEach(t=>visit(t,[],0));const longest=Math.max(...paths.map(p=>p.length));const result=run(tasks);
  assert.equal(result.duration,longest);for(const n of result.items){const through=Math.max(...paths.filter(p=>p.ids.includes(n.id)).map(p=>p.length));assert.equal(n.totalFloat,longest-through);assert.ok(n.freeFloat>=0&&n.freeFloat<=n.totalFloat);assert.equal(n.EF-n.ES,n.duration);assert.equal(n.LF-n.LS,n.duration);}
 }
});
test('Unknown predecessor surfaces release integrity HOLD',()=>{const s=E.newProject();s.tasks=[{...task('A',1,'missing'),qty:1,budget:10}];assert.ok(E.issues(s).some(x=>x.startsWith('CPM:')));assert.equal(E.release(s).status,'HOLD');});
test('CPM invalid dependency graph is rejected on import before state replacement',()=>{const s=E.newProject();s.tasks=[task('A',1,'B')];assert.throws(()=>E.safeImport(s),/CPM/);});
test('CPM JSON roundtrip preserves links and computed network',()=>{const s=E.newProject();s.tasks=[task('A',2),task('B',3,'A')];const imported=E.safeImport(JSON.parse(JSON.stringify(s)));assert.equal(imported.tasks[1].predecessors,'A');assert.equal(E.cpm(imported).duration,5);});
const helper=html.slice(html.indexOf('function renderCPM(){'),html.indexOf('function renderQto(){'));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const render=(tasks,language='en')=>new Function('state','prefs','E','esc',helper+'return renderCPM();')({tasks},{language},E,escape);
test('CPM UI hides optional network for legacy tasks without links',()=>assert.equal(render([task('A',2)]),''));
test('CPM UI displays computed duration, float headings and explicit scope',()=>{const out=render([task('A',2),task('B',3,'A')]);assert.match(out,/CPM · 5 working days/);assert.match(out,/zero lag/);for(const label of ['ES','EF','LS','LF','TF','FF'])assert.ok(out.includes('<th>'+label+'</th>'));});
test('CPM UI safely escapes user-provided work codes',()=>{const out=render([task('<img src=x>',2),task('B',1,'<img src=x>')]);assert.ok(!out.includes('<img'));assert.ok(out.includes('&lt;img'));});
test('CPM UI invalid network explicitly shows HOLD',()=>assert.match(render([task('A',2,'missing')]),/CPM · HOLD/));
test('CPM UI Turkish scope is present',()=>assert.match(render([task('A',2),task('B',1,'A')],'tr'),/sıfır gecikme/));
test('CPM is included in report and quantity panels',()=>{const report=html.slice(html.indexOf('function renderReports(){'),html.indexOf('function render(){'));const qto=html.slice(html.indexOf('function renderQto(){'),html.indexOf('function renderDaily(){'));assert.ok(report.includes('${renderCPM()}'));assert.ok(qto.includes('${renderCPM()}'));});
