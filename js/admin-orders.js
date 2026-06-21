import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy
} from "./firebase-service.js";

protectAdminPage();

const ordersTable = document.getElementById("ordersTable");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function loadOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  ordersTable.innerHTML = "";

  snap.forEach(docSnap => {
    const order = docSnap.data();
    const items = (order.items || []).map(item => `${item.name} x ${item.quantity}`).join("<br>");

    ordersTable.innerHTML += `
      <tr>
        <td>${docSnap.id}</td>
        <td>${order.customer?.name || ""}<br>${order.customer?.phone || ""}</td>
        <td>${formatNaira(order.total)}</td>
        <td>
          <select onchange="updatePayment('${docSnap.id}', this.value)">
            <option ${order.paymentStatus === "Awaiting Confirmation" ? "selected" : ""}>Awaiting Confirmation</option>
            <option ${order.paymentStatus === "Paid" ? "selected" : ""}>Paid</option>
            <option ${order.paymentStatus === "Pending" ? "selected" : ""}>Pending</option>
            <option ${order.paymentStatus === "Failed" ? "selected" : ""}>Failed</option>
          </select>
        </td>
        <td>
          <select onchange="updateOrderStatus('${docSnap.id}', this.value)">
            <option ${order.orderStatus === "New" ? "selected" : ""}>New</option>
            <option ${order.orderStatus === "Processing" ? "selected" : ""}>Processing</option>
            <option ${order.orderStatus === "Completed" ? "selected" : ""}>Completed</option>
            <option ${order.orderStatus === "Cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </td>
        <td>
          <select onchange="updateDelivery('${docSnap.id}', this.value)">
            <option ${order.deliveryStatus === "Awaiting Dispatch" ? "selected" : ""}>Awaiting Dispatch</option>
            <option ${order.deliveryStatus === "Dispatched" ? "selected" : ""}>Dispatched</option>
            <option ${order.deliveryStatus === "Delivered" ? "selected" : ""}>Delivered</option>
            <option ${order.deliveryStatus === "Pickup Requested" ? "selected" : ""}>Pickup Requested</option>
            <option ${order.deliveryStatus === "Picked Up" ? "selected" : ""}>Picked Up</option>
          </select>
        </td>
        <td>${items}</td>
      </tr>
    `;
  });
}

window.updateOrderStatus = async function(id, value) {
  await updateDoc(doc(db, "orders", id), { orderStatus: value });
};

window.updateDelivery = async function(id, value) {
  await updateDoc(doc(db, "orders", id), { deliveryStatus: value });
};

window.updatePayment = async function(id, value) {
  await updateDoc(doc(db, "orders", id), { paymentStatus: value });
};

loadOrders().catch(error => alert(error.message));
