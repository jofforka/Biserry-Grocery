const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stockFloor}=require('../automation/stock-policy.cjs');
test('inactive products and variants are preserved',()=>{
 assert.equal(stockFloor({isActive:false,stock:0}),null);
 const p={isActive:true,stock:65,variants:[{id:'a',stock:1,isActive:false},{id:'b',stock:40},{id:'c',stock:0}]};
 const result=stockFloor(p);assert.equal(result.patch.stock,undefined);
 assert.deepEqual(result.patch.variants.map(v=>v.stock),[1,40,30]);assert.equal(p.variants[2].stock,0);
});
test('parent and variant floors never reduce higher parent total',()=>{
 const r=stockFloor({isActive:true,stock:200,variants:[{stock:2},{stock:31}]});
 assert.equal(r.patch.stock,undefined);assert.deepEqual(r.patch.variants.map(v=>v.stock),[30,31]);
});
test('missing stock raised; repeated patch is idempotent',()=>{
 const p={isActive:true,variants:[{}]};const first=stockFloor(p);
 assert.equal(first.patch.stock,30);assert.deepEqual(stockFloor({...p,...first.patch}).patch,{});
});
test('bad numeric input aborts instead of making up stock',()=>assert.throws(()=>stockFloor({isActive:true,stock:'unknown'})));
