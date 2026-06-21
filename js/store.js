import {
  db,
  collection,
  getDocs,
  query,
  orderBy
} from "./firebase-service.js";

const fallbackProducts = [
  { id: "demo-1", name: "Premium Rice", category: "grains", price: 75000, stock: 20, imageUrl: "assets/rice.jpg" },
  { id: "demo-2", name: "Brown Beans", category: "grains", price: 68000, stock: 15, imageUrl: "assets/beans.jpg" },
  { id: "demo-3", name: "Vegetable Oil", category: "oil", price: 48000, stock: 10, imageUrl: "assets/vegetable-oil.jpg" },
  { id: "demo-4", name: "Spaghetti Pack", category: "grains", price: 12000, stock: 30, imageUrl: "assets/spaghetti.jpg" },
  { id: "demo-5", name: "Tomato Paste", category: "spices", price: 15000, stock: 25, imageUrl: "assets/tomato-paste.jpg" },
  { id: "demo-6", name: "Fresh Eggs", category: "fresh", price: 6500, stock: 18, imageUrl: "assets/eggs.jpg" },
  { id: "demo-7", name: "Fresh Vegetables", category: "fresh", price: 5000, stock: 14, imageUrl: "assets/fresh-vegetables.jpg" },
  { id: "demo-8", name: "Beverages", category: "drinks", price: 8500, stock: 22, imageUrl: "assets/beverages.jpg" },
  { id: "demo-9", name: "Household Items", category: "household", price: 9500, stock: 12, imageUrl: "assets/household.jpg" }
];

let products = [];
let cart = [];
let selectedQuantities = {};
let currentCategory = "all";

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const checkoutPreview = document.getElementById("checkoutPreview");
const checkoutTotal = document.getElementById("checkoutTotal");
const clearCartBtn = document.getElementById("clearCartBtn");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function loadProducts() {
  try {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    products = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    if (!products.length) products = fallbackProducts;
  } catch (error) {
    console.warn("Using fallback products:", error.message);
    products = fallbackProducts;
  }
  renderProducts();
}

function getSelectedQuantity(id) {
  return selectedQuantities[id] || 1;
}

window.increaseProductQty = function(id) {
  const product = products.find(p => String(p.id) === String(id));
  const currentQty = getSelectedQuantity(id);

  if (currentQty >= Number(product.stock || 0)) {
    alert("Selected quantity cannot exceed available stock.");
    return;
  }

  selectedQuantities[id] = currentQty + 1;
  renderProducts();
};

window.decreaseProductQty = function(id) {
  const currentQty = getSelectedQuantity(id);
  selectedQuantities[id] = Math.max(1, currentQty - 1);
  renderProducts();
};

