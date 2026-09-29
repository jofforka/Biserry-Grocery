const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("dispatch browser module parses cleanly",()=>{
  const src=read("js/dispatch.js").replace(/^(?:import[^\n]*\n)+/,"");
  assert.doesNotThrow(()=>new Function(src));
});

test("dispatch storefront keeps standalone zones human-readable and hides stale riders",()=>{
  const src=read("js/dispatch.js");
  assert.match(src,/zoneLabel=z=>String\(z\?\.name\|\|z\?\.zoneName\|\|z\?\.zone/);
  assert.match(src,/filter\(d=>d\.isApproved===true&&d\.isActive===true&&d\.isAvailable===true\)/);
  assert.match(src,/zoneName:z\?zoneLabel\(z\):""/);
  const zoneLoader=src.match(/async function loadZones\(\)\{[^\n]+/)?.[0]||"";
  assert.doesNotMatch(zoneLoader,/isApproved|isAvailable/);
  assert.match(src,/renderDispatchers\(s\.docs\.map\(d=>\(\{id:d\.id,\.\.\.d\.data\(\)\}\)\)\.filter\(d=>d\.isApproved===true&&d\.isActive===true&&d\.isAvailable===true\)\)/);
});

test("dispatch autopilot respects scheduled pickup and total rider workload",()=>{
  const src=read("automation/biserry-autopilot.mjs");
  assert.match(src,/scheduledAssignmentLeadMinutes:\s*30/);
  assert.match(src,/shouldWaitForScheduledPickup/);
  assert.match(src,/Waiting for Scheduled Pickup/);
  assert.match(src,/collection\("dispatchRequests"\)/);
  assert.match(src,/data\.assignedDispatcherId \|\| data\.dispatcherId/);
});

test("settlement ledger includes both dispatch modes and hides zero-value rider rows",()=>{
  const src=read("js/admin-dispatch-settlements.js");
  assert.match(src,/collection\(db,"dispatchRequests"\)/);
  assert.match(src,/collection\(db,"dispatchBookings"\)/);
  assert.match(src,/source==="standalone"\?"dispatchBookings":"dispatchRequests"/);
  assert.match(src,/filter\(r=>Number\(r\.riderEarning\|\|0\)>0\)/);
});

test("completed dispatch bookings expose only safe read/contact actions",()=>{
  const src=read("js/admin-dispatch-bookings.js");
  assert.match(src,/const terminal=\["Delivered","Cancelled"\]\.includes\(b\.status\)/);
  assert.match(src,/!terminal&&!paid\?[^\n]*Quote \/ Override/);
  assert.match(src,/!terminal&&!paid&&b\.confirmedFare!=null\?[^\n]*Mark Paid/);
  assert.match(src,/const assignable=!terminal&&paid&&b\.status==="Ready"/);
  assert.match(src,/!terminal\?[^\n]*Cancel/);
});

test("dispatch rules prevent riders from self-settling and earning early",()=>{
  const rules=read("firestore.rules.v11.1-stability");
  assert.match(rules,/request\.resource\.data\.settlementStatus == resource\.data\.settlementStatus/);
  assert.match(rules,/request\.resource\.data\.status == 'Delivered'[\s\S]*request\.resource\.data\.earningStatus == resource\.data\.earningStatus/);
  assert.match(rules,/request\.resource\.data\.status != 'Delivered'[\s\S]*request\.resource\.data\.earningStatus == 'Earned'/);
});

test("service worker rotates cache for final launch",()=>{
  assert.match(read("service-worker.js"),/biserry-groceries-v11-8-final-launch/);
});
