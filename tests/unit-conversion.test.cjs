'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][2][1];
const code=app.slice(app.indexOf('const USC='),app.indexOf('function setPreference('));
const units=['m³','m²','m','kg','L'];
const conv=new Function('const prefs={units:"USC"};const fmtNum=String;'+code+';return {USC,SIof,unitQuantity,unitPrice,sourceUnits};')();
const approx=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
for(const unit of units){
 test(unit+' SI-USC roundtrip preserves quantities and budget',()=>{
  const q=12.345,p=456.789,[us,factor]=conv.USC[unit];
  const newQ=conv.unitQuantity(q,unit),newP=conv.unitPrice(p,unit);
  assert.ok(approx(newQ,q*factor));
  assert.ok(approx(newP*newQ,q*p));
  assert.ok(approx(newQ*conv.SIof[us][1],q));
  assert.equal(conv.sourceUnits(us),unit);
 });
}
