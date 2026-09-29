import { protectAdminPage } from "./admin-auth.js";
import { db,collection,getDocs,getDoc,doc,updateDoc,setDoc,addDoc,query,orderBy,limit,serverTimestamp } from "./firebase-service.js";
protectAdminPage();

const ordersTable=document.getElementById("ordersTable");
const ORDER_PAGE_SIZE=50;
const statuses=["Pending","Confirmed","Preparing","Dispatcher Assigned","Picked Up","On the Way","Arrived","Delivered","Cancelled"];
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function money(a){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(a||0))}
function customer(o){return {name:o.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",address:o.deliveryAddress||o.customer?.address||"",fulfillment:o.fulfillment||o.customer?.fulfillment||"",deliveryZone:o.deliveryZone||o.customer?.deliveryZone||""};}

async function loadOrders(){
  ordersTable.innerHTML=`<tr><td colspan="7"><div class="emptyState">Loading latest ${ORDER_PAGE_SIZE} orders…</div></td></tr>`;
  const q=query(collection(db,"orders"),orderBy("createdAt","desc"),limit(ORDER_PAGE_SIZE));
  const snap=await getDocs(q);
  const rows=snap.docs.map(ds=>{
    const o=ds.data(),c=customer(o);
    const items=(o.items||[]).map(i=>`${esc(i.name||"Product")} x ${Number(i.quantity||0)}`).join("<br>");
    const orderId=ds.id;
    return `<tr>
      <td><strong>${esc(orderId)}</strong><br><small>${esc(o.dispatchStatus||"")}</small></td>
      <td>${esc(c.name)}<br>${esc(c.phone)}</td>
      <td><strong>${money(o.total||0)}</strong></td>
      <td><strong>${esc(o.paymentStatus||"Unpaid")}</strong><br><small>Release: ${esc(o.deliveryReleaseStatus||"Locked")}</small><br><a class="editBtn" href="payments.html">Payments</a></td>
      <td><select onchange="updateOrderStatus('${orderId}',this.value)">${statuses.map(x=>`<option ${o.orderStatus===x?'selected':''}>${x}</option>`).join("")}</select>
        ${!o.stockDeducted?`<br><button class="editBtn" onclick="confirmAndDeductStock('${orderId}')">Confirm & Deduct Stock</button>`:`<br><span class="statusBadge">Stock deducted</span>`}
        <br><button class="editBtn" onclick="printInvoice('${orderId}')">Invoice</button>
      </td>
      <td>${esc(c.fulfillment)}<br>${esc(c.address||c.deliveryZone)}</td>
      <td>${items}</td>
    </tr>`;
  });
  ordersTable.innerHTML=rows.join("")||`<tr><td colspan="7"><div class="emptyState">No orders yet.</div></td></tr>`;
}

async function deductStockForOrder(orderId,order){
  for(const item of order.items||[]){
    const productRef=doc(db,"products",item.productId);
    const productSnap=await getDoc(productRef);
    if(!productSnap.exists())continue;
    const p=productSnap.data();
    if(item.variantId&&p.hasVariants){
      const updated=(p.variants||[]).map(v=>String(v.id)===String(item.variantId)?{...v,stock:Math.max(0,Number(v.stock||0)-Number(item.quantity||0))}:v);
      await updateDoc(productRef,{variants:updated,stock:updated.reduce((s,v)=>s+Number(v.stock||0),0),updatedAt:serverTimestamp()});
    }else{
      await updateDoc(productRef,{stock:Math.max(0,Number(p.stock||0)-Number(item.quantity||0)),updatedAt:serverTimestamp()});
    }
    await addDoc(collection(db,"inventory_logs"),{productId:item.productId,productName:item.baseProductName||item.name,variantId:item.variantId||null,variantName:item.variantName||null,changeType:"deducted",quantity:Number(item.quantity||0),reason:`Order ${orderId}`,createdAt:serverTimestamp()});
  }
}

window.confirmAndDeductStock=async orderId=>{
  if(!confirm("Confirm this order and deduct stock?"))return;
  const orderRef=doc(db,"orders",orderId),snap=await getDoc(orderRef);
  if(!snap.exists())return alert("Order not found.");
  const order=snap.data();
  if(order.stockDeducted)return alert("Stock already deducted.");
  try{
    await deductStockForOrder(orderId,order);
    await updateDoc(orderRef,{orderStatus:"Confirmed",stockDeducted:true,updatedAt:serverTimestamp()});
    await setDoc(doc(db,"orderTracking",orderId),{orderStatus:"Confirmed",updatedAt:serverTimestamp()},{merge:true});
    await loadOrders();
  }catch(e){alert("Stock deduction failed: "+e.message)}
};

window.updateOrderStatus=async(id,val)=>{
  await updateDoc(doc(db,"orders",id),{orderStatus:val,updatedAt:serverTimestamp()});
  await setDoc(doc(db,"orderTracking",id),{orderStatus:val,updatedAt:serverTimestamp()},{merge:true});
};
window.updatePayment=async(id,val)=>{
  await updateDoc(doc(db,"orders",id),{paymentStatus:val,updatedAt:serverTimestamp()});
  await setDoc(doc(db,"orderTracking",id),{paymentStatus:val,updatedAt:serverTimestamp()},{merge:true});
};

window.printInvoice=async orderId=>{
  const snap=await getDoc(doc(db,"orders",orderId));
  if(!snap.exists())return;
  const o=snap.data(),c=customer(o);
  const rows=(o.items||[]).map(i=>`<div class="row"><span>${esc(i.name||"Product")} x ${Number(i.quantity||0)}</span><strong>${money(Number(i.price)*Number(i.quantity))}</strong></div>`).join("");
  const html=`<html><head><title>Invoice ${esc(orderId)}</title><style>body{font-family:Arial;padding:30px}h1{color:#0f4f2b}.box{border:1px solid #ddd;padding:20px;border-radius:14px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}.total{font-size:22px;font-weight:900;color:#0f4f2b}</style></head><body><h1>Biserry Groceries</h1><p><strong>Invoice:</strong> ${esc(orderId)}</p><p><strong>Customer:</strong> ${esc(c.name)}</p><p><strong>Phone:</strong> ${esc(c.phone)}</p><p><strong>Address:</strong> ${esc(c.address)}</p><div class="box">${rows}<div class="row total"><span>Total</span><strong>${money(o.total||0)}</strong></div></div><p>Thank you for shopping with Biserry Groceries.</p><script>window.print()<\/script></body></html>`;
  const w=window.open("","_blank");
  if(!w)return alert("Allow pop-ups to print this invoice.");
  w.document.write(html);
  w.document.close();
};

loadOrders().catch(e=>alert(e.message));
