import {
  auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, collection, addDoc, getDocs, getDoc, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp
} from "../js/firebase-service.js";

const $ = id => document.getElementById(id);
const authCard=$("authCard"), profileCard=$("profileCard"), jobsCard=$("dispatcherJobsCard"), earningsCard=$("dispatcherEarningsCard");
const loginForm=$("loginForm"), registerForm=$("registerForm"), profileName=$("profileName"), profileArea=$("profileArea"), approvalStatus=$("approvalStatus");
const availabilityBtn=$("availabilityBtn"), availabilityHelp=$("availabilityHelp"), riderOutstanding=$("riderOutstanding"), riderSettled=$("riderSettled"), riderCompleted=$("riderCompleted");
const loginEmail=$("loginEmail"), loginPassword=$("loginPassword"), registerEmail=$("registerEmail"), registerPassword=$("registerPassword"), registerName=$("registerName"), registerPhone=$("registerPhone"), registerArea=$("registerArea"), registerVehicle=$("registerVehicle");
const logoutDispatcherBtn=$("logoutDispatcherBtn"), showLoginBtn=$("showLoginBtn"), showRegisterBtn=$("showRegisterBtn"), enableJobNotifications=$("enableJobNotifications");
let profile=null, unsubscribeJobs=null, seenOffers=new Set(), orderCache=new Map();

const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
const friendlyOrder=id=>`BS-${String(id||"").slice(-6).toUpperCase()}`;
const activeStatuses=["Offered","Accepted","Picked Up","On the Way","Arrived"];

function toggleForms(register=false){loginForm.classList.toggle("hidden",register);registerForm.classList.toggle("hidden",!register)}
async function findProfile(uid){const q=query(collection(db,"dispatchers"),where("authUid","==",uid));const snap=await getDocs(q);return snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()}}

function renderProfile(){
  if(!profile)return;
  profileName.textContent=profile.name||"Dispatcher";
  profileArea.textContent=[profile.serviceArea,profile.vehicleType].filter(Boolean).join(" • ");
  const approved=profile.isApproved===true&&profile.isActive===true;
  approvalStatus.textContent=profile.isApproved===true?(profile.isActive===true?"Approved":"Profile inactive"):"Awaiting admin approval";
  availabilityBtn.disabled=!approved;
  availabilityBtn.textContent=profile.isAvailable===true?"I am AVAILABLE — tap to go offline":"I am unavailable — tap to go AVAILABLE";
  availabilityBtn.className=`btn availabilityButton ${profile.isAvailable===true?'available':'unavailable'}`;
  availabilityHelp.textContent=approved?"You can receive Biserry delivery requests while online.":"Biserry admin must approve your account before you can go live.";
  jobsCard.classList.toggle("hidden",!approved); earningsCard.classList.toggle("hidden",!approved);
}

function renderEarnings(list){
  const completed=list.filter(x=>x.status==="Delivered");
  const outstanding=completed.filter(x=>x.settlementStatus!=="Paid").reduce((s,x)=>s+Number(x.riderEarning||0),0);
  const settled=completed.filter(x=>x.settlementStatus==="Paid").reduce((s,x)=>s+Number(x.riderEarning||0),0);
  riderOutstanding.textContent=money(outstanding); riderSettled.textContent=money(settled); riderCompleted.textContent=String(completed.length);
}

async function loadAcceptedOrderDetails(list){
  const ids=list.filter(j=>j.status!=="Offered" && j.status!=="Declined" && j.status!=="Cancelled").map(j=>j.orderId).filter(Boolean);
  await Promise.all(ids.map(async id=>{
    if(orderCache.has(id)) return;
    try{const s=await getDoc(doc(db,"orders",id)); if(s.exists()) orderCache.set(id,s.data());}catch(e){console.warn("Order details unavailable",id,e.code||e.message)}
  }));
}

function deliveryDetails(j){
  if(j.status==="Offered") return `<p class="formNote">Delivery address and customer contact become available after you accept this job.</p>`;
  const o=orderCache.get(j.orderId)||{};
  const name=o.customerName||o.customer?.name||"Customer";
  const phone=o.customerPhone||o.customer?.phone||"";
  const address=o.deliveryAddress||o.customer?.address||o.address||"Address not supplied";
  return `<div class="deliveryDetailBox"><p><strong>Customer:</strong> ${esc(name)}</p><p><strong>Address:</strong> ${esc(address)}</p>${phone?`<p><strong>Phone:</strong> <a href="tel:${esc(phone)}">${esc(phone)}</a></p>`:""}</div>`;
}

