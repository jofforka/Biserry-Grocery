import { protectAdminPage } from "./admin-auth.js";
import { db,collection,getDocs } from "./firebase-service.js";
protectAdminPage();

const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function formatNaira(a){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(a||0))}
function isToday(d){const n=new Date();return d.toDateString()===n.toDateString()}
function isThisWeek(d){const n=new Date(),w=new Date();w.setDate(n.getDate()-7);return d>=w&&d<=n}
function isThisMonth(d){const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()}

async function loadReports(){
  const snap=await getDocs(collection(db,"orders"));
  let totalRevenue=0,today=0,week=0,month=0,totalOrders=0,paid=0,pending=0,cancelled=0;
  const productSales={};

  snap.forEach(ds=>{
    const o=ds.data(),t=Number(o.total||0),isCancelled=o.orderStatus==="Cancelled",isPaid=o.paymentStatus==="Paid";
    if(isCancelled){cancelled++;return;}
    totalOrders++;
    if(isPaid){
      paid++;
      totalRevenue+=t;
      const date=o.createdAt?.toDate?o.createdAt.toDate():null;
      if(date){
        if(isToday(date))today+=t;
        if(isThisWeek(date))week+=t;
        if(isThisMonth(date))month+=t;
      }
      (o.items||[]).forEach(i=>{
        const name=String(i.name||"Product");
        productSales[name]=(productSales[name]||0)+Number(i.quantity||1);
      });
    }else pending++;
  });

  document.getElementById("totalRevenue").textContent=formatNaira(totalRevenue);
  document.getElementById("totalOrders").textContent=totalOrders;
  document.getElementById("paidOrders").textContent=paid;
  document.getElementById("pendingOrders").textContent=pending;
  const cancelledEl=document.getElementById("cancelledOrders");if(cancelledEl)cancelledEl.textContent=cancelled;
  document.getElementById("analyticsBreakdown").innerHTML=`<div class="summaryCard"><h3>Today</h3><p>${formatNaira(today)}</p><small>Paid revenue</small></div><div class="summaryCard"><h3>This Week</h3><p>${formatNaira(week)}</p><small>Paid revenue</small></div><div class="summaryCard"><h3>This Month</h3><p>${formatNaira(month)}</p><small>Paid revenue</small></div>`;
  document.getElementById("bestSellers").innerHTML=Object.entries(productSales)
    .sort((a,b)=>b[1]-a[1])
    .map(([name,qty])=>`<p><strong>${esc(name)}</strong> — ${Number(qty)} paid unit${Number(qty)===1?"":"s"}</p>`)
    .join("")||"<p>No paid sales data yet.</p>";
}

loadReports().catch(e=>alert(e.message));
