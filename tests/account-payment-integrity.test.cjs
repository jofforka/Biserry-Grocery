const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("dashboard metrics match report definitions",()=>{
  const src=read("js/admin-dashboard.js");
  assert.match(src,/activeOrders=orderRows\.filter\(o=>o\.orderStatus!=="Cancelled"\)/);
  assert.match(src,/paidRows=activeOrders\.filter\(o=>o\.paymentStatus==="Paid"\)/);
  assert.match(src,/unpaidRows=activeOrders\.filter\(o=>o\.paymentStatus!=="Paid"\)/);
  assert.match(src,/paidRevenue=paidRows\.reduce/);
  assert.match(src,/cancelledRows=orderRows\.filter/);
});

test("grocery payment review is atomic and validates live order commercials",()=>{
  const src=read("js/admin-payments.js");
  assert.match(src,/writeBatch/);
  assert.match(src,/validateOrderCommercials/);
  assert.match(src,/Payment amount does not match the order total/);
  assert.match(src,/Order totals do not match the current catalogue/);
  assert.match(src,/Cancelled orders cannot be approved for release/);
  assert.match(src,/safeHttpsUrl/);
  assert.match(src,/BUSINESS\.orderWhatsapp/);
});

test("standalone payment review uses safe urls and atomic writes",()=>{
  const src=read("js/admin-dispatch-bookings.js");
  assert.match(src,/safeHttpsUrl/);
  assert.match(src,/writeBatch/);
  assert.match(src,/Payment proof amount does not match the confirmed fare/);
  assert.match(src,/dispatchBookingTracking/);
});

test("customer account supports password recovery and verification",()=>{
  const service=read("js/firebase-service.js");
  const account=read("js/customer-account.js");
  const html=read("account.html");
  assert.match(service,/sendPasswordResetEmail/);
  assert.match(account,/sendPasswordResetEmail/);
  assert.match(account,/sendEmailVerification/);
  assert.match(html,/customerPasswordResetBtn/);
  assert.match(html,/customerEmailStatus/);
});

test("buy again and saved lists refresh from current catalogue",()=>{
  const src=read("js/customer-account.js");
  assert.match(src,/async function rebuildCartFromItems/);
  assert.match(src,/await getDoc\(doc\(db,"products",productId\)\)/);
  assert.match(src,/Number\(v\.price\|\|0\)/);
  assert.match(src,/Number\(p\.stock\|\|0\)/);
  assert.match(src,/window\.loadSavedList=async/);
  assert.match(src,/window\.buyOrderAgain=async/);
  assert.doesNotMatch(src,/JSON\.stringify\(l\.items\|\|\[\]\)/);
});

test("reorder suggestions use paid non-cancelled order history",()=>{
  const src=read("js/customer-account.js");
  assert.match(src,/filter\(o=>o\.paymentStatus==="Paid"&&o\.orderStatus!=="Cancelled"\)/);
  assert.match(src,/renderReorderSuggestions\(orders\)/);
});
