import admin from "firebase-admin";
import policy from "./stock-policy.cjs";
const {stockFloor}=policy;

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is unavailable");
const credential = JSON.parse(raw);
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
if(credential.project_id !== "biserry-groceries-os") throw new Error("Firebase project mismatch");
const db = admin.firestore();
const migration=db.doc("catalogueMaintenance/stock-floor-30-v1");
if((await migration.get()).get("completed")) {console.log("Stock migration already completed; no changes made.");process.exit(0);}
const minimum = 30;
const snap = await db.collection("products").where("isActive","==",true).get();
let productsChanged=0, variantsChanged=0, unchanged=0;
for (const doc of snap.docs) {
  const result = await db.runTransaction(async tx => {
    const fresh = await tx.get(doc.ref);
    if (!fresh.exists || fresh.get("isActive") !== true) return null;
    const p = fresh.data();
    const {patch,changedVariants}=stockFloor(p,minimum);
    const changed=Object.keys(patch).length>0;
    if(changed) {
      const audit=migration.collection("products").doc(doc.id);
      const previous=await tx.get(audit);
      if(!previous.exists) tx.set(audit,{beforeStock:p.stock??null,beforeVariants:p.variants??null,afterStock:patch.stock??p.stock??null,afterVariants:patch.variants??p.variants??null,at:admin.firestore.FieldValue.serverTimestamp()});
      tx.update(doc.ref,{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    }
    return {changed,variants:changedVariants};
  });
  if (result?.changed) productsChanged++; else unchanged++;
  variantsChanged+=result?.variants||0;
}
const verify=await db.collection("products").where("isActive","==",true).get();
const below=[];
for (const doc of verify.docs) {
  const p=doc.data();
  if (!(Number(p.stock)>=minimum)) below.push(doc.id);
  if (p.variants?.length) {
    for (const v of p.variants) if(v.isActive!==false && !(Number(v.stock)>=minimum)) below.push(`${doc.id}/${v.id}`);
  }
}
console.log(JSON.stringify({activeProducts:verify.size,productsChanged,variantsChanged,unchanged,remainingBelowMinimum:below.length}));
if(below.length) throw new Error(`Stock verification failed for ${below.slice(0,5).join(", ")}`);

await migration.set({completed:true,activeProducts:verify.size,productsChanged,variantsChanged,completedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
