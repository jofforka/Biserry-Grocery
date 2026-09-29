import { protectAdminPage } from "./admin-auth.js";
import { db, collection, getDocs } from "./firebase-service.js";
protectAdminPage();

const customersTable=document.getElementById("customersTable");
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function formatNaira(amount){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(amount||0))}
const phoneKey=v=>String(v||"").replace(/\D/g,"");
const timeMs=v=>v?.toMillis?.()||v?.toDate?.()?.getTime?.()||0;

async function loadCustomers(){
  const [customerSnap,orderSnap]=await Promise.all([
    getDocs(collection(db,"customers")),
    getDocs(collection(db,"orders"))
  ]);

  const records=new Map(),phoneToKey=new Map(),emailToKey=new Map();

  customerSnap.docs.forEach(ds=>{
    const d=ds.data(),key=`uid:${ds.id}`,phone=phoneKey(d.phone),email=String(d.email||"").trim().toLowerCase();
    records.set(key,{key,registered:true,name:d.name||"",phone:d.phone||"",email:d.email||"",defaultAddress:d.defaultAddress||"",orders:0,paidSpend:0,lastOrderAt:0,lastOrderTotal:0,lastStatus:"",lastFulfillment:""});
    if(phone)phoneToKey.set(phone,key);
    if(email)emailToKey.set(email,key);
  });

  orderSnap.docs.forEach(ds=>{
    const o=ds.data(),phone=phoneKey(o.customerPhone),email=String(o.customerEmail||"").trim().toLowerCase();
    let key=o.customerUid?`uid:${o.customerUid}`:"";
    if(!records.has(key)&&email&&emailToKey.has(email))key=emailToKey.get(email);
    if(!records.has(key)&&phone&&phoneToKey.has(phone))key=phoneToKey.get(phone);
    if(!key)key=phone?`phone:${phone}`:email?`email:${email}`:`order:${ds.id}`;

    if(!records.has(key)){
      records.set(key,{key,registered:false,name:o.customerName||"Guest customer",phone:o.customerPhone||"",email:o.customerEmail||"",defaultAddress:o.deliveryAddress||"",orders:0,paidSpend:0,lastOrderAt:0,lastOrderTotal:0,lastStatus:"",lastFulfillment:""});
    }

    const rec=records.get(key),created=timeMs(o.createdAt);
    rec.orders++;
    if(o.paymentStatus==="Paid"&&o.orderStatus!=="Cancelled")rec.paidSpend+=Number(o.total||0);
    if(created>=rec.lastOrderAt){
      rec.lastOrderAt=created;
      rec.lastOrderTotal=Number(o.total||0);
      rec.lastStatus=o.orderStatus||"Pending";
      rec.lastFulfillment=o.fulfillment||"";
      rec.name=o.customerName||rec.name;
      rec.phone=o.customerPhone||rec.phone;
      rec.email=o.customerEmail||rec.email;
    }
  });

  const rows=[...records.values()].filter(r=>r.orders>0||r.registered).sort((a,b)=>b.lastOrderAt-a.lastOrderAt||String(a.name).localeCompare(String(b.name)));
  customersTable.innerHTML=rows.length?rows.map(c=>`<tr>
    <td><strong>${esc(c.name||"Customer")}</strong>${c.email?`<br><small>${esc(c.email)}</small>`:""}</td>
    <td>${esc(c.phone||"—")}</td>
    <td>${c.registered?'<span class="statusBadge">Account</span>':'<span class="statusBadge">Guest</span>'}</td>
    <td><strong>${Number(c.orders||0)}</strong></td>
    <td><strong>${formatNaira(c.paidSpend)}</strong></td>
    <td>${c.lastOrderAt?new Date(c.lastOrderAt).toLocaleDateString():"—"}<br><small>${esc(c.lastStatus||"")} ${esc(c.lastFulfillment||"")}</small><br><strong>${formatNaira(c.lastOrderTotal)}</strong></td>
  </tr>`).join(""):'<tr><td colspan="6"><div class="emptyState">No customers yet.</div></td></tr>';
}
loadCustomers().catch(error=>alert(error.message));
