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

async function loadReports() {
  const snap = await getDocs(collection(db, "orders"));

  let totalRevenue = 0;
  let totalOrders = 0;
  let paidOrders = 0;
  let pendingOrders = 0;
  const productSales = {};

  snap.forEach(docSnap => {
    const order = docSnap.data();
    totalOrders++;
    totalRevenue += Number(order.total || 0);

    if (order.paymentStatus === "Paid") paidOrders++;
    else pendingOrders++;

    (order.items || []).forEach(item => {
      if (!productSales[item.name]) {
        productSales[item.name] = 0;
      }
      productSales[item.name] += Number(item.quantity || 1);
    });
  });

  document.getElementById("totalRevenue").textContent = formatNaira(totalRevenue);
  document.getElementById("totalOrders").textContent = totalOrders;
  document.getElementById("paidOrders").textContent = paidOrders;
  document.getElementById("pendingOrders").textContent = pendingOrders;

  const bestSellers = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .map(([name, qty]) => `<p><strong>${name}</strong> — ${qty} sold</p>`)
    .join("");

  document.getElementById("bestSellers").innerHTML = bestSellers || "<p>No sales data yet.</p>";
}

loadReports().catch(error => alert(error.message));
