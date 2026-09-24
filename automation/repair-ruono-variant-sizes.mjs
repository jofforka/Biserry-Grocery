import admin from 'firebase-admin';
import {readFileSync,writeFileSync} from 'node:fs';
import policy from './variant-size-policy.cjs';
const {planVariantNames}=policy;
const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is unavailable');
const credential=JSON.parse(raw);
if(credential.project_id!=='biserry-groceries-os') throw new Error('Firebase project mismatch');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=admin.firestore();
const references=JSON.parse(readFileSync(new URL('./ruono-variant-sizes.json',import.meta.url),'utf8'));
const apply=process.env.APPLY_VARIANT_SIZES==='true';
const snap=await db.collection('products').where('isActive','==',true).get();
const report={mode:apply?'apply':'preview',source:references.source,activeProducts:snap.size,sourceProducts:Object.keys(references.products).length,matched:0,changedProducts:0,changedVariants:0,alreadyCorrect:0,review:[],changes:[]};
const bySku=new Map();
for(const doc of snap.docs){const sku=String(doc.get('sku')||'').trim();if(sku){const docs=bySku.get(sku)||[];docs.push(doc);bySku.set(sku,docs)}}
for(const [sku,ref] of Object.entries(references.products)){
 const matches=bySku.get(sku)||[];
 if(matches.length!==1){report.review.push({sku,name:ref.name,reason:matches.length?'Duplicate active SKU':'No active product with exact SKU'});continue}
 const doc=matches[0];const plan=planVariantNames(doc.data(),ref);
 if(!plan.changes){report.review.push({sku,id:doc.id,name:ref.name,reason:plan.reason});continue}
 report.matched++;
 if(!plan.changes.length){report.alreadyCorrect++;continue}
 if(!apply){report.changedProducts++;report.changedVariants+=plan.changes.length;report.changes.push({sku,id:doc.id,changes:plan.changes});continue}
 const result=await db.runTransaction(async tx=>{
  const fresh=await tx.get(doc.ref);const p=fresh.data();
  if(!fresh.exists||p.isActive!==true||p.sku!==sku) return {reason:'Product changed during update'};
  const latest=planVariantNames(p,ref);
  if(!latest.changes) return {reason:latest.reason};
  if(!latest.changes.length) return {changes:[]};
  const variants=p.variants.map((v,i)=>{const change=latest.changes.find(c=>c.index===i);return change?{...v,name:change.newName}:v});
  tx.update(doc.ref,{variants,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  return {changes:latest.changes};
 });
 if(!result.changes){report.review.push({sku,id:doc.id,reason:result.reason});continue}
 report.changedProducts+=Number(result.changes.length>0);report.changedVariants+=result.changes.length;
 report.changes.push({sku,id:doc.id,changes:result.changes});
}
writeFileSync('variant-size-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,activeProducts:report.activeProducts,sourceProducts:report.sourceProducts,matched:report.matched,changedProducts:report.changedProducts,changedVariants:report.changedVariants,alreadyCorrect:report.alreadyCorrect,review:report.review.length}));
