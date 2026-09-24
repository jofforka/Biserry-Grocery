import admin from 'firebase-admin';
import {readFileSync,writeFileSync} from 'node:fs';
import policy from './legacy-option-policy.cjs';
const {planLegacyCleanup}=policy;
const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw)throw new Error('FIREBASE_SERVICE_ACCOUNT is unavailable');
const credential=JSON.parse(raw);
if(credential.project_id!=='biserry-groceries-os')throw new Error('Firebase project mismatch');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=admin.firestore();
const sources=JSON.parse(readFileSync(new URL('./ruono-variant-sizes.json',import.meta.url),'utf8')).products;
const targetSkus=['RUONO-IJEBU-GARRI-2026','RUONO-IRISH-POTATO-2026','RUONO-GOAT-MEAT-2026'];
const report={archivedProducts:0,archivedVariants:0,review:[]};
for(const sku of targetSkus){
 const matches=(await db.collection('products').where('sku','==',sku).get()).docs.filter(d=>d.get('isActive')===true);
 if(matches.length!==1){report.review.push({sku,reason:'Expected one active product'});continue}
 const doc=matches[0],ref=sources[sku];
 const result=await db.runTransaction(async tx=>{
  const fresh=await tx.get(doc.ref);
  const auditRef=db.doc(`catalogueMaintenance/ruono-legacy-options-2026/products/${doc.id}`);
  const audit=await tx.get(auditRef);
  if(audit.exists)return {reason:'Already archived'};
  const p=fresh.data();if(!fresh.exists||p.isActive!==true||p.sku!==sku)return {reason:'Product changed'};
  const plan=planLegacyCleanup(p,ref);
  if(!plan.oldIndexes)return {reason:plan.reason};
  const variants=p.variants.map((v,i)=>plan.oldIndexes.includes(i)?{...v,isActive:false}:v);
  tx.set(auditRef,{sku,beforeVariants:p.variants,beforePrice:p.price,archivedIndexes:plan.oldIndexes,source:ref,at:admin.firestore.FieldValue.serverTimestamp()});
  tx.update(doc.ref,{variants,price:Number(ref.variants[0].price),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  return {archived:plan.oldIndexes.length};
 });
 if(result.archived){report.archivedProducts++;report.archivedVariants+=result.archived}
 else report.review.push({sku,reason:result.reason});
}
writeFileSync('legacy-options-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(report.review.some(r=>r.reason!=='Already archived'))throw new Error('Unexpected legacy options; see report');
