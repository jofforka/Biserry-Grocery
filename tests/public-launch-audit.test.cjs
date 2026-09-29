const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");

const publicPages=[
  "index.html","shop.html","farmers-market.html","dispatch.html",
  "cart.html","checkout.html","payment.html","order-success.html",
  "track-order.html","dispatch-track.html","account.html","offline.html"
];
const transactional=["cart.html","checkout.html","payment.html","order-success.html","track-order.html","dispatch-track.html","account.html","offline.html"];
const mobileNavPages=["index.html","shop.html","cart.html","checkout.html","farmers-market.html","payment.html","track-order.html","dispatch.html","dispatch-track.html","account.html"];
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

function localRefs(html){
  const refs=[];
  for(const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){
    let ref=m[1].trim();
    if(!ref||ref.startsWith("#")||/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref))continue;
    ref=ref.split("#")[0].split("?")[0];
    if(!ref||ref==="./")continue;
    refs.push(ref.replace(/^\.\//,""));
  }
  return refs;
}

test("all local public-page links and assets resolve",()=>{
  const missing=[];
  for(const page of publicPages){
    const html=read(page);
    const base=path.dirname(page);
    for(const ref of localRefs(html)){
      const target=path.normalize(path.join(base,ref));
      if(!fs.existsSync(path.join(root,target)))missing.push(page+" -> "+ref);
    }
  }
  assert.deepEqual(missing,[]);
});

test("transactional and private pages are noindex",()=>{
  for(const page of transactional){
    assert.match(read(page),/<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']/i,page);
  }
});

test("mobile workflow pages keep reachable navigation",()=>{
  for(const page of mobileNavPages){
    const html=read(page);
    assert.match(html,/id=["']mobileMenuBtn["']/i,page+" missing mobile menu button");
    assert.match(html,/id=["']mainNav["']/i,page+" missing main nav");
    if(["payment.html","track-order.html","dispatch.html","dispatch-track.html","account.html"].includes(page)){
      assert.match(html,/js\/mobile-nav\.js/i,page+" missing mobile-nav.js");
    }else{
      assert.match(html,/js\/store\.js/i,page+" missing store mobile nav");
    }
  }
});

test("support and order WhatsApp routes stay separated",()=>{
  const cfg=read("js/firebase-config.js");
  assert.match(cfg,/phone:\s*"\+234 810 058 4211"/);
  assert.match(cfg,/whatsapp:\s*"2348100584211"/);
  assert.match(cfg,/orderWhatsapp:\s*"2348118103510"/);
  assert.match(cfg,/backupWhatsapp:\s*"2348137216136"/);
  assert.match(read("js/payment.js"),/BUSINESS\.orderWhatsapp/);
  assert.match(read("js/order-success.js"),/BUSINESS\.orderWhatsapp/);
  assert.match(read("js/order-tracking.js"),/BUSINESS\.whatsapp/);
  assert.match(read("js/dispatch.js"),/BUSINESS\.whatsapp/);
});

test("public SEO pages have canonical URLs and private pages stay out of sitemap",()=>{
  const seoPages=["index.html","shop.html","farmers-market.html","dispatch.html"];
  for(const page of seoPages)assert.match(read(page),/<link\s+rel=["']canonical["']/i,page);
  const sitemap=read("sitemap.xml");
  for(const page of ["cart.html","checkout.html","payment.html","order-success.html","track-order.html","dispatch-track.html","account.html"]){
    assert.doesNotMatch(sitemap,new RegExp(page.replace(".","\\."),"i"));
  }
});

test("final service worker rotates cache and includes shared mobile/account assets",()=>{
  const sw=read("service-worker.js");
  assert.match(sw,/biserry-groceries-v11-8-final-launch/);
  assert.match(sw,/\.\/js\/mobile-nav\.js/);
  assert.match(sw,/\.\/js\/customer-account\.js/);
  assert.match(sw,/\.\/js\/order-success\.js/);
});