function renderProducts() {
  const search = (searchInput?.value || "").toLowerCase();

  const filtered = products.filter(product => {
    const matchCategory = currentCategory === "all" || product.category === currentCategory;
    const matchSearch = product.name.toLowerCase().includes(search);
    return matchCategory && matchSearch;
  });

  if (!filtered.length) {
    productGrid.innerHTML = `<div class="emptyState">No product found.</div>`;
    return;
  }

  productGrid.innerHTML = filtered.map(product => {
    const selectedQty = getSelectedQuantity(product.id);
    const stock = Number(product.stock || 0);
    const image = product.imageUrl || product.image || "assets/logo.png";
    const stockClass = stock <= 5 ? "stockText low" : "stockText";

    return `
      <div class="card">
        <div class="productImage">
          <img src="${image}" alt="${product.name}">
        </div>

        <div class="cardBody">
          <div class="productMeta">
            <h3>${product.name}</h3>
            <span class="categoryTag">${product.category}</span>
          </div>

          <p class="price">${formatNaira(Number(product.price))}</p>
          <p class="${stockClass}">${stock > 0 ? `Available Stock: ${stock}` : "Out of Stock"}</p>

          <div class="quantityRow">
            <button class="qtyBtn" onclick="decreaseProductQty('${product.id}')" type="button">−</button>
            <div class="qtyDisplay">${selectedQty}</div>
            <button class="qtyBtn" onclick="increaseProductQty('${product.id}')" type="button">+</button>
          </div>

          <button class="btn addBtn" onclick="addToCart('${product.id}')" type="button" ${stock <= 0 ? "disabled" : ""}>
            ${stock <= 0 ? "Out of Stock" : `Add ${selectedQty} to Cart`}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

window.addToCart = function(id) {
  const product = products.find(p => String(p.id) === String(id));
  const quantity = getSelectedQuantity(id);
  const existing = cart.find(item => String(item.id) === String(id));

  if (!product) return;

  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > Number(product.stock || 0)) {
      alert("Cart quantity cannot exceed available stock.");
      return;
    }
    existing.quantity = newQty;
  } else {
    cart.push({ ...product, quantity });
  }

  selectedQuantities[id] = 1;
  renderProducts();
  renderCart();
  document.getElementById("cart").scrollIntoView({ behavior: "smooth" });
};

window.increaseCartQty = function(id) {
  const item = cart.find(i => String(i.id) === String(id));
  const product = products.find(p => String(p.id) === String(id));

  if (item.quantity >= Number(product.stock || 0)) {
    alert("Quantity cannot exceed available stock.");
    return;
  }

  item.quantity += 1;
  renderCart();
};

window.decreaseCartQty = function(id) {
  const item = cart.find(i => String(i.id) === String(id));
  if (!item) return;

  item.quantity -= 1;
  if (item.quantity <= 0) {
    cart = cart.filter(i => String(i.id) !== String(id));
  }

  renderCart();
};

window.removeFromCart = function(id) {
  cart = cart.filter(item => String(item.id) !== String(id));
  renderCart();
};

function getCartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
}

function renderCart() {
  if (!cart.length) {
    cartItems.innerHTML = `<div class="emptyState">Your cart is empty. Select groceries from the shop section above.</div>`;
    checkoutPreview.innerHTML = `<div class="emptyState">No item selected yet.</div>`;
    cartTotal.textContent = formatNaira(0);
    checkoutTotal.textContent = formatNaira(0);
    cartCount.textContent = "0";
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div class="cartItem">
      <div>
        <strong>${item.name}</strong><br>
        <span>${formatNaira(Number(item.price))} x ${item.quantity}</span><br>
        <span>Subtotal: ${formatNaira(Number(item.price) * Number(item.quantity))}</span>
      </div>

      <div class="cartControls">
        <button onclick="decreaseCartQty('${item.id}')" type="button">−</button>
        <span>${item.quantity}</span>
        <button onclick="increaseCartQty('${item.id}')" type="button">+</button>
        <button class="removeBtn" onclick="removeFromCart('${item.id}')" type="button">×</button>
      </div>
    </div>
  `).join("");

  checkoutPreview.innerHTML = cart.map(item => `
    <div class="previewItem">
      <div>
        <strong>${item.name}</strong><br>
        <span>${formatNaira(Number(item.price))} x ${item.quantity}</span>
      </div>
      <strong>${formatNaira(Number(item.price) * Number(item.quantity))}</strong>
    </div>
  `).join("");

  cartTotal.textContent = formatNaira(getCartTotal());
  checkoutTotal.textContent = formatNaira(getCartTotal());
  cartCount.textContent = getCartCount();
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentCategory = button.dataset.category;
    renderProducts();
  });
});

searchInput?.addEventListener("input", renderProducts);

clearCartBtn?.addEventListener("click", () => {
  cart = [];
  renderCart();
});

export function getCartForCheckout() {
  return cart;
}

export function getCartTotalForCheckout() {
  return getCartTotal();
}

export function clearCartAfterOrder() {
  cart = [];
  renderCart();
}

loadProducts();
renderCart();
