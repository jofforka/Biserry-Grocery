import { protectAdminPage } from "./admin-auth.js";
import {
  db, collection, getDocs, getDoc, doc, getCountFromServer,
  query, where, orderBy, limit
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
    const ordersQ = collection(db,"orders");
    const pendingQ = query(collection(db,"orders"),where("orderStatus","==","Pending"));
    const dispatchQ = query(collection(db,"dispatchers"),where("isPublic","==",true));
    const paymentsQ = query(collection(db,"paymentProofs"),where("status","==","Awaiting Verification"));
    const bookingsQ = collection(db,"dispatchBookings");
    const dispatchPaymentsQ = query(collection(db,"dispatchPaymentProofs"),where("status","==","Awaiting Verification"));

    const [products,orders,pending,dispatchers,payments,bookingTotal,dispatchPayments] = await Promise.all([
      count(productsQ),count(ordersQ),count(pendingQ),count(dispatchQ),
      count(paymentsQ),count(bookingsQ),count(dispatchPaymentsQ)
    ]);

    document.getElementById("productCount").textContent = products;
    document.getElementById("orderCount").textContent = orders;
    document.getElementById("pendingCount").textContent = pending;
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
