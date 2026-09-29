import { protectAdminPage } from "./admin-auth.js";
import { db, collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, writeBatch, serverTimestamp } from "./firebase-service.js";
import { BUSINESS } from "./firebase-config.js";
protectAdminPage();

const table=document.getElementById("paymentsTable"),summary=document.getElementById("paymentQueueSummary"),settingsForm=document.getElementById("paymentSettingsForm"),alertsBtn=document.getElementById("enablePaymentAlerts");
const bankName=document.getElementById("bankName"),accountName=document.getElementById("accountName"),accountNumber=document.getElementById("accountNumber"),adminWhatsApp=document.getElementById("adminWhatsApp"),cloudinaryCloudName=document.getElementById("cloudinaryCloudName"),cloudinaryUploadPreset=document.getElementById("cloudinaryUploadPreset");
const money=v=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let seenPending=new Set();

async function loadSettings(){
  const s=await getDoc(doc(db,"app_config","payment")),d=s.exists()?s.data():{};
  for(const [id,value] of [
    ["bankName",d.bankName||""],["accountName",d.accountName||""],["accountNumber",d.accountNumber||""],
    ["cloudinaryCloudName",d.cloudinaryCloudName||""],["cloudinaryUploadPreset",d.cloudinaryUploadPreset||""]
  ]){const el=document.getElementById(id);if(el)el.value=value;}
  if(adminWhatsApp)adminWhatsApp.value=BUSINESS.orderWhatsapp;
}

settingsForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  await setDoc(doc(db,"app_config","payment"),{
    bankName:bankName.value.trim(),
    accountName:accountName.value.trim(),
    accountNumber:accountNumber.value.trim(),
    adminWhatsApp:BUSINESS.orderWhatsapp,
    backupWhatsApp:BUSINESS.backupWhatsapp,
    cloudinaryCloudName:cloudinaryCloudName.value.trim(),
    cloudinaryUploadPreset:cloudinaryUploadPreset.value.trim(),
    updatedAt:serverTimestamp()
  },{merge:true});
  alert("Payment settings saved.");
});

alertsBtn?.addEventListener("click",async()=>{
  if(!("Notification" in window))return alert("Browser notifications are not supported on this device.");
  const p=await Notification.requestPermission();
  alertsBtn.textContent=p==="granted"?"Browser Alerts Enabled":"Enable Browser Alerts";
});

async function reviewPayment(orderId,approved,reason=""){
  const proofRef=doc(db,"paymentProofs",orderId),orderRef=doc(db,"orders",orderId),trackingRef=doc(db,"orderTracking",orderId),dispatchRef=doc(db,"dispatchRequests",orderId);
  const [proofSnap,orderSnap,dispatchSnap]=await Promise.all([getDoc(proofRef),getDoc(orderRef),getDoc(dispatchRef)]);
  if(!proofSnap.exists())throw new Error("Payment proof not found.");
  if(!orderSnap.exists())throw new Error("Order not found.");
  const proof=proofSnap.data(),order=orderSnap.data();
  if(proof.status!=="Awaiting Verification")throw new Error("This payment proof has already been reviewed.");
  if(Number(proof.amount||0)!==Number(order.total||0))throw new Error("Payment amount does not match the order total.");
  if(approved&&order.orderStatus==="Cancelled")throw new Error("Cancelled orders cannot be approved for release.");

  const batch=writeBatch(db),now=serverTimestamp();
  const paymentStatus=approved?"Paid":"Rejected",deliveryReleaseStatus=approved?"Authorized":"Locked";
  batch.update(proofRef,{
    status:approved?"Approved":"Rejected",
    ...(approved?{}:{rejectionReason:reason}),
    reviewedAt:now,updatedAt:now
  });
  batch.update(orderRef,{
    paymentStatus,deliveryReleaseStatus,
    paymentConfirmedAt:approved?now:null,
    updatedAt:now
  });
  batch.set(trackingRef,{paymentStatus,deliveryReleaseStatus,updatedAt:now},{merge:true});
  if(dispatchSnap.exists())batch.update(dispatchRef,{paymentStatus,deliveryReleaseStatus,updatedAt:now});
  await batch.commit();
  return order;
}

window.approvePayment=async orderId=>{
  if(!confirm("Confirm that this bank transfer has been received? This will authorize release of the order."))return;
  try{
    const order=await reviewPayment(orderId,true);
    alert(order.fulfillment==="Pickup"
      ?"Payment approved. The pickup order is now authorized for release."
      :"Payment approved. Delivery release is now authorized.");
  }catch(e){alert("Approval failed: "+e.message)}
};

window.rejectPayment=async orderId=>{
  const reason=prompt("Reason for rejection (optional):","")||"";
  try{
    await reviewPayment(orderId,false,reason);
    alert("Payment proof rejected. The order remains locked and the customer can submit a corrected proof.");
  }catch(e){alert("Rejection failed: "+e.message)}
};

function render(rows){
  const pending=rows.filter(x=>x.status==="Awaiting Verification");
  summary.textContent=`${pending.length} awaiting verification • ${rows.length} recent submissions`;
  table.innerHTML=rows.length?rows.map(p=>`<tr><td><strong>${esc(p.orderId)}</strong><br><small>${esc(p.submittedAt?.toDate?.()?.toLocaleString?.()||"")}</small></td><td><strong>${money(p.amount)}</strong></td><td>${esc(p.paymentReference||"Not supplied")}</td><td>${p.receiptUrl?`<a class="editBtn" target="_blank" rel="noopener" href="${esc(p.receiptUrl)}">View Receipt</a>`:"No image"}</td><td><span class="statusBadge">${esc(p.status||"")}</span>${p.rejectionReason?`<br><small>${esc(p.rejectionReason)}</small>`:""}</td><td>${p.status==="Awaiting Verification"?`<button class="editBtn" onclick="approvePayment('${p.orderId}')">Approve</button> <button class="deleteBtn" onclick="rejectPayment('${p.orderId}')">Reject</button>`:"Reviewed"}</td></tr>`).join(""):`<tr><td colspan="6"><div class="emptyState">No payment submissions yet.</div></td></tr>`;
  if("Notification" in window && Notification.permission==="granted"){
    for(const p of pending){
      if(!seenPending.has(p.orderId)){
        new Notification("New Biserry payment",{body:`${p.orderId} • ${money(p.amount)} awaiting verification`,icon:"../assets/logo.png"});
        seenPending.add(p.orderId);
      }
    }
  }else pending.forEach(p=>seenPending.add(p.orderId));
}

loadSettings().catch(console.warn);
const q=query(collection(db,"paymentProofs"),orderBy("submittedAt","desc"),limit(50));
onSnapshot(q,s=>render(s.docs.map(d=>({id:d.id,...d.data()}))),e=>{table.innerHTML=`<tr><td colspan="6">${esc(e.message)}</td></tr>`});