function stageButtons(j,paid){
  if(j.status==="Offered") return `<button class="btn" onclick="acceptDispatchJob('${j.id}')">Accept Job</button><button class="btn outline" onclick="declineDispatchJob('${j.id}')">Decline</button>`;
  if(j.status==="Accepted") return `<button class="btn" onclick="updateDispatchJob('${j.id}','Picked Up')">Picked Up</button>`;
  if(j.status==="Picked Up") return `<button class="btn" onclick="updateDispatchJob('${j.id}','On the Way')">On the Way</button>`;
  if(j.status==="On the Way") return `<button class="btn" onclick="updateDispatchJob('${j.id}','Arrived')">Arrived</button>`;
  if(j.status==="Arrived") return `<button class="btn" ${paid?'':"disabled"} onclick="updateDispatchJob('${j.id}','Delivered')">${paid?'Delivered & Released to Customer':'Waiting for Payment Confirmation'}</button>`;
  return "";
}

async function renderJobs(list){
  renderEarnings(list);
  const active=list.filter(x=>activeStatuses.includes(x.status));
  await loadAcceptedOrderDetails(active);
  $("dispatcherJobCount").textContent=String(active.length);
  for(const j of active.filter(x=>x.status==="Offered")){
    if(!seenOffers.has(j.id)){
      if("Notification" in window && Notification.permission==="granted") new Notification("New Biserry delivery job",{body:`${j.zoneName||"Delivery"} • You earn ${money(j.riderEarning)}`,icon:"../assets/logo.png"});
      seenOffers.add(j.id);
    }
  }
  $("dispatcherJobs").innerHTML=active.length?active.map(j=>{
    const paid=j.paymentStatus==="Paid"&&j.deliveryReleaseStatus==="Authorized";
    return `<div class="jobCard">
      <strong>Delivery ${esc(friendlyOrder(j.orderId))}</strong>
      <p>${esc(j.zoneName||"Delivery zone")} • <strong>You earn ${money(j.riderEarning)}</strong></p>
      <span class="statusPill">${esc(j.status)}</span>
      ${deliveryDetails(j)}
      <div class="paymentLock ${paid?'ok':''}"><strong>${paid?'✓ PAYMENT CONFIRMED — RELEASE AUTHORIZED':'🔒 PAYMENT NOT CONFIRMED'}</strong><br>${paid?'You may release the groceries after handover.':'Do not release the order until Biserry confirms payment.'}</div>
      <div class="jobActions">${stageButtons(j,paid)}</div>
    </div>`;
  }).join(""):'<p class="formNote">No active delivery request.</p>';
}

function watchJobs(){
  unsubscribeJobs?.(); if(!profile?.id)return;
  const q=query(collection(db,"dispatchRequests"),where("dispatcherId","==",profile.id));
  unsubscribeJobs=onSnapshot(q,s=>renderJobs(s.docs.map(d=>({id:d.id,...d.data()}))),e=>{console.warn("Dispatch request listener:",e); $("dispatcherJobs").innerHTML='<p class="formNote">Could not load jobs. Please refresh.</p>';});
}

async function syncTrackingAndOrder(j,status){
  const orderStatus=status==="Accepted"?"Dispatcher Assigned":status;
  // The dispatch request is the rider's authoritative write. These two mirrors are best-effort.
  try{
    await updateDoc(doc(db,"orderTracking",j.orderId),{orderStatus,dispatchStatus:status,dispatcherName:profile.name||"Dispatcher",updatedAt:serverTimestamp()});
  }catch(e){console.warn("Tracking sync warning:",e.code||e.message)}
  try{
    const fields={orderStatus,dispatchStatus:status,updatedAt:serverTimestamp()};
    if(status==="Accepted"){fields.assignedDispatcherId=profile.id;fields.assignedDispatcherName=profile.name||"Dispatcher";}
    await updateDoc(doc(db,"orders",j.orderId),fields);
  }catch(e){console.warn("Order sync warning:",e.code||e.message)}
}

