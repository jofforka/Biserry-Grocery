import { protectAdminPage } from "./admin-auth.js";
import {
  auth, db, collection, getDocs, getDoc, doc, getCountFromServer,
  query, where, orderBy, limit, sendEmailVerification
} from "./firebase-service.js";

const money = v => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0
}).format(Number(v || 0));
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
}[c]));
async function count(q) {
  try { return (await getCountFromServer(q)).data().count; }
  catch { return "—"; }
}
function ageText(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return "No successful run recorded yet";
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 2) return "less than 2 minutes ago";
  if (mins < 60) return `${mins} minutes ago`;
  return `${Math.round(mins / 60)} hours ago`;
}
function loadAdminSecurity() {
  const el=document.getElementById("adminSecurityStatus"),actions=document.getElementById("adminSecurityActions");
  if(!el)return;
  const user=auth.currentUser;
  if(!user){
    el.innerHTML="<strong>Admin identity unavailable.</strong><br>Sign out and sign back in to refresh Firebase Authentication.";
    if(actions)actions.innerHTML="";
    return;
  }
  const verified=user.emailVerified===true;
  el.innerHTML=`<strong>${verified?"✓ Verified":"⚠ Email not verified"}</strong><br>
    Account: ${esc(user.email||"Unknown")}
    <br><small>${verified?"Firebase confirms this admin email is verified. Verified-email enforcement can now be enabled safely.":"Verify this exact Biserry admin account before enabling email_verified enforcement."}</small>`;
  if(actions){
    actions.innerHTML=verified
      ? '<button class="btn outline" id="refreshAdminVerificationBtn" type="button">Refresh Verification Status</button>'
      : '<button class="btn" id="sendAdminVerificationBtn" type="button">Send Verification Email</button><button class="btn outline" id="refreshAdminVerificationBtn" type="button">Refresh Verification Status</button>';
    document.getElementById("sendAdminVerificationBtn")?.addEventListener("click",sendAdminVerificationEmail);
    document.getElementById("refreshAdminVerificationBtn")?.addEventListener("click",refreshAdminVerification);
  }
}

async function sendAdminVerificationEmail(){
  const user=auth.currentUser,btn=document.getElementById("sendAdminVerificationBtn");
  if(!user)return alert("Admin account is not signed in.");
  if(user.emailVerified){loadAdminSecurity();return alert("This admin email is already verified.");}
  try{
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    await sendEmailVerification(user);
    alert(`Verification email sent to ${user.email}. Open that email, click the Firebase verification link, then return here and click “Refresh Verification Status”.`);
  }catch(e){
    const msg=e?.code==="auth/too-many-requests"
      ?"Firebase has temporarily limited verification emails. Wait a little, then try again."
      :(e?.message||"Could not send verification email.");
    alert(msg);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Send Verification Email";}
  }
}

async function refreshAdminVerification(){
  const user=auth.currentUser,btn=document.getElementById("refreshAdminVerificationBtn");
  if(!user)return alert("Admin account is not signed in.");
  try{
    if(btn){btn.disabled=true;btn.textContent="Refreshing…";}
    await user.reload();
    await auth.currentUser?.getIdToken?.(true);
    loadAdminSecurity();
    alert(auth.currentUser?.emailVerified?"Email verification confirmed ✓":"Firebase still shows this email as not verified. Click the verification link in the email first.");
  }catch(e){
    alert("Could not refresh verification status: "+(e?.message||"Please try again."));
  }finally{
    const current=document.getElementById("refreshAdminVerificationBtn");
    if(current){current.disabled=false;current.textContent="Refresh Verification Status";}
  }
}

