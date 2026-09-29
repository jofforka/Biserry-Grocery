const {chromium}=require(process.env.PLAYWRIGHT_PATH||"playwright");
const http=require("node:http"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");

const firebaseStub=String.raw\`
const signed=localStorage.getItem("__accountSmokeSigned")==="1";
const writes=[];
const user=signed?{uid:"buyer-1",email:"buyer@example.com",emailVerified:false,reload:async()=>{},getIdToken:async()=>""}:null;
export const auth={currentUser:user};
export const db={};
export const signInWithEmailAndPassword=async(auth,email)=>{auth.currentUser={uid:"buyer-1",email,emailVerified:false,reload:async()=>{},getIdToken:async()=>""};return{user:auth.currentUser}};
export const createUserWithEmailAndPassword=async(auth,email)=>{auth.currentUser={uid:"new-buyer",email,emailVerified:false,reload:async()=>{},getIdToken:async()=>""};return{user:auth.currentUser}};
export const sendEmailVerification=async u=>{localStorage.setItem("__verificationSent",u.email||"")};
export const sendPasswordResetEmail=async(auth,email)=>{localStorage.setItem("__resetSent",email)};
export const signOut=async auth=>{auth.currentUser=null};
export const onAuthStateChanged=(auth,cb)=>{queueMicrotask(()=>cb(auth.currentUser));return()=>{}};
export const collection=(db,name)=>({name});
export const where=(field,op,value)=>({field,op,value});
export const limit=value=>({value});
export const query=(col,...parts)=>({name:col.name,parts});
export const doc=(db,name,id)=>({name,id});
export const serverTimestamp=()=>({toMillis:()=>Date.now()});
const customer={name:"Buyer One",phone:"08020000000",email:"buyer@example.com",defaultAddress:"Wuse 2",savedLists:[{name:"Old Monthly List",items:[{productId:"p1",variantId:null,name:"Old Rice",price:100,stock:10,quantity:3}]}]};
const product={name:"Current Rice",isActive:true,hasVariants:false,price:150,stock:2,imageUrl:"assets/rice.jpg"};
const order={customerUid:"buyer-1",customerName:"Buyer One",items:[{productId:"p1",variantId:null,name:"Old Rice",price:100,quantity:1}],total:100,paymentStatus:"Paid",orderStatus:"Delivered",createdAt:{seconds:20}};
function snap(id,data){return{id,exists:()=>data!==undefined,data:()=>data};}
export const getDoc=async ref=>{
  if(ref.name==="customers"&&ref.id==="buyer-1")return snap(ref.id,customer);
  if(ref.name==="products"&&ref.id==="p1")return snap(ref.id,product);
  return snap(ref.id,undefined);
};
export const getDocs=async ref=>{
  if(ref.name==="orders")return{docs:[snap("order-1",order)]};
  return{docs:[]};
};
export const setDoc=async(ref,data)=>{writes.push({ref,data});localStorage.setItem("__accountWrites",JSON.stringify(writes))};
\`;

(async()=>{
  const server=http.createServer((req,res)=>{
    let pathname=new URL(req.url,"http://localhost").pathname;
    if(pathname==="/")pathname="/account.html";
    const file=path.join(root,pathname);
    try{
      const type=file.endsWith(".css")?"text/css":file.endsWith(".js")?"application/javascript":file.endsWith(".html")?"text/html":"application/octet-stream";
      res.setHeader("Content-Type",type);res.end(fs.readFileSync(file));
    }catch{res.statusCode=404;res.end("not found")}
  });
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  const address=server.address();assert.ok(address&&typeof address==="object");
  const base=\`http://127.0.0.1:\${address.port}\`;
  const launch={headless:true};if(process.env.CHROMIUM_EXECUTABLE)launch.executablePath=process.env.CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch(launch);
  try{
    const page=await browser.newPage({serviceWorkers:"block"});
    await page.route("**/js/firebase-service.js",route=>route.fulfill({contentType:"application/javascript",body:firebaseStub}));
    page.on("dialog",d=>d.accept());

    // Password recovery works from signed-out account page.
    await page.goto(base+"/account.html",{waitUntil:"networkidle"});
    await page.locator("#customerLoginEmail").fill("buyer@example.com");
    await page.locator("#customerPasswordResetBtn").click();
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>localStorage.getItem("__resetSent")),"buyer@example.com");

    // Signed-in profile renders, shows verification state, and refreshes stale saved list from live catalogue.
    await page.evaluate(()=>localStorage.setItem("__accountSmokeSigned","1"));
    await page.reload({waitUntil:"networkidle"});
    await page.locator("#accountProfile:not(.hidden)").waitFor();
    assert.match(await page.locator("#customerEmailStatus").textContent(),/not verified/i);
    assert.equal(await page.locator("#customerShoppingLists .accountOrderCard").count(),1);

    await page.getByRole("button",{name:"Add to Cart"}).click();
    await page.waitForURL(/cart\.html/);
    const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("biserryCart")||"[]"));
    assert.equal(cart.length,1);
    assert.equal(cart[0].name,"Current Rice");
    assert.equal(cart[0].price,150);
    assert.equal(cart[0].stock,2);
    assert.equal(cart[0].quantity,2);

    console.log("Account browser smoke passed: password reset, signed-in profile, email status, and live-catalogue saved-list rebuild.");
  } finally {
    await browser.close();server.close();
  }
})().catch(e=>{console.error(e);process.exit(1)});
