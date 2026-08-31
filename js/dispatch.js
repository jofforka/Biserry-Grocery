import {
  auth, db, onAuthStateChanged, collection, query, where, onSnapshot,
  doc, getDoc, setDoc, addDoc, getDocs, serverTimestamp
} from "./firebase-service.js";

const BUSINESS_WHATSAPP = "2348100584211";
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

const grid = document.getElementById("dispatchGrid");
const status = document.getElementById("dispatchStatus");
const orderPanel = document.getElementById("dispatchOrderPanel");
const orderInput = document.getElementById("dispatchOrderId");
const orderState = document.getElementById("dispatchOrderState");
const packageForm = document.getElementById("packageBookingForm");
const zoneSelect = document.getElementById("deliveryZone");
const fareAmount = document.getElementById("fareAmount");
const fareNote = document.getElementById("fareNote");
const successModal = document.getElementById("bookingSuccess");

let currentUser = null;
let selectedOrder = null;
let deliveryZones = [];

function escapeHtml(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function phoneDigits(v = "") {
  return String(v).replace(/[^0-9]/g, "").replace(/^0/, "234");
}
function getLastOrder() {
  try { return JSON.parse(localStorage.getItem("biserryLastOrder") || "null"); }
  catch { return null; }
}
function saveSelectedOrder(order) {
  selectedOrder = order;
  if (order?.orderId) {
    try {
      const existing = getLastOrder() || {};
      localStorage.setItem("biserryLastOrder", JSON.stringify({ ...existing, ...order }));
    } catch {}
  }
  renderOrderState();
}
function renderOrderState() {
  const order = selectedOrder || getLastOrder();
  if (!orderState) return;
  if (!order?.orderId) {
    orderState.innerHTML = `<strong>No order selected.</strong><br>Place a Biserry order first, or enter the order ID from your confirmation page.`;
    return;
  }
  orderState.innerHTML = `<strong>Delivery for order ${escapeHtml(order.orderId)}</strong><br>${currentUser && !currentUser.isAnonymous ? "Signed-in order request" : "Guest order requests are supported"}.`;
  if (orderInput) orderInput.value = order.orderId;
}
async function useOrderId() {
  const id = String(orderInput?.value || "").trim();
  if (!id) return;
  orderState.textContent = "Checking order…";
  try {
    const tracking = await getDoc(doc(db, "orderTracking", id));
    if (!tracking.exists()) {
      orderState.textContent = "That Biserry order ID was not found. Check the ID and try again.";
      return;
    }
    const td = tracking.data();
    saveSelectedOrder({
      orderId: id, total: td.total || 0, deliveryZoneId: td.deliveryZoneId || null,
      deliveryZone: td.deliveryZone || "", deliveryFee: Number(td.deliveryFee || 0),
      biserryCommission: Number(td.biserryCommission || 0), riderEarning: Number(td.riderEarning || 0),
      commissionPercent: Number(td.commissionPercent || 0), paymentStatus: td.paymentStatus || "Unpaid",
      deliveryReleaseStatus: td.deliveryReleaseStatus || "Locked"
    });
    document.getElementById("availableDispatchers")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.warn(e);
    orderState.textContent = "We could not verify that order right now. Please try again.";
  }
}
document.getElementById("useOrderBtn")?.addEventListener("click", useOrderId);

function requestMessage(d) {
  const o = selectedOrder || getLastOrder();
  return encodeURIComponent(
    `Hello ${d.name || ""}, I would like to request dispatch service for a Biserry Grocery order.` +
    `${o?.orderId ? `\nOrder: ${o.orderId}` : ""}` +
    `${o?.deliveryAddress ? `\nDelivery address: ${o.deliveryAddress}` : ""}` +
    `\nPlease confirm your availability.`
  );
}

window.requestBiserryDispatcher = async dispatcherId => {
  const dispatcher = window.__dispatchers?.find(x => x.id === dispatcherId);
  const order = selectedOrder || getLastOrder();
  if (!dispatcher) return alert("That dispatcher is no longer available.");
  if (!order?.orderId) {
    alert("Please select a Biserry order first.");
    orderPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (order.customerUid && currentUser?.uid && order.customerUid !== currentUser.uid) {
    return alert("This order belongs to a different signed-in account.");
  }
  const requestRef = doc(db, "dispatchRequests", order.orderId);
  try {
    const existing = await getDoc(requestRef);
    if (existing.exists()) {
      const current = existing.data();
      if (!["Declined", "Cancelled"].includes(current.status)) {
        return alert(`A dispatch request for this order is already ${String(current.status || "active").toLowerCase()}.`);
      }
    }
    const payload = {
      orderId: order.orderId,
      customerUid: currentUser && !currentUser.isAnonymous ? currentUser.uid : (order.customerUid || null),
      dispatcherId: dispatcher.id,
      dispatcherName: dispatcher.name || "Dispatcher",
      status: "Offered",
      zoneId: order.deliveryZoneId || null,
      zoneName: order.deliveryZone || "",
      deliveryFee: Number(order.deliveryFee || 0),
      commissionPercent: Number(order.commissionPercent || 0),
      biserryCommission: Number(order.biserryCommission || 0),
      riderEarning: Number(order.riderEarning || 0),
      paymentStatus: order.paymentStatus || "Unpaid",
      deliveryReleaseStatus: order.deliveryReleaseStatus || "Locked",
      earningStatus: "Pending",
      settlementStatus: "Pending",
      createdAt: existing.exists() ? (existing.data().createdAt || serverTimestamp()) : serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(requestRef, payload);
    await setDoc(doc(db, "orderTracking", order.orderId), {
      dispatchRequestId: order.orderId, dispatchStatus: "Requested", updatedAt: serverTimestamp()
    }, { merge: true });
    location.href = `track-order.html?order=${encodeURIComponent(order.orderId)}`;
  } catch (e) {
    console.warn("Dispatch request failed:", e);
    alert("We could not send the dispatch request right now. Please try again.");
  }
};

function renderDispatchers(items) {
  window.__dispatchers = items;
  status.style.display = items.length ? "none" : "block";
  status.textContent = items.length ? "" : "No dispatcher is currently available. This page updates automatically when a dispatcher comes online.";
  grid.innerHTML = items.map(d => `
    <article class="dispatchCard">
      <span class="dispatchLive">● Available now</span>
      <h3>${escapeHtml(d.name || "Dispatcher")}</h3>
      <div class="dispatchMeta">
        <div><strong>Area:</strong> ${escapeHtml(d.serviceArea || "Contact dispatcher")}</div>
        <div><strong>Vehicle:</strong> ${escapeHtml(d.vehicleType || "Not specified")}</div>
        ${selectedOrder?.deliveryZone ? `<div><strong>Your zone:</strong> ${escapeHtml(selectedOrder.deliveryZone)} • ${money.format(Number(selectedOrder.deliveryFee || 0))}</div>` : ""}
      </div>
      <div class="dispatchActions">
        <button class="btn" type="button" onclick="requestBiserryDispatcher('${d.id}')">Request Dispatcher</button>
        <a class="btn outline" href="https://wa.me/${phoneDigits(d.phone)}?text=${requestMessage(d)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn outline" href="tel:${escapeHtml(d.phone || "")}">Call</a>
      </div>
    </article>`).join("");
}

async function loadZones() {
  try {
    const snap = await getDocs(query(collection(db, "delivery_zones"), where("isActive", "==", true)));
    deliveryZones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    deliveryZones.sort((a,b) => String(a.name || a.zoneName || "").localeCompare(String(b.name || b.zoneName || "")));
    zoneSelect.innerHTML = `<option value="">Select area / zone</option>` + deliveryZones.map(z => {
      const name = z.name || z.zoneName || z.label || z.id;
      return `<option value="${escapeHtml(z.id)}">${escapeHtml(name)}${Number(z.fee || 0) ? ` — ${money.format(Number(z.fee))}` : ""}</option>`;
    }).join("");
  } catch (e) {
    console.warn("Delivery zones unavailable", e);
    zoneSelect.innerHTML = `<option value="">Area will be confirmed by Biserry</option>`;
  }
}

function selectedService() {
  return document.querySelector('input[name="serviceType"]:checked')?.value || "Standard";
}
function calculateEstimate() {
  const zone = deliveryZones.find(z => z.id === zoneSelect.value);
  if (!zone || !Number(zone.fee)) {
    fareAmount.textContent = "Fare confirmed after request";
    fareNote.textContent = "Select a configured delivery zone for an estimate. Final fare is confirmed before dispatch.";
    return null;
  }
  const base = Number(zone.fee);
  const service = selectedService();
  const multiplier = service === "Express" ? 1.30 : 1;
  const estimate = Math.round(base * multiplier);
  fareAmount.textContent = money.format(estimate);
  fareNote.textContent = service === "Express"
    ? "Express estimate includes a 30% priority allowance. Final fare is confirmed before dispatch."
    : "Estimate uses the active Biserry delivery-zone price. Final fare is confirmed before dispatch.";
  return estimate;
}

document.querySelectorAll(".bookingTab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".bookingTab").forEach(x => x.classList.toggle("active", x === btn));
  const mode = btn.dataset.mode;
  document.getElementById("orderMode").classList.toggle("active", mode === "order");
  document.getElementById("packageMode").classList.toggle("active", mode === "package");
}));

document.querySelectorAll(".serviceCard").forEach(card => card.addEventListener("click", () => {
  document.querySelectorAll(".serviceCard").forEach(x => x.classList.remove("active"));
  card.classList.add("active");
  card.querySelector("input").checked = true;
  calculateEstimate();
}));
document.querySelectorAll(".timeCard").forEach(card => card.addEventListener("click", () => {
  document.querySelectorAll(".timeCard").forEach(x => x.classList.remove("active"));
  card.classList.add("active");
  card.querySelector("input").checked = true;
  const scheduled = card.querySelector("input").value === "Scheduled";
  document.getElementById("scheduleFields").hidden = !scheduled;
  document.getElementById("pickupDate").required = scheduled;
  document.getElementById("pickupTime").required = scheduled;
}));
zoneSelect?.addEventListener("change", calculateEstimate);

packageForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const submit = document.getElementById("submitPackageBooking");
  const pickupWhen = document.querySelector('input[name="pickupWhen"]:checked')?.value || "ASAP";
  const zone = deliveryZones.find(z => z.id === zoneSelect.value) || null;
  const estimate = calculateEstimate();
  const payload = {
    type: "Standalone Package",
    serviceType: selectedService(),
    pickupAddress: document.getElementById("pickupAddress").value.trim(),
    dropoffAddress: document.getElementById("dropoffAddress").value.trim(),
    zoneId: zone?.id || null,
    zoneName: zone ? (zone.name || zone.zoneName || zone.label || zone.id) : "",
    packageSize: document.getElementById("packageSize").value,
    pickupWhen,
    pickupDate: pickupWhen === "Scheduled" ? document.getElementById("pickupDate").value : "",
    pickupTime: pickupWhen === "Scheduled" ? document.getElementById("pickupTime").value : "",
    customerName: document.getElementById("customerName").value.trim(),
    customerPhone: document.getElementById("customerPhone").value.trim(),
    customerUid: currentUser && !currentUser.isAnonymous ? currentUser.uid : null,
    note: document.getElementById("deliveryNote").value.trim(),
    estimatedFare: estimate,
    status: "New",
    paymentStatus: "Not Requested",
    assignedDispatcherId: null,
    assignedDispatcherName: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (!payload.pickupAddress || !payload.dropoffAddress || !payload.customerName || !payload.customerPhone) return;

  submit.disabled = true;
  submit.innerHTML = `Sending request… <span>→</span>`;
  try {
    const ref = await addDoc(collection(db, "dispatchBookings"), payload);
    try {
      localStorage.setItem("biserryLastDispatchBooking", JSON.stringify({
        id: ref.id, customerName: payload.customerName, serviceType: payload.serviceType,
        pickupAddress: payload.pickupAddress, dropoffAddress: payload.dropoffAddress
      }));
    } catch {}
    const msg = `Hello Biserry, I just submitted a dispatch request.\nBooking: ${ref.id}\nPickup: ${payload.pickupAddress}\nDrop-off: ${payload.dropoffAddress}`;
    document.getElementById("bookingRef").textContent = ref.id;
    document.getElementById("bookingSuccessText").textContent = `Thanks ${payload.customerName}. Biserry has received your ${payload.serviceType.toLowerCase()} delivery request.`;
    document.getElementById("bookingWhatsApp").href = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(msg)}`;
    successModal.hidden = false;
    packageForm.reset();
    document.querySelectorAll(".serviceCard").forEach((x,i) => x.classList.toggle("active", i === 0));
    document.querySelectorAll(".timeCard").forEach((x,i) => x.classList.toggle("active", i === 0));
    document.getElementById("scheduleFields").hidden = true;
    calculateEstimate();
  } catch (err) {
    console.warn("Standalone dispatch booking failed", err);
    const denied = String(err?.code || err?.message || "").includes("permission");
    alert(denied
      ? "The booking page is ready, but the new dispatchBookings Firestore rule has not been published yet."
      : "We could not create the request right now. Please try again.");
  } finally {
    submit.disabled = false;
    submit.innerHTML = `Request Dispatch <span>→</span>`;
  }
});

document.getElementById("closeBookingSuccess")?.addEventListener("click", () => successModal.hidden = true);
successModal?.addEventListener("click", e => { if (e.target === successModal) successModal.hidden = true; });

const orderFromUrl = new URLSearchParams(location.search).get("order");
selectedOrder = orderFromUrl ? { ...(getLastOrder() || {}), orderId: orderFromUrl } : getLastOrder();
if (selectedOrder?.orderId) saveSelectedOrder(selectedOrder); else renderOrderState();

onAuthStateChanged(auth, user => {
  currentUser = user || null;
  renderOrderState();
});

try {
  const q = query(collection(db, "dispatchers"), where("isPublic", "==", true));
  onSnapshot(q,
    snap => renderDispatchers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => {
      status.style.display = "block";
      status.textContent = "Could not load dispatchers right now. Please try again.";
      console.warn(err);
    }
  );
} catch (e) {
  status.style.display = "block";
  status.textContent = "Could not load dispatchers right now. Please try again.";
  console.warn(e);
}

loadZones();