window.acceptDispatchJob=async id=>{
  try{
    const ref=doc(db,"dispatchRequests",id),snap=await getDoc(ref); if(!snap.exists()) return alert("This delivery request no longer exists.");
    const j=snap.data();
    if(j.status!=="Offered") return alert("This job has already changed status. Refresh the app.");
    await updateDoc(ref,{status:"Accepted",acceptedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    orderCache.delete(j.orderId); await syncTrackingAndOrder(j,"Accepted");
  }catch(e){console.error(e);alert(`Could not accept this job (${e.code||"error"}). Please refresh and try again.`)}
};

window.declineDispatchJob=async id=>{
  try{await updateDoc(doc(db,"dispatchRequests",id),{status:"Declined",updatedAt:serverTimestamp()});}
  catch(e){console.error(e);alert(`Could not decline this job (${e.code||"error"}).`)}
};

window.updateDispatchJob=async(id,status)=>{
  try{
    const ref=doc(db,"dispatchRequests",id),snap=await getDoc(ref); if(!snap.exists()) return alert("This delivery request no longer exists.");
    const j=snap.data();
    const transitions={"Accepted":"Picked Up","Picked Up":"On the Way","On the Way":"Arrived","Arrived":"Delivered"};
    if(transitions[j.status]!==status) return alert(`This job is currently ${j.status}. Refresh before continuing.`);
    if(status==="Delivered"&&(j.paymentStatus!=="Paid"||j.deliveryReleaseStatus!=="Authorized")) return alert("Payment has not been confirmed by Biserry. Do not release this order.");
    const fields={status,updatedAt:serverTimestamp()};
    if(status==="Picked Up") fields.pickedUpAt=serverTimestamp();
    if(status==="On the Way") fields.onTheWayAt=serverTimestamp();
    if(status==="Arrived") fields.arrivedAt=serverTimestamp();
    if(status==="Delivered"){fields.deliveredAt=serverTimestamp();fields.earningStatus="Earned";}
    await updateDoc(ref,fields);
    await syncTrackingAndOrder(j,status);
  }catch(e){console.error(e);alert(`Could not update delivery (${e.code||"error"}). Please refresh and try again.`)}
};

loginForm.addEventListener("submit",async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,loginEmail.value.trim(),loginPassword.value)}catch(err){alert("Login failed: "+err.message)}});
registerForm.addEventListener("submit",async e=>{e.preventDefault();try{const cred=await createUserWithEmailAndPassword(auth,registerEmail.value.trim().toLowerCase(),registerPassword.value);const data={authUid:cred.user.uid,name:registerName.value.trim(),phone:registerPhone.value.trim(),email:cred.user.email,serviceArea:registerArea.value.trim(),vehicleType:registerVehicle.value.trim(),isApproved:false,isActive:true,isAvailable:false,isPublic:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};const ref=await addDoc(collection(db,"dispatchers"),data);profile={id:ref.id,...data};authCard.classList.add("hidden");profileCard.classList.remove("hidden");renderProfile();alert("Registration submitted. Biserry admin must approve your dispatcher profile before you can go live.")}catch(err){alert("Registration failed: "+err.message)}});
availabilityBtn.addEventListener("click",async()=>{if(!profile||profile.isApproved!==true||profile.isActive!==true)return;try{const next=profile.isAvailable!==true;await updateDoc(doc(db,"dispatchers",profile.id),{isAvailable:next,isPublic:next,lastAvailabilityAt:serverTimestamp(),updatedAt:serverTimestamp()});profile.isAvailable=next;profile.isPublic=next;renderProfile()}catch(e){alert(`Could not change availability (${e.code||"error"}).`)}});
logoutDispatcherBtn.addEventListener("click",()=>signOut(auth)); showLoginBtn.addEventListener("click",()=>toggleForms(false)); showRegisterBtn.addEventListener("click",()=>toggleForms(true));
enableJobNotifications.addEventListener("click",async()=>{if(!("Notification" in window))return alert("Notifications are not supported on this device.");const p=await Notification.requestPermission();enableJobNotifications.textContent=p==="granted"?"Job Alerts Enabled":"Enable Job Alerts"});

onAuthStateChanged(auth,async user=>{
  if(!user){unsubscribeJobs?.();profile=null;authCard.classList.remove("hidden");profileCard.classList.add("hidden");jobsCard.classList.add("hidden");earningsCard.classList.add("hidden");return;}
  try{
    profile=await findProfile(user.uid);
    if(!profile){await signOut(auth);return alert("No dispatcher profile is linked to this login. Register as a dispatcher or ask Biserry admin to link your account.");}
    authCard.classList.add("hidden");profileCard.classList.remove("hidden");renderProfile();watchJobs();
  }catch(e){console.error(e);alert("Could not load dispatcher profile: "+e.message)}
});
