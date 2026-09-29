const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('full catalogue search index includes yam and is meaningfully complete',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'data','product-search-index.json'),'utf8'));
  assert.ok(data.count>=1200);
  assert.equal(data.products.length,data.count);
  assert.ok(data.products.some(p=>/^yam$/i.test(p.n)||/yam tuber/i.test(p.n)),'Yam is missing from search index');
});

test('store uses on-demand full catalogue search and grouped categories',()=>{
  const store=fs.readFileSync(path.join(root,'js','store.js'),'utf8');
  assert.match(store,/async function searchFullCatalogue\(term\)/);
  assert.match(store,/product-search-index\.json/);
  assert.match(store,/where\("name","in",batch\)/);
  assert.match(store,/catalogueCategoryHeader/);
  assert.match(store,/CATEGORY_ORDER=\["grains","oil","spices","fresh","drinks","household"\]/);
});

test('WhatsApp routing uses the primary operational number with backup copy',()=>{
  const config=fs.readFileSync(path.join(root,'js','firebase-config.js'),'utf8');
  assert.match(config,/whatsapp:\s*"2348118103510"/);
  assert.match(config,/orderWhatsapp:\s*"2348118103510"/);
  assert.match(config,/backupWhatsapp:\s*"2348137216136"/);
  assert.match(config,/legacyHomepagePhone:\s*"\+234 810 058 4211"/);

  const success=fs.readFileSync(path.join(root,'js','order-success.js'),'utf8');
  assert.match(success,/BUSINESS\.orderWhatsapp/);
  assert.match(success,/BUSINESS\.backupWhatsapp/);

  const operationalFiles=[
    'shop.html','cart.html','checkout.html','farmers-market.html','dispatch.html',
    'dispatch-track.html','payment.html','track-order.html','order-success.html','account.html',
    'admin/payments.html','js/order-tracking.js','js/payment.js','js/dispatch.js',
    'js/dispatch-track.js','js/store.js','js/app.js','js/admin-payments.js'
  ];
  for(const file of operationalFiles){
    const src=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(src,/2348100584211|\+234 810 058 4211|08100584211/,file+' still uses the old operational WhatsApp number');
  }

  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(home,/\+234 811 810 3510/);
  assert.match(home,/\+234 810 058 4211/);
  assert.doesNotMatch(home,/wa\.me\/2348100584211/);
});
