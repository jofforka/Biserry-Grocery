import { protectAdminPage } from "./admin-auth.js";
import { db,collection,getDocs,getDoc,doc,updateDoc,setDoc,query,orderBy,limit,serverTimestamp,runTransaction } from "./firebase-service.js";
protectAdminPage();

const ordersTable=document.getElementById("ordersTable");
const ORDER_PAGE_SIZE=50;
const statuses=["Pending","Confirmed","Preparing","Dispatcher Assigned","Picked Up","On the Way","Arrived","Delivered","Cancelled"];
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function money(a){return new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(a||0))}
function customer(o){return {name:o.customerName||o.customer?.name||"",phone:o.customerPhone||o.customer?.phone||"",address:o.deliveryAddress||o.customer?.address||"",fulfillment:o.fulfillment||o.customer?.fulfillment||"",deliveryZone:o.deliveryZone||o.customer?.deliveryZone||""};}
function groupedItems(items=[]){
  const map=new Map();
  for(const raw of items){
    const item={...raw,quantity:Number(raw.quantity||0),price:Number(raw.price||0)};
    if(!item.productId||!Number.isFinite(item.quantity)||item.quantity<=0)throw new Error("This order contains an invalid product or quantity.");
    if(!map.has(item.productId))map.set(item.productId,[]);
    map.get(item.productId).push(item);
  }
  return map;
}

async function loadOrders(){
  ordersTable.innerHTML=`<tr><td colspan="7"><div class="emptyState">Loading latest ${ORDER_PAGE_SIZE} orders…</div></td></tr>`;
  const q=query(collection(db,"orders"),orderBy("createdAt","desc"),limit(ORDER_PAGE_SIZE));
  const snap=await getDocs(q);
  const rows=snap.docs.map(ds=>{
    const o=ds.data(),c=customer(o),orderId=ds.id;
    const items=(o.items||[]).map(i=>`${esc(i.name||"Product")} x ${Number(i.quantity||0)}`).join("<br>");
    const stockAction=o.stockRestored
      ?'<br><span class="statusBadge">Stock restored</span>'
      :o.stockDeducted
        ?'<br><span class="statusBadge">Stock deducted</span>'
        :o.paymentStatus==="Paid"&&o.orderStatus!=="Cancelled"
          ?`<br><button class="editBtn" onclick="confirmAndDeductStock('${orderId}')">Confirm & Deduct Stock</button>`
          :'<br><small>Awaiting verified payment before stock confirmation.</small>';
    return `<tr>
      <td><strong>${esc(orderId)}</strong><br><small>${esc(o.dispatchStatus||"")}</small></td>
      <td>${esc(c.name)}<br>${esc(c.phone)}</td>
      <td><strong>${money(o.total||0)}</strong></td>
      <td><strong>${esc(o.paymentStatus||"Unpaid")}</strong><br><small>Release: ${esc(o.deliveryReleaseStatus||"Locked")}</small><br><a class="editBtn" href="payments.html">Payments</a></td>
      <td><select onchange="updateOrderStatus('${orderId}',this.value)">${statuses.map(x=>`<option ${o.orderStatus===x?'selected':''}>${x}</option>`).join("")}</select>
        ${stockAction}
        <br><button class="editBtn" onclick="printInvoice('${orderId}')">Invoice</button>
      </td>
      <td>${esc(c.fulfillment)}<br>${esc(c.address||c.deliveryZone)}</td>
      <td>${items}</td>
    </tr>`;
  });
  ordersTable.innerHTML=rows.join("")||'<tr><td colspan="7"><div class="emptyState">No orders yet.</div></td></tr>';
}

