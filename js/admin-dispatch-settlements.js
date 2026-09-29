import { protectAdminPage } from "./admin-auth.js";
import { db,collection,query,where,getDocs,doc,updateDoc,serverTimestamp } from "./firebase-service.js";

protectAdminPage();

const table=document.getElementById("settlementsTable"),summary=document.getElementById("settlementSummary");
const money=v=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function load(){
  const [grocerySnap,standaloneSnap]=await Promise.all([
    getDocs(query(collection(db,"dispatchRequests"),where("status","==","Delivered"))),
    getDocs(query(collection(db,"dispatchBookings"),where("status","==","Delivered")))
  ]);
  const rows=[
    ...grocerySnap.docs.map(d=>({id:d.id,source:"grocery",reference:d.data().orderId||d.id,...d.data()})),
    ...standaloneSnap.docs.map(d=>({id:d.id,source:"standalone",reference:d.id,...d.data()}))
  ];
  const outstanding=rows.filter(r=>r.settlementStatus!=="Paid").reduce((s,r)=>s+Number(r.riderEarning||0),0);
  const paid=rows.filter(r=>r.settlementStatus==="Paid").reduce((s,r)=>s+Number(r.riderEarning||0),0);
  const biserry=rows.reduce((s,r)=>s+Number(r.biserryCommission||0),0);
  summary.innerHTML=`<strong>Outstanding rider settlements: ${money(outstanding)}</strong> • Paid: ${money(paid)} • Biserry dispatch commission earned: ${money(biserry)}`;
  table.innerHTML=rows.length?rows.map(r=>`<tr><td><strong>${esc(r.reference)}</strong><br><small>${r.source==="standalone"?"Standalone dispatch":"Grocery order"}</small></td><td>${esc(r.dispatcherName||r.assignedDispatcherName||"")}</td><td>${esc(r.zoneName||r.deliveryZone||"")}</td><td>${money(r.deliveryFee??r.confirmedFare)}</td><td>${money(r.biserryCommission)}</td><td><strong>${money(r.riderEarning)}</strong></td><td>${esc(r.settlementStatus||"Pending")}</td><td>${r.settlementStatus!=="Paid"?`<button class="editBtn" onclick="markRiderPaid('${r.source}','${r.id}')">Mark Paid</button>`:"Settled"}</td></tr>`).join(""):`<tr><td colspan="8"><div class="emptyState">No completed rider jobs yet.</div></td></tr>`;
}

window.markRiderPaid=async(source,id)=>{
  if(!confirm("Confirm this rider earning has been paid?"))return;
  const collectionName=source==="standalone"?"dispatchBookings":"dispatchRequests";
  await updateDoc(doc(db,collectionName,id),{settlementStatus:"Paid",settledAt:serverTimestamp(),updatedAt:serverTimestamp()});
  load();
};

load().catch(e=>alert(e.message));
