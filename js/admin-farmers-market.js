import { protectAdminPage } from "./admin-auth.js";
import { db, collection, getDocs, doc, updateDoc, query, orderBy } from "./firebase-service.js";
protectAdminPage();

const table=document.getElementById("farmersRequestsTable");
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function loadRequests(){
  try{
    const q=query(collection(db,"farmers_market_requests"),orderBy("createdAt","desc"));
    const snap=await getDocs(q);
    if(snap.empty){table.innerHTML='<tr><td colspan="8">No farmers market requests yet.</td></tr>';return;}
    table.innerHTML=snap.docs.map(docSnap=>{
      const r=docSnap.data();
      const phone=String(r.customerPhone||"").replace(/\D/g,"");
      return `<tr>
        <td><strong>${esc(r.customerName)}</strong></td>
        <td>${esc(r.customerPhone)}</td>
        <td>${esc(r.deliveryAddress)}</td>
        <td>${esc(r.shoppingList)}</td>
        <td>${esc(r.budgetRange)}</td>
        <td>${esc(r.preferredDeliveryDate)}</td>
        <td><select onchange="updateRequestStatus('${docSnap.id}', this.value)">${["New","Sourcing","Confirmed","Delivered","Cancelled"].map(s=>`<option value="${s}" ${r.status===s?"selected":""}>${s}</option>`).join("")}</select></td>
        <td><a class="btn small" target="_blank" rel="noopener" href="https://wa.me/${phone}">WhatsApp</a></td>
      </tr>`;
    }).join("");
  }catch(error){
    table.innerHTML=`<tr><td colspan="8">Failed to load requests: ${esc(error.message)}</td></tr>`;
  }
}
window.updateRequestStatus=async function(id,status){try{await updateDoc(doc(db,"farmers_market_requests",id),{status});}catch(error){alert("Status update failed: "+error.message);}};
loadRequests();
