const {test}=require('node:test'),assert=require('node:assert/strict');
const {planVariantNames}=require('../automation/variant-size-policy.cjs');
const ref={name:'Sun Oil Premium Vegetable Oil',variants:[{name:'5 L',sku:'SUN-5',price:15000},{name:'10 L',sku:'SUN-10',price:29000},{name:'25 L',sku:'SUN-25',price:65000}]};
test('recovers size labels when all ordered prices match',()=>{
 const p={name:ref.name,hasVariants:true,variants:ref.variants.map(v=>({name:ref.name,price:v.price,stock:40}))};
 assert.deepEqual(planVariantNames(p,ref).changes.map(c=>c.newName),['5 L','10 L','25 L']);
});
test('reordered variants match by exact SKU and price',()=>{
 const p={name:ref.name,hasVariants:true,variants:ref.variants.slice().reverse().map(v=>({name:ref.name,sku:v.sku,price:v.price}))};
 assert.deepEqual(planVariantNames(p,ref).changes.map(c=>c.newName),['25 L','10 L','5 L']);
});
test('ambiguous price mismatch and product mismatch remain for review',()=>{
 const p={name:ref.name,hasVariants:true,variants:ref.variants.map(v=>({name:ref.name,price:v.price}))};
 p.variants[1].price=30000;
 assert.equal(planVariantNames(p,ref).changes,undefined);
 assert.equal(planVariantNames({...p,name:'Other'},ref).changes,undefined);
});
