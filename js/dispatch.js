import { auth, db, onAuthStateChanged, collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "./firebase-service.js";

const grid = document.getElementById("dispatchGrid");
const status = document.getElementById("dispatchStatus");
const orderPanel = document.getElementById("dispatchOrderPanel");
const orderInput = document.getElementById("dispatchOrderId");
const orderState = document.getElementById("dispatchOrderState");
let currentUser = null;
let selectedOrder = null;

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
    orderState.innerHTML = `<strong>No order selected.</strong><br>Place a Biserry order first, or enter the order ID from your confirmation page below.`;
    return;
  }
  orderState.innerHTML = `<strong>Delivery for order ${escapeHtml(order.orderId)}</strong><br>${currentUser && !currentUser.isAnonymous ? "Signed-in order request" : "Guest order requests are supported"}.`;
  if (orderInput) orderInput.value = order.orderId;
}

function escapeHtml(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

async function useOrderId() {
  const id = String(orderInput?.value || "").trim();
  if (!id) return;
  if (orderState) orderState.textContent = "Checking order…";
  try {
    // Public tracking permits exact-document reads, not collection listing.
    const tracking = await getDoc(doc(db, "orderTracking", id));
    if (!tracking.exists()) {
      if (orderState) orderState.textContent = "That Biserry order ID was not found. Check the ID and try again.";
      return;
    }
    const td = tracking.data();
    saveSelectedOrder({ orderId: id, total: td.total || 0, deliveryZoneId: td.deliveryZoneId || null, deliveryZone: td.deliveryZone || "", deliveryFee: Number(td.deliveryFee || 0), biserryCommission: Number(td.biserryCommission || 0), riderEarning: Number(td.riderEarning || 0), commissionPercent: Number(td.commissionPercent || 0), paymentStatus: td.paymentStatus || "Unpaid", deliveryReleaseStatus: td.deliveryReleaseStatus || "Locked" });
  } catch (e) {
    console.warn(e);
    if (orderState) orderState.textContent = "We could not verify that order right now. Please try again.";
  }
}
window.useDispatchOrderId = useOrderId;

function requestMessage(d) {
  const o = selectedOrder || getLastOrder();
  return encodeURIComponent(
    `Hello ${d.name || ""}, I would like to request dispatch service for a Biserry Grocery order.` +
    `${o?.orderId ? `\nOrder: ${o.orderId}` : ""}` +
    `${o?.customerName ? `\nCustomer: ${o.customerName}` : ""}` +
    `${o?.deliveryAddress ? `\nDelivery address: ${o.deliveryAddress}` : ""}` +
    `\nPlease confirm your availability and delivery fee.`
  );
}

window.requestBiserryDispatcher = async dispatcherId => {
  const dispatcher = window.__dispatchers?.find(x => x.id === dispatcherId);
  const order = selectedOrder || getLastOrder();

  if (!dispatcher) {
    alert("That dispatcher is no longer available. Please choose another dispatcher.");
    return;
  }
  if (!order?.orderId) {
    alert("Please select a Biserry order first. Use the order ID from your confirmation page.");
    orderPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (order.customerUid && currentUser?.uid && order.customerUid !== currentUser.uid) {
    alert("This order belongs to a different signed-in account.");
    return;
  }

  const requestRef = doc(db, "dispatchRequests", order.orderId);
  try {
    const existing = await getDoc(requestRef);
    if (existing.exists()) {
      const current = existing.data();
      if (!["Declined", "Cancelled"].includes(current.status)) {
        const name = current.dispatcherName || "your selected dispatcher";
        alert(`A dispatch request for this order is already ${String(current.status || "active").toLowerCase()} with ${name}.`);
        return;
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

    // Only sanitized dispatch state is exposed in public tracking.
    await setDoc(doc(db, "orderTracking", order.orderId), {
      dispatchRequestId: order.orderId,
      dispatchStatus: "Requested",
      updatedAt: serverTimestamp()
    }, { merge: true });

    alert(`${dispatcher.name || "Dispatcher"} has received your Biserry delivery request. You can follow progress from Track Order.`);
    location.href = `track-order.html?order=${encodeURIComponent(order.orderId)}`;
  } catch (e) {
    console.warn("Dispatch request failed:", e);
    const msg = String(e?.code || e?.message || "");
    if (msg.includes("permission-denied") || msg.includes("insufficient permissions")) {
      alert("We could not connect this dispatcher to the order. Please confirm the order ID is correct and that the updated Biserry Firestore rules have been published.");
    } else {
      alert("We could not send the dispatch request right now. Please try again.");
    }
  }
};

function render(items) {
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
        ${selectedOrder?.deliveryZone ? `<div><strong>Your zone:</strong> ${escapeHtml(selectedOrder.deliveryZone)} • ${new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(selectedOrder.deliveryFee||0))}</div>` : ""}
      </div>
      <div class="dispatchActions">
        <button class="btn" type="button" onclick="requestBiserryDispatcher('${d.id}')">Request Dispatcher</button>
        <a class="btn outline" href="https://wa.me/${phoneDigits(d.phone)}?text=${requestMessage(d)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn outline" href="tel:${escapeHtml(d.phone || "")}">Call</a>
      </div>
    </article>`).join("");
}

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
    snap => render(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
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
