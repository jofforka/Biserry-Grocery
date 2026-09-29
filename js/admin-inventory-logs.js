import { protectAdminPage } from "./admin-auth.js";
import { db,collection,getDocs,query,orderBy } from "./firebase-service.js";
protectAdminPage();

const logsList=document.getElementById("logsList");
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function loadLogs(){
  const q=query(collection(db,"inventory_logs"),orderBy("createdAt","desc"));
  const snap=await getDocs(q);
  if(!snap.size){
    logsList.innerHTML='<div class="emptyState">No inventory log yet.</div>';
    return;
  }
  logsList.innerHTML=snap.docs.map(ds=>{
    const l=ds.data();
    return `<div class="logCard"><strong>${esc(l.productName||"Product")}</strong>${l.variantName?`<p>Variant: ${esc(l.variantName)}</p>`:""}<p>Type: ${esc(l.changeType)}</p><p>Quantity: ${Number(l.quantity||0)}</p><p>Reason: ${esc(l.reason||"")}</p></div>`;
  }).join("");
}

loadLogs().catch(e=>alert(e.message));
