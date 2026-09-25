const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data','ruono-product-images.json'),'utf8'));
const allowedPages=new Set([
  'CAAC19A5-2DFC-41C5-BDEF-F87143DD9753.jpeg',
  'F26C9AB0-2C71-401E-966D-8CD349A9019E.jpeg',
  'EACA4F01-D6E5-40EB-BED6-C638C6F0F8AB.jpeg',
  '82918AF1-549E-44FE-9030-A94FCA31C90A.jpeg',
  '45BBCF72-D195-416D-BD66-434FA73FF323.jpeg',
  '749C0965-ABD9-412A-B576-FC84EDB13CCF.jpeg',
  'D7DE73B8-307A-42DA-8798-4EDB72019280.jpeg',
  '84D1F70B-8C00-4D64-AC3B-6D509D4DC7AF.jpeg',
]);

function webpDimensions(buffer){
  const marker=buffer.indexOf(Buffer.from('VP8 '));
  assert.ok(marker>=0,'expected a lossy VP8 WebP payload');
  assert.equal(buffer.subarray(marker+11,marker+14).toString('hex'),'9d012a');
  return [buffer.readUInt16LE(marker+14)&0x3fff,buffer.readUInt16LE(marker+16)&0x3fff];
}

test('Ruono manifest contains exactly 107 unique local catalogue crops',()=>{
  assert.equal(manifest.count,107);
  assert.equal(manifest.products.length,107);
  assert.equal(new Set(manifest.products.map(item=>item.name)).size,107);
  assert.equal(new Set(manifest.products.map(item=>item.imageUrl)).size,107);
  for(const item of manifest.products){
    assert.match(item.imageUrl,/^assets\/ruono-products\/[a-z0-9-]+\.webp$/);
    assert.ok(allowedPages.has(item.sourceCataloguePage));
    assert.equal(item.sourceCrop.length,4);
    assert.ok(item.sourceCrop.every(Number.isInteger));
    const absolute=path.resolve(root,item.imageUrl);
    assert.equal(path.dirname(absolute),path.join(root,'assets','ruono-products'));
    const size=fs.statSync(absolute).size;
    assert.ok(size>=2500&&size<=30000,`${item.imageUrl} has an unreasonable byte size: ${size}`);
    const bytes=fs.readFileSync(absolute);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
    assert.deepEqual(webpDimensions(bytes),[512,512]);
  }
});

test('optimized hero banner is the expected responsive PNG',()=>{
  const hero=path.join(root,'assets','hero-banner.png');
  const bytes=fs.readFileSync(hero);
  assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
  assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[1600,900]);
  assert.ok(bytes.length>=500000&&bytes.length<=2500000,`hero banner byte size is unexpected: ${bytes.length}`);
  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(home,/assets\/hero-banner\.png\?v=20260925-enhanced/);
});

test('store cache-busts the enhanced Ruono asset paths',()=>{
  const store=fs.readFileSync(path.join(root,'js','store.js'),'utf8');
  assert.match(store,/RUONO_ASSET_VERSION = "20260925-enhanced"/);
  assert.match(store,/assets\/ruono-products\//);
  for(const page of ['index.html','shop.html','cart.html','checkout.html','farmers-market.html']){
    assert.match(fs.readFileSync(path.join(root,page),'utf8'),/js\/store\.js\?v=20260925-enhanced/,page);
  }
});

test('asset directory has no unmapped or missing thumbnails',()=>{
  const expected=manifest.products.map(item=>path.basename(item.imageUrl)).sort();
  const actual=fs.readdirSync(path.join(root,'assets','ruono-products')).filter(file=>file.endsWith('.webp')).sort();
  assert.deepEqual(actual,expected);
});
