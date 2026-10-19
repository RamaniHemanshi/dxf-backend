const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {parseDxf,calculateCost}=require('./lib');
const sample=()=>parseDxf(fs.readFileSync(path.join(__dirname,'samples','rectangle-100x60.dxf'),'utf8'));
test('verified 100 x 60 rectangle plus circle',()=>{const a=sample();assert.equal(a.bounds.width,100);assert.equal(a.bounds.height,60);assert.equal(a.measurements.area,6000+Math.PI*25);assert.equal(a.measurements.perimeter,320+Math.PI*10)});
test('rejects unknown DXS',()=>assert.throws(()=>parseDxf('proprietary data')));
test('cost formula rounds geometry to whole stock sheets',()=>{const c=calculateCost(sample(),{quantity:1,materialPrice:.01,sheetWidth:100,sheetHeight:60,wastePercent:0,machineRate:100,machiningHours:2,labourCost:20});assert.equal(c.materialQty,12000);assert.equal(c.total,340)});
