import { protectAdminPage } from "./admin-auth.js";
import { db, collection, getDocs } from "./firebase-service.js";
protectAdminPage();

const customersTable=document.getElementById("customersTable");
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function formatNaira(amount){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(amount||0))}

async function loadCustomers(){
  const snap=await getDocs(collection(db,"customers"));
  customersTable.innerHTML=snap.docs.map(docSnap=>{
    const c=docSnap.data();
    return `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.fulfillment)}</td><td>${esc(c.paymentMethod)}</td><td>${formatNaira(c.lastOrderTotal||0)}</td></tr>`;
  }).join("")||'<tr><td colspan="5"><div class="emptyState">No customers yet.</div></td></tr>';
}
loadCustomers().catch(error=>alert(error.message));
