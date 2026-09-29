const {chromium}=require(process.env.PLAYWRIGHT_PATH||"playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");

const firebaseStub=String.raw`
const isRider=location.pathname.includes("/dispatcher/");
globalThis.__fbWrites=[];
const TS={toMillis:()=>Date.now()};
const base={
  delivery_zones:{zone1:{zone:"Gwarinpa",fee:2000,isActive:true,commissionPercent:20,biserryCommission:400,riderEarning:1600}},
  dispatchers:{rider1:{authUid:"rider-auth",name:"Rider One",phone:"08010000000",email:"rider@example.com",serviceArea:"Gwarinpa",vehicleType:"Bike",isApproved:true,isActive:true,isAvailable:true,isPublic:true}},
  orderTracking:{"order-smoke":{total:12500,deliveryZoneId:"zone1",deliveryZone:"Gwarinpa",deliveryFee:2000,commissionPercent:20,biserryCommission:400,riderEarning:1600,paymentStatus:"Paid",deliveryReleaseStatus:"Authorized",orderStatus:"Confirmed"}},
  app_config:{payment:{bankName:"Test Bank",accountName:"Biserry",accountNumber:"1234567890",adminWhatsApp:"2348100584211"}}
};
if(isRider){
  base.dispatchRequests={"order-rider":{orderId:"order-rider",dispatcherId:"rider1",dispatcherName:"Rider One",status:"Offered",zoneName:"Gwarinpa",deliveryFee:2000,riderEarning:1600,biserryCommission:400,paymentStatus:"Paid",deliveryReleaseStatus:"Authorized",earningStatus:"Pending",settlementStatus:"Pending"}};
  base.dispatchBookings={"booking-rider":{type:"Standalone Package",serviceType:"Standard",customerName:"Test Customer",customerPhone:"08020000000",pickupAddress:"Wuse 2",dropoffAddress:"Gwarinpa",zoneId:"zone1",zoneName:"Gwarinpa",status:"Assigned",paymentStatus:"Paid",assignedDispatcherId:"rider1",assignedDispatcherName:"Rider One",confirmedFare:2000,riderEarning:1600,biserryCommission:400,commissionPercent:20,earningStatus:"Pending",settlementStatus:"Pending"}};
  base.orders={"order-rider":{customerName:"Grocery Customer",customerPhone:"08030000000",deliveryAddress:"Gwarinpa"}};
  base.orderTracking["order-rider"]={orderStatus:"Confirmed",paymentStatus:"Paid",deliveryReleaseStatus:"Authorized",dispatchStatus:"Requested",total:9000};
}
const store=base;
function snap(id,data){return {id,exists:()=>data!==undefined,data:()=>data,get:(k)=>data?.[k]};}
function list(name,parts=[]){let entries=Object.entries(store[name]||{});for(const p of parts){if(p?.kind==="where")entries=entries.filter(([,d])=>p.op==="=="?d?.[p.field]===p.value:true);}return entries;}
function emitWrite(op,ref,data){globalThis.__fbWrites.push({op,collection:ref.name,id:ref.id||null,data:{...data}});}
export const auth={currentUser:isRider?{uid:"rider-auth",email:"rider@example.com"}:null};
export const authReady=Promise.resolve();
export const db={};
export const collection=(db,name)=>({kind:"collection",name});
export const where=(field,op,value)=>({kind:"where",field,op,value});
export const orderBy=(...args)=>({kind:"orderBy",args});
export const limit=(value)=>({kind:"limit",value});
export const query=(col,...parts)=>({kind:"query",name:col.name,parts});
export const doc=(db,name,id)=>({kind:"doc",name,id});
export const serverTimestamp=()=>TS;
export const getDoc=async ref=>snap(ref.id,store[ref.name]?.[ref.id]);
export const getDocs=async ref=>({empty:list(ref.name,ref.parts).length===0,size:list(ref.name,ref.parts).length,docs:list(ref.name,ref.parts).map(([id,d])=>snap(id,d)),forEach(cb){this.docs.forEach(cb)}});
export const setDoc=async(ref,data,opts)=>{store[ref.name]??={};store[ref.name][ref.id]=opts?.merge?{...(store[ref.name][ref.id]||{}),...data}:{...data};emitWrite("set",ref,data);};
export const updateDoc=async(ref,data)=>{store[ref.name]??={};store[ref.name][ref.id]={...(store[ref.name][ref.id]||{}),...data};emitWrite("update",ref,data);};
export const addDoc=async(ref,data)=>{const id=ref.name==="dispatchBookings"?"booking-smoke":"auto-1";store[ref.name]??={};store[ref.name][id]={...data};emitWrite("add",{name:ref.name,id},data);return {id};};
export const onSnapshot=(ref,ok,err)=>{try{if(ref.kind==="doc")ok(snap(ref.id,store[ref.name]?.[ref.id]));else ok({docs:list(ref.name,ref.parts).map(([id,d])=>snap(id,d))});}catch(e){err?.(e)}return()=>{};};
export const onAuthStateChanged=(auth,cb)=>{queueMicrotask(()=>cb(auth.currentUser));return()=>{};};
export const signInWithEmailAndPassword=async()=>({user:auth.currentUser});
export const createUserWithEmailAndPassword=async()=>({user:{uid:"new-rider",email:"new@example.com"}});
export const signOut=async()=>{auth.currentUser=null};
export const deleteDoc=async()=>{};
`;

