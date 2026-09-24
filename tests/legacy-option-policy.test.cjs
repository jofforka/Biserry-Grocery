const {test}=require('node:test'),assert=require('node:assert/strict');
const {planLegacyCleanup}=require('../automation/legacy-option-policy.cjs');
const source={name:'Ijebu Garri',variants:[{sku:'R-1',name:'1 kg',price:2500},{sku:'R-2',name:'1.5 kg (half paint)',price:3000},{sku:'R-3',name:'3 kg (paint)',price:5000}]};
test('archives only three prior options after confirming all supplier options',()=>{
 const p={name:'Ijebu Garri',sku:'RUONO-IJEBU-GARRI-2026',hasVariants:true,variants:[{sku:'OLD-1',name:'1.5kg',price:2500},{sku:'OLD-2',name:'3kg',price:5000},{sku:'OLD-3',name:'50kg',price:70000},...source.variants.map(v=>({...v}))]};
 assert.deepEqual(planLegacyCleanup(p,source).oldIndexes,[0,1,2]);
 p.variants[4].price=2500;
 assert.equal(planLegacyCleanup(p,source).oldIndexes,undefined);
});
