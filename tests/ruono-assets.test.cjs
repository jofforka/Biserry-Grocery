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
    assert.ok(fs.statSync(absolute).size>500,`${item.imageUrl} is unexpectedly small`);
    assert.equal(fs.readFileSync(absolute).subarray(0,4).toString('ascii'),'RIFF');
  }
});

test('asset directory has no unmapped or missing thumbnails',()=>{
  const expected=manifest.products.map(item=>path.basename(item.imageUrl)).sort();
  const actual=fs.readdirSync(path.join(root,'assets','ruono-products')).filter(file=>file.endsWith('.webp')).sort();
  assert.deepEqual(actual,expected);
});
