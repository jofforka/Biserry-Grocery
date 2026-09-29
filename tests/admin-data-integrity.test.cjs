const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("product admin escapes imported product data and avoids inline JSON payloads",()=>{
  const src=read("js/admin-products.js");
  assert.match(src,/const esc=v=>/);
  assert.doesNotMatch(src,/encodeURIComponent\(JSON\.stringify\(product\)\)/);
  assert.match(src,/onclick="editProduct\('\$\{id\}'\)"/);
  assert.match(src,/Stock cannot be negative/);
});

test("bulk catalogue import blocks negative commercial values",()=>{
  const src=read("js/admin-bulk-upload.js");
  assert.match(src,/Selling price cannot be negative/);
  assert.match(src,/Cost price cannot be negative/);
  assert.match(src,/Stock cannot be negative/);
  assert.match(src,/Low-stock threshold cannot be negative/);
});

test("sales reports only count paid non-cancelled orders as revenue",()=>{
  const src=read("js/admin-reports.js");
  assert.match(src,/isCancelled=o\.orderStatus==="Cancelled"/);
  assert.match(src,/isPaid=o\.paymentStatus==="Paid"/);
  assert.match(src,/if\(isCancelled\)\{cancelled\+\+;return;\}/);
  assert.match(src,/if\(isPaid\)\{/);
  assert.match(src,/totalRevenue\+=t/);
});

test("customer records include registered and guest buyers from orders",()=>{
  const src=read("js/admin-customers.js");
  assert.match(src,/getDocs\(collection\(db,"customers"\)\)/);
  assert.match(src,/getDocs\(collection\(db,"orders"\)\)/);
  assert.match(src,/registered:false/);
  assert.match(src,/Guest/);
  assert.match(src,/paidSpend/);
});
