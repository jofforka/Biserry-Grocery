const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("dispatch storefront keeps standalone zones human-readable and hides stale riders",()=>{
  const src=read("js/dispatch.js");
  assert.match(src,/zoneLabel=z=>String\(z\?\.name\|\|z\?\.zoneName\|\|z\?\.zone/);
  assert.match(src,/filter\(d=>d\.isApproved===true&&d\.isActive===true&&d\.isAvailable===true\)/);
  assert.match(src,/zoneName:z\?zoneLabel\(z\):""/);
});

test("dispatch autopilot respects scheduled pickup and total rider workload",()=>{
  const src=read("automation/biserry-autopilot.mjs");
  assert.match(src,/scheduledAssignmentLeadMinutes:\s*30/);
  assert.match(src,/shouldWaitForScheduledPickup/);
  assert.match(src,/Waiting for Scheduled Pickup/);
  assert.match(src,/collection\("dispatchRequests"\)/);
  assert.match(src,/data\.assignedDispatcherId \|\| data\.dispatcherId/);
});

test("settlement ledger includes grocery and standalone dispatch",()=>{
  const src=read("js/admin-dispatch-settlements.js");
  assert.match(src,/collection\(db,"dispatchRequests"\)/);
  assert.match(src,/collection\(db,"dispatchBookings"\)/);
  assert.match(src,/source==="standalone"\?"dispatchBookings":"dispatchRequests"/);
});

test("dispatch rules prevent riders from self-settling and earning early",()=>{
  const rules=read("firestore.rules.v11.1-stability");
  assert.match(rules,/request\.resource\.data\.settlementStatus == resource\.data\.settlementStatus/);
  assert.match(rules,/request\.resource\.data\.status == 'Delivered'[\s\S]*request\.resource\.data\.earningStatus == resource\.data\.earningStatus/);
  assert.match(rules,/request\.resource\.data\.status != 'Delivered'[\s\S]*request\.resource\.data\.earningStatus == 'Earned'/);
});

test("service worker rotates cache for dispatch hardening",()=>{
  assert.match(read("service-worker.js"),/biserry-groceries-v11-6-dispatch-hardening/);
});
