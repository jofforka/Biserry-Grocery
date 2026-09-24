// Deliberately small, reviewed source registry. Add suppliers only after verifying
// their identity and image hosts; the model cannot extend this registry.
const SOURCES = [
 {domain:'nestle-cwa.com',type:'manufacturer',imageHosts:['nestle-cwa.com']},
 {domain:'supermart.ng',type:'retailer',imageHosts:['supermart.ng','cdn.shopify.com','shopifycdn.net']},
 {domain:'pricepally.com',type:'retailer',imageHosts:['pricepally.com']},
 {domain:'jendolstores.com',type:'retailer',imageHosts:['jendolstores.com','cdn.shopify.com']}
];
const normalize = value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const decode = text => String(text||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ');
function safeUrl(value, domains) {
 try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && (!u.port||u.port==='443') && domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)); } catch {return false;}
}
function sourceFor(url){return SOURCES.find(s=>safeUrl(url,[s.domain]));}
function hasRealImage(item) {
 const images=[item.imageUrl,item.image].filter(Boolean).map(String);
 return images.some(image=>!/(?:^|\/)(?:logo|placeholder|no-image|noimage)(?:\.[a-z]+)?(?:[?#].*)?$/i.test(image.trim()) && !/(?:^|\/)assets\/(?:rice|beans|vegetable-oil|spaghetti|tomato-paste|eggs|fresh-vegetables|beverages|household)\.jpg(?:[?#].*)?$/i.test(image.trim()));
}
function pack(value) {
 const s=String(value||'').toLowerCase().replace(/×/g,'x');
 const m=s.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
 if(!m)return null;
 const count=s.match(/(\d+)\s*x\s*\d/)?.[1] || s.match(/\b(?:pack of|x)\s*(\d+)\b/)?.[1] || '1';
 return {quantity:Number(m[1])*({kg:1000,g:1,l:1000,cl:10,ml:1}[m[2]]),dimension:['g','kg'].includes(m[2])?'mass':'volume',count:Number(count)};
}
function matches(item, evidence) {
 const brand=normalize(item.brand);
 if(!brand)return false;
 const title=normalize(evidence.name);
 const observedBrand=normalize(typeof evidence.brand==='object'?evidence.brand?.name:evidence.brand);
 if(observedBrand ? observedBrand!==brand : !(' '+title+' ').includes(' '+brand+' '))return false;
 const expected=pack(item.packSize||item.name);
 const actual=pack(evidence.size||evidence.name);
 if(!expected||!actual||JSON.stringify(expected)!==JSON.stringify(actual))return false;
 const terms = value => [...new Set(normalize(String(value||'').replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|cl|l)\b/gi,'').replace(/\b\d+\s*x\b|\bx\s*\d+\b/gi,'')).split(' ').filter(t=>t&&!['pack','of','x',...brand.split(' ')].includes(t)))].sort();
 const expectedTerms=terms(item.name),observedTerms=terms(evidence.name);
 return expectedTerms.length>0 && JSON.stringify(expectedTerms)===JSON.stringify(observedTerms);
}
function attributes(tag) {
 const result={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]);return result;
}
function pageProducts(html) {
 const products=[];
 function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v))return v.forEach(walk);if([v['@type']].flat().includes('Product'))products.push(v);if(v['@graph'])walk(v['@graph']);}
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if(attributes(m[1]).type?.toLowerCase()==='application/ld+json')try{walk(JSON.parse(m[2]));}catch{}
 }
 if(!products.length){
  const meta={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attributes(m[0]);meta[a.property||a.name]=a.content;}
  if(/product/i.test(meta['og:type']||'')) products.push({name:meta['og:title'],image:meta['og:image:secure_url']||meta['og:image'],brand:meta['product:brand']});
 }
 return products;
}
async function trustedFetch(url,domains,fetcher=fetch,method='GET') {
 for(let i=0;i<4;i++) {
  if(!safeUrl(url,domains))throw new Error('Unapproved URL or redirect');
  const res=await fetcher(url,{method,redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'user-agent':'BiserryCatalogueBot/2.0'}});
  if([301,302,303,307,308].includes(res.status)){const next=res.headers.get('location');await res.body?.cancel();url=new URL(next,url).href;continue;}
  if(!res.ok)throw new Error('Source HTTP '+res.status);
  return {res,url};
 }
 throw new Error('Too many redirects');
}
async function boundedText(res) {
 if(!String(res.headers.get('content-type')).includes('text/html'))throw new Error('Source is not HTML');
 const reader=res.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>500000)throw new Error('Source page exceeds limit');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel();}
}
async function resolveImage(item,pageUrl,fetcher=fetch) {
 const source=sourceFor(pageUrl);
 if(!source)return {status:'needs-review',reason:'Source domain requires review',sourcePageUrl:pageUrl};
 try{
  const {res,url}=await trustedFetch(pageUrl,[source.domain],fetcher);
  const candidates=pageProducts(await boundedText(res)).filter(p=>matches(item,p));
  if(candidates.length!==1)return {status:'needs-review',reason:'No unique exact product, brand and pack match',sourcePageUrl:url};
  const product=candidates[0];const raw=[product.image].flat()[0];const imageUrl=new URL(typeof raw==='object'?raw.url||raw.contentUrl:raw,url).href;
  const image=await trustedFetch(imageUrl,source.imageHosts,fetcher,'HEAD');
  if(!/^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(image.res.headers.get('content-type')||''))throw new Error('Not a supported product image');
  return {status:'verified',imageUrl:image.url,imageSourcePageUrl:url,imageConfidence:95,imageSourceType:source.type,imageMatchedName:product.name,imageMatchBasis:'Approved product page; exact name terms, brand, pack quantity, unit dimension and count; image MIME checked',imageVerifiedAt:new Date().toISOString()};
 }catch(error){return {status:'needs-review',reason:error.message,sourcePageUrl:pageUrl};}
}
module.exports={SOURCES,hasRealImage,pack,matches,sourceFor,safeUrl,pageProducts,trustedFetch,resolveImage};