(async()=>{
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const file=path.join(root,pathname);
    try{
      const type=file.endsWith(".css")?"text/css":file.endsWith(".js")?"application/javascript":file.endsWith(".html")?"text/html":file.endsWith(".json")?"application/json":"application/octet-stream";
      res.setHeader("Content-Type",type);
      res.end(fs.readFileSync(file));
    }catch{res.statusCode=404;res.end("not found");}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const address=server.address();
  assert.ok(address&&typeof address==="object","smoke-test server did not start");
  const baseUrl=`http://127.0.0.1:${address.port}`;
  const launch={headless:true};if(process.env.CHROMIUM_EXECUTABLE)launch.executablePath=process.env.CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch(launch);
  try{
    const page=await browser.newPage({serviceWorkers:"block"});
    const pageErrors=[];
    page.on("pageerror",e=>{pageErrors.push(e.message);console.error("DISPATCH PAGEERROR:",e.message)});
    page.on("console",m=>{if(m.type()==="error")console.error("DISPATCH CONSOLE:",m.text())});
    await page.route("**/js/firebase-service.js",route=>route.fulfill({contentType:"application/javascript",body:firebaseStub}));

    // Standalone booking: page -> booking write -> public tracking mirror.
    await page.goto(baseUrl+"/dispatch.html",{waitUntil:"networkidle"});
    assert.equal(await page.evaluate(()=>typeof window.requestBiserryDispatcher),"function",`dispatch module did not initialize: ${pageErrors.join(" | ")}`);
    await page.getByRole("button",{name:"Send a Package"}).click();
    assert.equal(await page.locator("#packageMode").evaluate(el=>el.classList.contains("active")),true,`package tab did not activate: ${pageErrors.join(" | ")}`);
    await page.locator("#pickupAddress").fill("Wuse 2, Abuja");
    await page.locator("#dropoffAddress").fill("Gwarinpa, Abuja");
    await page.locator("#deliveryZone").selectOption("zone1");
    await page.locator("#customerName").fill("Smoke Tester");
    await page.locator("#customerPhone").fill("08020000000");
    await page.getByRole("button",{name:/Request Dispatch/}).click();
    await page.locator("#bookingSuccess:not([hidden])").waitFor();
    assert.equal(await page.locator("#bookingRef").textContent(),"booking-smoke");
    let writes=await page.evaluate(()=>globalThis.__fbWrites);
    const booking=writes.find(w=>w.op==="add"&&w.collection==="dispatchBookings");
    assert.ok(booking,"standalone booking was not created");
    assert.equal(booking.data.zoneName,"Gwarinpa");
    assert.ok(writes.some(w=>w.collection==="dispatchBookingTracking"&&w.data.status==="New"));

    // Grocery-linked dispatch: exact order -> available approved rider -> dispatch request.
    await page.evaluate(()=>localStorage.setItem("biserryLastOrder",JSON.stringify({orderId:"order-smoke",deliveryZoneId:"zone1",deliveryZone:"Gwarinpa",deliveryFee:2000,commissionPercent:20,biserryCommission:400,riderEarning:1600,paymentStatus:"Paid",deliveryReleaseStatus:"Authorized"})));
    await page.goto(baseUrl+"/dispatch.html?order=order-smoke",{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".dispatchCard");
    assert.equal(await page.locator(".dispatchCard").count(),1);
    await page.route("**/track-order.html*",route=>route.abort());
    await page.getByRole("button",{name:"Request Dispatcher"}).click();
    await page.waitForTimeout(100);
    writes=await page.evaluate(()=>globalThis.__fbWrites);
    const request=writes.find(w=>w.collection==="dispatchRequests"&&w.id==="order-smoke");
    assert.ok(request,"grocery dispatch request was not created");
    assert.equal(request.data.dispatcherId,"rider1");
    assert.equal(request.data.deliveryFee,2000);
    assert.equal(request.data.riderEarning,1600);
    assert.ok(writes.some(w=>w.collection==="orderTracking"&&w.data.dispatchStatus==="Requested"));

    // Rider app: one standalone + one grocery job, both progress safely to Delivered.
    const rider=await browser.newPage({serviceWorkers:"block"});
    await rider.route("**/js/firebase-service.js",route=>route.fulfill({contentType:"application/javascript",body:firebaseStub}));
    await rider.goto(baseUrl+"/dispatcher/",{waitUntil:"domcontentloaded"});
    await rider.waitForSelector(".jobCard");
    assert.equal(await rider.locator(".jobCard").count(),2);
    await rider.evaluate(async()=>{
      await window.acceptStandalone("booking-rider");
      await window.advanceStandalone("booking-rider","Picked Up");
      await window.advanceStandalone("booking-rider","On the Way");
      await window.advanceStandalone("booking-rider","Arrived");
      await window.advanceStandalone("booking-rider","Delivered");
      await window.acceptOrderJob("order-rider");
      await window.advanceOrderJob("order-rider","Picked Up");
      await window.advanceOrderJob("order-rider","On the Way");
      await window.advanceOrderJob("order-rider","Arrived");
      await window.advanceOrderJob("order-rider","Delivered");
    });
    const riderWrites=await rider.evaluate(()=>globalThis.__fbWrites);
    assert.ok(riderWrites.some(w=>w.collection==="dispatchBookings"&&w.id==="booking-rider"&&w.data.status==="Delivered"&&w.data.earningStatus==="Earned"));
    assert.ok(riderWrites.some(w=>w.collection==="dispatchRequests"&&w.id==="order-rider"&&w.data.status==="Delivered"&&w.data.earningStatus==="Earned"));
    assert.ok(riderWrites.some(w=>w.collection==="dispatchBookingTracking"&&w.id==="booking-rider"&&w.data.status==="Delivered"));
    assert.ok(riderWrites.some(w=>w.collection==="orderTracking"&&w.id==="order-rider"&&w.data.dispatchStatus==="Delivered"));
    await rider.close();

    console.log("Dispatch browser smoke passed: standalone booking, grocery dispatch request, rider acceptance, progression, tracking mirrors, and delivery completion.");
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});
