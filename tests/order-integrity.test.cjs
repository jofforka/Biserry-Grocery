const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("firebase service exposes Firestore transactions",()=>{
  const src=read("js/firebase-service.js");
  assert.match(src,/runTransaction/);
  assert.ok((src.match(/runTransaction/g)||[]).length>=2);
});

test("order confirmation is payment-gated and atomic",()=>{
  const src=read("js/admin-orders.js");
  assert.match(src,/runTransaction\(db,async tx=>/);
  assert.match(src,/order\.paymentStatus!=="Paid"\|\|order\.deliveryReleaseStatus!=="Authorized"/);
  assert.match(src,/expectedProductTotal!==storedProductTotal\|\|expectedProductTotal\+deliveryFee!==storedTotal/);
  assert.match(src,/currentStock<qty/);
  assert.match(src,/currentPrice!==Number\(item\.price\)/);
  assert.match(src,/stockDeducted:true/);
});

test("cancelled confirmed orders restore stock atomically",()=>{
  const src=read("js/admin-orders.js");
  assert.match(src,/applyStockTransaction\(id,"restock"\)/);
  assert.match(src,/changeType:mode==="deduct"\?"deducted":"restocked"/);
  assert.match(src,/stockRestored:true/);
  assert.match(src,/Delivered orders cannot be cancelled and restocked/);
});

test("admin order progression cannot bypass payment or stock confirmation",()=>{
  const src=read("js/admin-orders.js");
  assert.match(src,/Payment must be verified before this order can progress/);
  assert.match(src,/Use “Confirm & Deduct Stock” before progressing this order/);
  assert.match(src,/Awaiting verified payment before stock confirmation/);
});

test("pickup orders do not expose dispatch calls to action",()=>{
  const success=read("js/order-success.js");
  const payment=read("js/payment.js");
  const tracking=read("js/order-tracking.js");
  assert.match(success,/order\?\.fulfillment==="Pickup"/);
  assert.match(success,/dispatchLink\.style\.display="none"/);
  assert.match(payment,/tracking\.fulfillment==="Pickup"/);
  assert.match(tracking,/o\.fulfillment==="Delivery"\?/);
});