async function applyStockTransaction(orderId,mode){
  const orderRef=doc(db,"orders",orderId),trackingRef=doc(db,"orderTracking",orderId);
  return runTransaction(db,async tx=>{
    const orderSnap=await tx.get(orderRef);
    if(!orderSnap.exists())throw new Error("Order not found.");
    const order=orderSnap.data();

    if(mode==="deduct"){
      if(order.stockDeducted&&!order.stockRestored)return;
      if(order.paymentStatus!=="Paid"||order.deliveryReleaseStatus!=="Authorized")throw new Error("Verify payment before confirming stock.");
      if(order.orderStatus==="Cancelled")throw new Error("Cancelled orders cannot deduct stock.");
    }else{
      if(!order.stockDeducted||order.stockRestored)return;
      if(order.orderStatus==="Delivered")throw new Error("Delivered orders cannot be cancelled and restocked.");
    }

    const groups=groupedItems(order.items||[]);
    const records=[];
    for(const [productId,items] of groups){
      const ref=doc(db,"products",productId),snap=await tx.get(ref);
      if(!snap.exists())throw new Error(`A product in this order no longer exists (${productId}).`);
      records.push({productId,items,ref,data:snap.data()});
    }

    let expectedProductTotal=0;
    const writes=[];
    const logs=[];

    for(const record of records){
      const p=record.data;
      if(mode==="deduct"&&p.isActive!==true)throw new Error(`${p.name||record.productId} is no longer active.`);
      let nextStock=Number(p.stock||0);
      let nextVariants=Array.isArray(p.variants)?p.variants.map(v=>({...v})):[];

      for(const item of record.items){
        const qty=Number(item.quantity||0);
        if(item.variantId){
          if(!p.hasVariants)throw new Error(`${item.name||p.name} no longer uses this size/variant.`);
          const idx=nextVariants.findIndex(v=>String(v.id)===String(item.variantId));
          if(idx<0||nextVariants[idx].isActive===false)throw new Error(`${item.name||p.name} size is no longer available.`);
          const variant=nextVariants[idx],currentStock=Number(variant.stock||0),currentPrice=Number(variant.price||0);
          if(mode==="deduct"){
            if(currentPrice!==Number(item.price))throw new Error(`${item.name||p.name} price changed. Review the order before confirming.`);
            if(currentStock<qty)throw new Error(`Not enough stock for ${item.name||p.name}.`);
            expectedProductTotal+=currentPrice*qty;
            nextVariants[idx]={...variant,stock:currentStock-qty};
          }else{
            nextVariants[idx]={...variant,stock:currentStock+qty};
          }
        }else{
          if(p.hasVariants)throw new Error(`${item.name||p.name} now requires a size/variant.`);
          const currentPrice=Number(p.price||0);
          if(mode==="deduct"){
            if(currentPrice!==Number(item.price))throw new Error(`${item.name||p.name} price changed. Review the order before confirming.`);
            if(nextStock<qty)throw new Error(`Not enough stock for ${item.name||p.name}.`);
            expectedProductTotal+=currentPrice*qty;
            nextStock-=qty;
          }else{
            nextStock+=qty;
          }
        }
        logs.push({item,productName:item.baseProductName||item.name||p.name||record.productId});
      }

      if(p.hasVariants)nextStock=nextVariants.reduce((s,v)=>s+Number(v.stock||0),0);
      writes.push({ref,data:p.hasVariants?{variants:nextVariants,stock:nextStock,updatedAt:serverTimestamp()}:{stock:nextStock,updatedAt:serverTimestamp()}});
    }

    if(mode==="deduct"){
      const storedProductTotal=Number(order.productTotal||0),storedTotal=Number(order.total||0),deliveryFee=Number(order.deliveryFee||0);
      if(expectedProductTotal!==storedProductTotal||expectedProductTotal+deliveryFee!==storedTotal){
        throw new Error("Order totals do not match the current catalogue. Review the order before confirming.");
      }
    }

    for(const w of writes)tx.update(w.ref,w.data);
    for(const log of logs){
      const logRef=doc(collection(db,"inventory_logs"));
      tx.set(logRef,{
        productId:log.item.productId,
        productName:log.productName,
        variantId:log.item.variantId||null,
        variantName:log.item.variantName||null,
        changeType:mode==="deduct"?"deducted":"restocked",
        quantity:Number(log.item.quantity||0),
        reason:`Order ${orderId}`,
        createdAt:serverTimestamp()
      });
    }

    if(mode==="deduct"){
      tx.update(orderRef,{orderStatus:"Confirmed",stockDeducted:true,stockRestored:false,stockConfirmedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      tx.set(trackingRef,{orderStatus:"Confirmed",updatedAt:serverTimestamp()},{merge:true});
    }else{
      tx.update(orderRef,{orderStatus:"Cancelled",stockRestored:true,stockRestoredAt:serverTimestamp(),updatedAt:serverTimestamp()});
      tx.set(trackingRef,{orderStatus:"Cancelled",updatedAt:serverTimestamp()},{merge:true});
    }
  });
}

window.confirmAndDeductStock=async orderId=>{
  if(!confirm("Confirm this paid order and deduct stock?"))return;
  try{
    await applyStockTransaction(orderId,"deduct");
    await loadOrders();
  }catch(e){
    alert("Stock confirmation blocked: "+e.message);
    await loadOrders();
  }
};

window.updateOrderStatus=async(id,val)=>{
  const orderRef=doc(db,"orders",id),snap=await getDoc(orderRef);
  if(!snap.exists())return alert("Order not found.");
  const order=snap.data(),current=order.orderStatus||"Pending";
  if(val===current)return;
  try{
    if(val==="Cancelled"){
      if(current==="Delivered")throw new Error("Delivered orders cannot be cancelled.");
      if(order.stockDeducted&&!order.stockRestored){
        if(!confirm("This order already reduced inventory. Cancel it and restore all stock now?")){await loadOrders();return;}
        await applyStockTransaction(id,"restock");
      }else{
        await updateDoc(orderRef,{orderStatus:"Cancelled",updatedAt:serverTimestamp()});
        await setDoc(doc(db,"orderTracking",id),{orderStatus:"Cancelled",updatedAt:serverTimestamp()},{merge:true});
      }
      await loadOrders();
      return;
    }

    if(val!=="Pending"){
      if(order.paymentStatus!=="Paid"||order.deliveryReleaseStatus!=="Authorized")throw new Error("Payment must be verified before this order can progress.");
      if(!order.stockDeducted||order.stockRestored)throw new Error("Use “Confirm & Deduct Stock” before progressing this order.");
    }

    await updateDoc(orderRef,{orderStatus:val,updatedAt:serverTimestamp()});
    await setDoc(doc(db,"orderTracking",id),{orderStatus:val,updatedAt:serverTimestamp()},{merge:true});
    await loadOrders();
  }catch(e){
    alert("Status change blocked: "+e.message);
    await loadOrders();
  }
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
