const CACHE="biserry-dispatcher-v8-free-max";
const CORE=["./","./index.html","./app.js","../css/styles.css","../assets/logo.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("biserry-dispatcher-")&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
async function networkFirst(req){try{const res=await fetch(req,{cache:"no-store"});if(res&&res.ok){const c=await caches.open(CACHE);c.put(req,res.clone());}return res;}catch{return (await caches.match(req))||Response.error();}}
async function cacheFirst(req){const cached=await caches.match(req);if(cached)return cached;try{const res=await fetch(req);if(res&&res.ok){const c=await caches.open(CACHE);c.put(req,res.clone());}return res;}catch{return Response.error();}}
self.addEventListener("fetch",event=>{const req=event.request;if(req.method!=="GET")return;const url=new URL(req.url);if(url.hostname.includes("firestore.googleapis.com")||url.hostname.includes("firebase")||url.hostname.includes("googleapis.com"))return;const dynamic=req.mode==="navigate"||req.destination==="document"||req.destination==="script"||req.destination==="style";event.respondWith(dynamic?networkFirst(req):cacheFirst(req));});
