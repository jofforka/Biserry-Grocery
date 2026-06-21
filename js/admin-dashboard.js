import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  getDocs
} from "./firebase-service.js";

protectAdminPage();

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function loadDashboard() {
  const productsSnap = await getDocs(collection(db, "products"));
  const ordersSnap = await getDocs(collection(db, "orders"));

  let revenue = 0;
  let pending = 0;

  ordersSnap.forEach(docSnap => {
    const order = docSnap.data();
    revenue += Number(order.total || 0);
    if (order.orderStatus !== "Completed") pending++;
  });

  document.getElementById("productCount").textContent = productsSnap.size;
  document.getElementById("orderCount").textContent = ordersSnap.size;
  document.getElementById("pendingCount").textContent = pending;
  document.getElementById("revenue").textContent = formatNaira(revenue);

  const lowStock = [];
  productsSnap.forEach(docSnap => {
    const p = docSnap.data();
    if (Number(p.stock || 0) <= Number(p.lowStockThreshold || 5)) {
      lowStock.push(p);
    }
  });

  document.getElementById("lowStockList").innerHTML = lowStock.length
    ? lowStock.map(p => `<p><strong>${p.name}</strong> — ${p.stock} left</p>`).join("")
    : "<p>No low-stock product at the moment.</p>";
}

loadDashboard().catch(error => alert(error.message));
