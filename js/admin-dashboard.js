import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "./firebase-service.js";

protectAdminPage();

const importDemoProductsBtn = document.getElementById("importDemoProductsBtn");

const demoProducts = [
  { name: "Premium Rice", category: "grains", price: 75000, stock: 20, lowStockThreshold: 5, imageUrl: "assets/rice.jpg" },
  { name: "Brown Beans", category: "grains", price: 68000, stock: 15, lowStockThreshold: 5, imageUrl: "assets/beans.jpg" },
  { name: "Vegetable Oil", category: "oil", price: 48000, stock: 10, lowStockThreshold: 5, imageUrl: "assets/vegetable-oil.jpg" },
  { name: "Spaghetti Pack", category: "grains", price: 12000, stock: 30, lowStockThreshold: 5, imageUrl: "assets/spaghetti.jpg" },
  { name: "Tomato Paste", category: "spices", price: 15000, stock: 25, lowStockThreshold: 5, imageUrl: "assets/tomato-paste.jpg" },
  { name: "Fresh Eggs", category: "fresh", price: 6500, stock: 18, lowStockThreshold: 5, imageUrl: "assets/eggs.jpg" },
  { name: "Fresh Vegetables", category: "fresh", price: 5000, stock: 14, lowStockThreshold: 5, imageUrl: "assets/fresh-vegetables.jpg" },
  { name: "Beverages", category: "drinks", price: 8500, stock: 22, lowStockThreshold: 5, imageUrl: "assets/beverages.jpg" },
  { name: "Household Items", category: "household", price: 9500, stock: 12, lowStockThreshold: 5, imageUrl: "assets/household.jpg" }
];

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

async function importDemoProducts() {
  try {
    const productsSnap = await getDocs(collection(db, "products"));

    if (productsSnap.size > 0) {
      const confirmImport = confirm("Products already exist in Firebase. Importing demo products again may create duplicates. Continue?");
      if (!confirmImport) return;
    }

    importDemoProductsBtn.disabled = true;
    importDemoProductsBtn.textContent = "Importing...";

    for (const product of demoProducts) {
      await addDoc(collection(db, "products"), {
        ...product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    alert("Demo products imported successfully. You can now edit/delete them from Admin > Products.");
    await loadDashboard();
  } catch (error) {
    alert("Import failed: " + error.message);
  } finally {
    importDemoProductsBtn.disabled = false;
    importDemoProductsBtn.textContent = "Import Demo Products to Firebase";
  }
}

if (importDemoProductsBtn) {
  importDemoProductsBtn.addEventListener("click", importDemoProducts);
}

loadDashboard().catch(error => alert(error.message));

