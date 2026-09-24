const {test}=require('node:test');const assert=require('node:assert/strict');
const {hasRealImage,matches,pack,resolveImage,trustedFetch}=require('../functions/image-policy.cjs');
const item={name:'Nestle Golden Morn',brand:'Nestle',packSize:'300g'};
test('pack size distinguishes mass, volume and multipacks',()=>{
 assert.notDeepEqual(pack('500g'),pack('500ml'));assert.deepEqual(pack('1kg'),pack('1000g'));
 assert.notDeepEqual(pack('2 x 300g'),pack('300g'));
});
test('rejects another product, brand or pack',()=>{
 assert.equal(matches(item,{name:'Nestle Golden Morn 300g'}),true);
 for(const name of ['Nestle Golden Morn 600g','Nestle Milk 300g','Other Golden Morn 300g','Nestle Golden Morn 300ml'])assert.equal(matches(item,{name}),false);
 assert.equal(matches({...item,brand:''},{name:'Nestle Golden Morn 300g'}),false);
});
test('recognizes placeholders, retains actual photos',()=>{
 assert.equal(hasRealImage({imageUrl:'assets/logo.png'}),false);assert.equal(hasRealImage({imageUrl:'https://store.test/placeholder.png'}),false);
 assert.equal(hasRealImage({imageUrl:'assets/item.jpg'}),true);
});
test('rejects unapproved redirects before requesting destination',async()=>{
 const calls=[];await assert.rejects(()=>trustedFetch('https://supermart.ng/product',['supermart.ng'],async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})}));
 assert.equal(calls.length,1);
});
test('accepts only a unique product image and validates MIME',async()=>{
 const product={'@type':'Product',name:'Nestle Golden Morn 300g',image:'https://cdn.shopify.com/item.png'};
 const fetcher=async(url,options)=>options.method==='HEAD'?new Response(null,{headers:{'content-type':'image/png'}}):new Response(`<script type="application/ld+json">${JSON.stringify(product)}</script>`,{headers:{'content-type':'text/html'}});
 const result=await resolveImage(item,'https://supermart.ng/products/golden',fetcher);assert.equal(result.status,'verified');assert.equal(result.imageConfidence,95);
 const bad=await resolveImage({...item,packSize:'500g'},'https://supermart.ng/products/golden',fetcher);assert.equal(bad.status,'needs-review');
});
test('generic pages and arbitrary image hosts are rejected',async()=>{
 const fetcher=async()=>new Response('<title>Nestle Golden Morn 300g</title><meta property="og:image" content="https://cdn.shopify.com/item.png">',{headers:{'content-type':'text/html'}});
 assert.equal((await resolveImage(item,'https://supermart.ng/search',fetcher)).status,'needs-review');
 assert.equal((await resolveImage(item,'https://random.test/product',fetcher)).status,'needs-review');
});
