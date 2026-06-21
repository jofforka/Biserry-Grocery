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
  {
    name: "Premium Rice",
    category: "grains",
    hasVariants: false,
    price: 75000,
    stock: 20,
    lowStockThreshold: 5,
    imageUrl: "assets/rice.jpg",
    variants: []
  },
  {
    name: "Brown Beans",
    category: "grains",
    hasVariants: false,
    price: 68000,
    stock: 15,
    lowStockThreshold: 5,
    imageUrl: "assets/beans.jpg",
    variants: []
  },
  {
    name: "Vegetable Oil",
    category: "oil",
    hasVariants: false,
    price: 48000,
    stock: 10,
    lowStockThreshold: 5,
    imageUrl: "assets/vegetable-oil.jpg",
    variants: []
  },
  {
    name: "Spaghetti Pack",
    category: "grains",
    hasVariants: false,
    price: 12000,
    stock: 30,
    lowStockThreshold: 5,
    imageUrl: "assets/spaghetti.jpg",
    variants: []
  },
  {
    name: "Tomato Paste",
    category: "spices",
    hasVariants: false,
    price: 15000,
    stock: 25,
    lowStockThreshold: 5,
    imageUrl: "assets/tomato-paste.jpg",
    variants: []
  },
  {
    name: "Fresh Eggs",
    category: "fresh",
    hasVariants: false,
    price: 6500,
    stock: 18,
    lowStockThreshold: 5,
    imageUrl: "assets/eggs.jpg",
    variants: []
  },
  {
    name: "Fresh Vegetables",
    category: "fresh",
    hasVariants: false,
    price: 5000,
    stock: 14,
    lowStockThreshold: 5,
    imageUrl: "assets/fresh-vegetables.jpg",
    variants: []
  },
  {
    name: "Beverages",
    category: "drinks",
    hasVariants: false,
    price: 8500,
    stock: 22,
    lowStockThreshold: 5,
    imageUrl: "assets/beverages.jpg",
    variants: []
  },
  {
    name: "Household Items",
    category: "household",
    hasVariants: false,
    price: 9500,
    stock: 12,
    lowStockThreshold: 5,
    imageUrl: "assets/household.jpg",
    variants: []
  },
  {
    name: "Toothpaste",
    category: "household",
    hasVariants: true,
    price: 2500,
    stock: 45,
    lowStockThreshold: 5,
    imageUrl: "assets/household.jpg",
    variants: [
      {
        id: "v-colgate",
        name: "Colgate",
        price: 2500,
        stock: 20,
        imageUrl: "assets/household.jpg"
      },
      {
        id: "v-close-up",
        name: "Close-Up",
        price: 2300,
        stock: 15,
        imageUrl: "assets/household.jpg"
      },
      {
        id: "v-oral-b",
        name: "Oral-B",
        price: 2800,
        stock: 10,
        imageUrl: "assets/household.jpg"
      }
    ]
  }
];

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function calculateProductStock(product) {
  if (product.hasVariants && Array.isArray(product.variants)) {
    return product.variants.reduce((sum, variant) => {
      return sum + Number(variant.stock || 0);
    }, 0);
  }

  return Number(product.stock || 0);
}

async function loadDashboard() {
  const productsSnap = await getDocs(collection(db, "products"));
  const ordersSnap = await getDocs(collection(db, "orders"));

  let revenue = 0;
  let pending = 0;

  ordersSnap.forEach(docSnap => {
    const order = docSnap.data();
    revenue += Number(order.total || 0);

    if (order.orderStatus !== "Completed" && order.orderStatus !== "Delivered") {
      pending++;
    }
  });

  const productCountEl = document.getElementById("productCount");
  const orderCountEl = document.getElementById("orderCount");
  const pendingCountEl = document.getElementById("pendingCount");
  const revenueEl = document.getElementById("revenue");
  const lowStockListEl = document.getElementById("lowStockList");

  if (productCountEl) productCountEl.textContent = productsSnap.size;
  if (orderCountEl) orderCountEl.textContent = ordersSnap.size;
  if (pendingCountEl) pendingCountEl.textContent = pending;
  if (revenueEl) revenueEl.textContent = formatNaira(revenue);

  const lowStock = [];

  productsSnap.forEach(docSnap => {
    const product = docSnap.data();
    const stock = calculateProductStock(product);
    const threshold = Number(product.lowStockThreshold || 5);

    if (stock <= threshold) {
      lowStock.push({
        name: product.name,
        stock
      });
    }

    if (product.hasVariants && Array.isArray(product.variants)) {
      product.variants.forEach(variant => {
        if (Number(variant.stock || 0) <= threshold) {
          lowStock.push({
            name: `${product.name} - ${variant.name}`,
            stock: Number(variant.stock || 0)
          });
        }
      });
    }
  });

  if (lowStockListEl) {
    lowStockListEl.innerHTML = lowStock.length
      ? lowStock
          .map(item => `<p><strong>${item.name}</strong> — ${item.stock} left</p>`)
          .join("")
      : "<p>No low-stock product at the moment.</p>";
  }
}

async function importDemoProducts() {
  try {
    const productsSnap = await getDocs(collection(db, "products"));

    if (productsSnap.size > 0) {
      const confirmImport = confirm(
        "Products already exist in Firebase. Importing demo products again may create duplicates. Continue?"
      );

      if (!confirmImport) return;
    }

    if (importDemoProductsBtn) {
      importDemoProductsBtn.disabled = true;
      importDemoProductsBtn.textContent = "Importing...";
    }

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
    if (importDemoProductsBtn) {
      importDemoProductsBtn.disabled = false;
      importDemoProductsBtn.textContent = "Import Demo Products to Firebase";
    }
  }
}

if (importDemoProductsBtn) {
  importDemoProductsBtn.addEventListener("click", importDemoProducts);
}

loadDashboard().catch(error => alert(error.message));