import admin from 'firebase-admin';
import policy from '../functions/image-policy.cjs';
const {SOURCES,hasRealImage,resolveImage,sourceFor,pack}=policy;
const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'null');
if(account?.project_id!=='biserry-groceries-os')throw new Error('Firebase project mismatch or missing credential');
admin.initializeApp({credential:admin.credential.cert(account),projectId:account.project_id});
const db=admin.firestore();
const key=process.env.GEMINI_API_KEY||'';
let searches=0;
async function discover(item){
 if(!key||searches>=5)return [];
 searches++;
 const prompt=`Find up to three exact product DETAIL page URLs for ${JSON.stringify({name:item.name,brand:item.brand,packSize:item.packSize})}. Prefer the manufacturer, then supplier, then reputable retailer. Use only these reviewed domains: ${SOURCES.map(s=>s.domain).join(', ')}. Do not return search, category or image-search pages. Do not change brand or pack size. Return only a JSON array of URLs. Return [] if uncertain.`;
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],tools:[{google_search:{}}]})});
 if(!response.ok)throw new Error('Gemini HTTP '+response.status);
 const data=await response.json();
 const text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
 const json=text.match(/\[[\s\S]*\]/)?.[0];if(!json)return [];
 const urls=JSON.parse(json);return Array.isArray(urls)?urls.filter(x=>typeof x==='string'&&sourceFor(x)).slice(0,3):[];
}
const snapshot=await db.collection('products').where('isActive','==',true).get();
let checked=0,updated=0,review=0;const results=[];
const tasks=[];
for(const doc of snapshot.docs){
 const p=doc.data();
 if(!hasRealImage(p)&&!p.hasVariants)tasks.push({doc,item:p});
 for(const [index,v] of (p.variants||[]).entries())if(v.isActive!==false&&!hasRealImage(v))tasks.push({doc,index,item:{...p,...v,name:p.name+' '+(v.name||''),packSize:v.packSize||v.name||p.packSize,brand:v.brand||p.brand}});
}
// Known source pages first. Previously attempted rows rotate behind new ones.
tasks.sort((a,b)=>Boolean(b.item.imageSourcePageUrl||b.item.productSourceUrl)-Boolean(a.item.imageSourcePageUrl||a.item.productSourceUrl)||String(a.item.imageCheckedAt||'').localeCompare(String(b.item.imageCheckedAt||'')));
for(const task of tasks.slice(0,15)){
 checked++;const {item,doc,index}=task;let outcome;
 if(!item.brand || !pack(item.packSize||item.name))outcome={status:'needs-review',reason:'Confirmed brand and pack size required'};
 else{
  let pages=[item.imageSourcePageUrl,item.productSourceUrl].filter(Boolean);
  if(!pages.length)try{pages=await discover(item);}catch(e){outcome={status:'needs-review',reason:e.message};}
  pages=[...new Set(pages)].sort((a,b)=>(sourceFor(a)?.type==='manufacturer'?0:sourceFor(a)?.type==='supplier'?1:2)-(sourceFor(b)?.type==='manufacturer'?0:sourceFor(b)?.type==='supplier'?1:2));
  for(const page of pages){outcome=await resolveImage(item,page);if(outcome.status==='verified')break;}
  outcome ||= {status:'needs-review',reason:key?'No exact source found':'No source page; Gemini key not configured'};
 }
 const applied=await db.runTransaction(async tx=>{
  const fresh=await tx.get(doc.ref);if(!fresh.exists||fresh.get('isActive')!==true)return false;
  const p=fresh.data();const target=index===undefined?p:p.variants?.[index];
  if(!target||target.isActive===false||hasRealImage(target))return false;
  if(index===undefined?(p.name!==item.name||p.brand!==item.brand||p.packSize!==item.packSize):(p.name+' '+(target.name||'')!==item.name|| (target.brand||p.brand)!==item.brand || (target.packSize||target.name||p.packSize)!==item.packSize))return false;
  const patch={imageCheckedAt:new Date().toISOString(),imageStatus:outcome.status};
  if(outcome.status==='verified'){const {status,...verified}=outcome;Object.assign(patch,verified);}
  else Object.assign(patch,{imageReviewReason:outcome.reason,imageCandidateSourceUrl:outcome.sourcePageUrl||''});
  if(index===undefined)tx.update(doc.ref,patch);
  else tx.update(doc.ref,{variants:p.variants.map((v,i)=>i===index?{...v,...patch}:v)});
  return outcome.status==='verified';
 });
 if(applied)updated++;else review++;
 results.push({productId:doc.id,variantIndex:index??null,name:item.name,status:outcome.status,applied,reason:outcome.reason||'',source:outcome.imageSourcePageUrl||outcome.sourcePageUrl||''});
}
console.log(JSON.stringify({activeProducts:snapshot.size,missingImageTasks:tasks.length,checked,updated,review,searches,geminiConfigured:Boolean(key),results},null,2));