async function loadAutopilot() {
  const el = document.getElementById("autopilotHealth");
  try {
    const snap = await getDoc(doc(db, "app_config", "autopilotStatus"));
    if (!snap.exists()) {
      el.innerHTML = "<strong>Not connected yet.</strong><br>Deploy the v11 GitHub Actions files and add the Firebase service-account secret.";
      return;
    }
    const a = snap.data();
    const stale = a.lastRunAt?.toMillis?.() && (Date.now() - a.lastRunAt.toMillis()) > 20 * 60_000;
    el.innerHTML = `<strong>${stale ? "⚠ Autopilot delayed" : "✓ " + esc(a.state || "Healthy")}</strong><br>
      Last run: ${esc(ageText(a.lastRunAt))} • Available riders: ${Number(a.availableRiders || 0)} • Processed: ${Number(a.processedBookings || 0)}
      ${a.lastError ? `<br><small>${esc(a.lastError)}</small>` : ""}`;
  } catch (e) {
    el.innerHTML = `<strong>Autopilot status unavailable.</strong><br><small>${esc(e.message)}</small>`;
  }
}
async function loadDashboard() {
  const btn = document.getElementById("refreshDashboardBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Refreshing…"; }
  try {
    const productsQ = collection(db,"products");
    const dispatchQ = query(collection(db,"dispatchers"),where("isPublic","==",true));
    const paymentsQ = query(collection(db,"paymentProofs"),where("status","==","Awaiting Verification"));
    const bookingsQ = collection(db,"dispatchBookings");
    const dispatchPaymentsQ = query(collection(db,"dispatchPaymentProofs"),where("status","==","Awaiting Verification"));

    const [products,orderSnap,dispatchers,payments,bookingTotal,dispatchPayments] = await Promise.all([
      count(productsQ),getDocs(collection(db,"orders")),count(dispatchQ),
      count(paymentsQ),count(bookingsQ),count(dispatchPaymentsQ)
    ]);
    const orderRows=orderSnap.docs.map(d=>({id:d.id,...d.data()}));
    const activeOrders=orderRows.filter(o=>o.orderStatus!=="Cancelled");
    const paidRows=activeOrders.filter(o=>o.paymentStatus==="Paid");
    const unpaidRows=activeOrders.filter(o=>o.paymentStatus!=="Paid");
    const cancelledRows=orderRows.filter(o=>o.orderStatus==="Cancelled");
    const paidRevenue=paidRows.reduce((sum,o)=>sum+Number(o.total||0),0);

    document.getElementById("productCount").textContent = products;
    document.getElementById("orderCount").textContent = activeOrders.length;
    document.getElementById("paidRevenue").textContent = money(paidRevenue);
    document.getElementById("pendingCount").textContent = unpaidRows.length;
    document.getElementById("cancelledCount").textContent = cancelledRows.length;
    document.getElementById("dispatchCount").textContent = dispatchers;
    document.getElementById("paymentPendingCount").textContent = Number(payments || 0) + Number(dispatchPayments || 0);
    document.getElementById("dispatchBookingCount").textContent = bookingTotal;

    const recentSnap = await getDocs(query(collection(db,"orders"),orderBy("createdAt","desc"),limit(20)));
    const recent = recentSnap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById("recentOrders").innerHTML = recent.length
      ? recent.map(o=>`<div class="opsAlert"><strong>${esc(o.customerName||"Customer")}</strong> • ${money(o.total)} • ${esc(o.orderStatus||"Pending")}<br><small>Order ${esc(o.id)}</small></div>`).join("")
      : '<div class="emptyState">No orders yet.</div>';

    const alerts=[];
    if (Number(payments)>0) alerts.push(`${payments} grocery payment proof${Number(payments)===1?"":"s"} awaiting verification.`);
    if (Number(dispatchPayments)>0) alerts.push(`${dispatchPayments} dispatch payment proof${Number(dispatchPayments)===1?"":"s"} awaiting verification.`);
    if (Number(dispatchers)===0) alerts.push("No dispatcher is currently online.");
    document.getElementById("operationsAlerts").innerHTML = alerts.length
      ? alerts.map(x=>`<div class="opsAlert">${esc(x)}</div>`).join("")
      : '<div class="emptyState">No immediate human action required.</div>';

    try {
      const s=await getDocs(query(collection(db,"products"),orderBy("stock","asc"),limit(20)));
      const low=s.docs.map(d=>({id:d.id,...d.data()})).filter(p=>Number(p.stock||0)<=Number(p.lowStockThreshold||5));
      document.getElementById("lowStockList").innerHTML=low.length
        ? low.map(p=>`<p><strong>${esc(p.name||"Product")}</strong> — ${Number(p.stock||0)} left</p>`).join("")
        : "<p>No low-stock item in the snapshot.</p>";
    } catch {
      document.getElementById("lowStockList").innerHTML="<p>Low-stock snapshot unavailable.</p>";
    }
    loadAdminSecurity();
    await loadAutopilot();
  } catch(e) {
    alert("Dashboard load failed: "+e.message);
  } finally {
    if(btn){btn.disabled=false;btn.textContent="Refresh";}
  }
}
document.getElementById("refreshDashboardBtn")?.addEventListener("click",loadDashboard);

if (await protectAdminPage()) {
  loadDashboard();
}
