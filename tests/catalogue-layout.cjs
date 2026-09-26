const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const fixture=Array.from({length:24},(_,i)=>({id:'test-'+i,name:i%2?'Premium Long Grain Parboiled Rice':'Golden Morn Maize and Soya Cereal',brand:'Nestle',category:'grains',price:6000,stock:30,isActive:true,isFeatured:true,imageUrl:'assets/rice.jpg',hasVariants:i%2===0,variants:i%2===0?[{id:'300g',name:'300g',price:3000,stock:30},{id:'600g',name:'600g',price:6000,stock:40}]:[]}));
const stub=`export const db={};export const collection=()=>({});export const query=()=>({});export const where=()=>({});export const limit=()=>({});export const startAfter=()=>({});export const serverTimestamp=()=>null;export const addDoc=async()=>({});export const getDocs=async()=>({size:24,docs:${JSON.stringify(fixture)}.map(p=>({id:p.id,data:()=>p}))});`;
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'image/jpeg');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
 const launchOptions={headless:true};if(process.env.CHROMIUM_EXECUTABLE)launchOptions.executablePath=process.env.CHROMIUM_EXECUTABLE;
 const browser=await chromium.launch(launchOptions);const page=await browser.newPage({serviceWorkers:'block'});
 await page.route('**/js/firebase-service.js',route=>route.fulfill({contentType:'application/javascript',body:stub}));
 const rows=[];
 try{
 for(const file of ['shop.html','index.html']) for(const [width,expected] of [[390,2],[1024,4],[1366,5],[1600,6]]){
  await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}/${file}`,{waitUntil:'domcontentloaded'});await page.waitForSelector('.productGrid .card');
  const result=await page.locator('.productGrid').evaluate(grid=>{const card=grid.querySelector('.card'),img=card.querySelector('.productImageButton');return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,cardHeight:card.getBoundingClientRect().height,imageHeight:img.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(result.columns,expected);assert.equal(result.imageHeight,width>760?170:104);assert.equal(result.overflow,false);if(width>760)assert.ok(result.cardHeight<430,JSON.stringify(result));rows.push({file,width,...result});
  if(file==='shop.html'&&width===1366){await page.locator('#shop').screenshot({path:path.join(os.tmpdir(),'biserry-desktop.png')});await page.locator('.variantBox select').first().selectOption('600g');await page.locator('.addBtn').first().click();const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('biserryCart')));assert.equal(cart[0].variantId,'600g');assert.equal(cart[0].price,6000);}
 }
 console.log(JSON.stringify(rows,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
