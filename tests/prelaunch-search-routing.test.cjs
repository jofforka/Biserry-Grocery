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

test('public and order WhatsApp routes remain separated',()=>{
  const config=fs.readFileSync(path.join(root,'js','firebase-config.js'),'utf8');
  assert.match(config,/whatsapp:\s*"2348100584211"/);
  assert.match(config,/orderWhatsapp:\s*"2348118103510"/);
  assert.match(config,/backupWhatsapp:\s*"2348137216136"/);
  const success=fs.readFileSync(path.join(root,'js','order-success.js'),'utf8');
  assert.match(success,/BUSINESS\.orderWhatsapp/);
  assert.match(success,/BUSINESS\.backupWhatsapp/);
});
