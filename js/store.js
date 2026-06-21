import { db, collection, getDocs, query, orderBy } from "./firebase-service.js";

const CART_STORAGE_KEY = "biserryCart";

const fallbackProducts = [
  { id: "demo-1", name: "Premium Rice", category: "grains", price: 75000, stock: 20, imageUrl: "assets/rice.jpg", hasVariants: false },
  {
    id: "demo-2",
    name: "Toothpaste",
    category: "household",
    hasVariants: true,
    imageUrl: "assets/household.jpg",
    variants: [
      { id: "v1", name: "Colgate", price: 2500, stock: 20, imageUrl: "assets/household.jpg" },
      { id: "v2", name: "Close-Up", price: 2300, stock: 15, imageUrl: "assets/household.jpg" },
      { id: "v3", name: "Oral-B", price: 2800, stock: 10, imageUrl: "assets/household.jpg" }
    ]
  },
  { id: "demo-3", name: "Vegetable Oil", category: "oil", price: 48000, stock: 10, imageUrl: "assets/vegetable-oil.jpg", hasVariants: false }
];

let products = [];
let cart = loadCartFromStorage();
let selectedQuantities = {};
let selectedVariants = {};
let deliveryZones = [];
let selectedDeliveryFee = 0;
let currentCategory = "all";

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const navCartCount = document.getElementById("navCartCount");
const checkoutPreview = document.getElementById("checkoutPreview");
const checkoutTotal = document.getElementById("checkoutTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const deliveryZoneSelect = document.getElementById("deliveryZone");
const fulfillmentSelect = document.getElementById("fulfillment");
const deliveryFeePreview = document.getElementById("deliveryFeePreview");

function loadCartFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCartToStorage() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function showCartToast(message = "Added to cart") {
  const cartToast = document.getElementById("cartToast");
  if (!cartToast) return;

  cartToast.textContent = message;
  cartToast.classList.add("show");

  setTimeout(() => {
    cartToast.classList.remove("show");
  }, 1600);
}

async function loadProducts() {
  if (!productGrid) return;

  try {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    products = snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    if (!products.length) products = fallbackProducts;
  } catch (error) {
    console.warn(error.message);
    products = fallbackProducts;
  }

  renderProducts();
}

async function loadDeliveryZones() {
  if (!deliveryZoneSelect) return;

  try {
    const snap = await getDocs(collection(db, "delivery_zones"));

    deliveryZones = snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    if (!deliveryZones.length) throw new Error("empty");
  } catch {
    deliveryZones = [
      { zone: "Pickup", fee: 0 },
      { zone: "Wuse", fee: 2000 },
      { zone: "Garki", fee: 2500 },
      { zone: "Maitama", fee: 3000 }
    ];
  }

  deliveryZoneSelect.innerHTML =
    '<option value="">Select Delivery Zone</option>' +
    deliveryZones
      .map(
        zone =>
          `<option value="${zone.zone}" data-fee="${zone.fee}">${zone.zone} — ${formatNaira(Number(zone.fee))}</option>`
      )
      .join("");
}

function getSelectedQuantity(id) {
  return selectedQuantities[id] || 1;
}

function getSelectedVariant(product) {
  if (!product || !product.hasVariants) return null;

  const variantId = selectedVariants[product.id] || product.variants?.[0]?.id;

  return (
    product.variants?.find(variant => String(variant.id) === String(variantId)) ||
    product.variants?.[0]
  );
}

window.selectVariant = (productId, variantId) => {
  selectedVariants[productId] = variantId;
  renderProducts();
};

window.increaseProductQty = id => {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;

  const variant = getSelectedVariant(product);
  const stock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);
  const quantity = getSelectedQuantity(id);

  if (quantity >= stock) {
    alert("Selected quantity cannot exceed available stock.");
    return;
  }

  selectedQuantities[id] = quantity + 1;
  renderProducts();
};

window.decreaseProductQty = id => {
  selectedQuantities[id] = Math.max(1, getSelectedQuantity(id) - 1);
  renderProducts();
};

function renderProducts() {
  if (!productGrid) return;

  const search = (searchInput?.value || "").toLowerCase();

  const filtered = products.filter(
    product =>
      (currentCategory === "all" || product.category === currentCategory) &&
      product.name.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    productGrid.innerHTML = '<div class="emptyState">No product found.</div>';
    return;
  }

  productGrid.innerHTML = filtered
    .map(product => {
      const variant = getSelectedVariant(product);
      const quantity = getSelectedQuantity(product.id);
      const price = variant ? Number(variant.price || 0) : Number(product.price || 0);
      const stock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);
      const image = variant?.imageUrl || product.imageUrl || product.image || "assets/logo.png";
      const stockClass =
        stock <= Number(product.lowStockThreshold || 5) ? "stockText low" : "stockText";

      const variantHtml =
        product.hasVariants && product.variants?.length
          ? `
            <div class="variantBox">
              <label>Select Variety</label>
              <select onchange="selectVariant('${product.id}', this.value)">
                ${product.variants
                  .map(
                    item => `
                    <option value="${item.id}" ${variant?.id === item.id ? "selected" : ""}>
                      ${item.name} — ${formatNaira(Number(item.price || 0))}
                    </option>
                  `
                  )
                  .join("")}
              </select>
            </div>
          `
          : "";

      return `
        <div class="card">
          <div class="productImage">
            <img src="${image}" alt="${product.name}">
          </div>

          <div class="cardBody">
            <div class="productMeta">
              <h3>${product.name}</h3>
              <span class="categoryTag">${product.hasVariants ? "Varieties" : product.category}</span>
            </div>

            ${variantHtml}

            <p class="price">${formatNaira(price)}</p>
            <p class="${stockClass}">${stock > 0 ? `Available Stock: ${stock}` : "Out of Stock"}</p>

            <div class="quantityRow">
              <button class="qtyBtn" onclick="decreaseProductQty('${product.id}')" type="button">−</button>
              <div class="qtyDisplay">${quantity}</div>
              <button class="qtyBtn" onclick="increaseProductQty('${product.id}')" type="button">+</button>
            </div>

            <button class="btn addBtn" onclick="addToCart('${product.id}')" type="button" ${stock <= 0 ? "disabled" : ""}>
              ${stock <= 0 ? "Out of Stock" : `Add ${quantity} to Cart`}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

window.addToCart = id => {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;

  const variant = getSelectedVariant(product);
  const quantity = getSelectedQuantity(id);

  const cartId = variant ? `${product.id}__${variant.id}` : product.id;
  const price = variant ? Number(variant.price || 0) : Number(product.price || 0);
  const stock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);
  const displayName = variant ? `${product.name} - ${variant.name}` : product.name;

  const existing = cart.find(item => String(item.cartId) === String(cartId));

  if (existing) {
    if (existing.quantity + quantity > stock) {
      alert("Cart quantity cannot exceed available stock.");
      return;
    }

    existing.quantity += quantity;
  } else {
    cart.push({
      cartId,
      productId: product.id,
      variantId: variant?.id || null,
      name: displayName,
      baseProductName: product.name,
      variantName: variant?.name || null,
      category: product.category,
      price,
      stock,
      imageUrl: variant?.imageUrl || product.imageUrl || "assets/logo.png",
      quantity
    });
  }

  selectedQuantities[id] = 1;

  saveCartToStorage();
  renderProducts();
  renderCart();

  showCartToast("Added to cart");
};

window.increaseCartQty = cartId => {
  const item = cart.find(cartItem => String(cartItem.cartId) === String(cartId));
  if (!item) return;

  if (item.quantity >= Number(item.stock || 0)) {
    alert("Quantity cannot exceed available stock.");
    return;
  }

  item.quantity++;
  saveCartToStorage();
  renderCart();
};

window.decreaseCartQty = cartId => {
  const item = cart.find(cartItem => String(cartItem.cartId) === String(cartId));
  if (!item) return;

  item.quantity--;

  if (item.quantity <= 0) {
    cart = cart.filter(cartItem => String(cartItem.cartId) !== String(cartId));
  }

  saveCartToStorage();
  renderCart();
};

window.removeFromCart = cartId => {
  cart = cart.filter(cartItem => String(cartItem.cartId) !== String(cartId));
  saveCartToStorage();
  renderCart();
};

function getCartSubtotal() {
  return cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
}

function getCartTotal() {
  return getCartSubtotal() + selectedDeliveryFee;
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
}

function updateDeliveryFee() {
  if (fulfillmentSelect?.value === "Pickup") {
    selectedDeliveryFee = 0;

    if (deliveryZoneSelect) {
      deliveryZoneSelect.value = "Pickup";
    }
  } else {
    const selectedOption = deliveryZoneSelect?.selectedOptions?.[0];
    selectedDeliveryFee = Number(selectedOption?.dataset?.fee || 0);
  }

  renderCart();
}

function renderCart() {
  const count = getCartCount();

  if (cartCount) cartCount.textContent = count;
  if (navCartCount) navCartCount.textContent = count;

  if (!cart.length) {
    if (cartItems) {
      cartItems.innerHTML =
        '<div class="emptyState">Your cart is empty. Select groceries from the shop page.</div>';
    }

    if (checkoutPreview) {
      checkoutPreview.innerHTML =
        '<div class="emptyState">No item selected yet.</div>';
    }

    if (cartTotal) cartTotal.textContent = formatNaira(0);
    if (checkoutTotal) checkoutTotal.textContent = formatNaira(0);
    if (deliveryFeePreview) deliveryFeePreview.textContent = formatNaira(selectedDeliveryFee);

    return;
  }

  if (cartItems) {
    cartItems.innerHTML = cart
      .map(
        item => `
        <div class="cartItem">
          <div>
            <strong>${item.name}</strong><br>
            <span>${formatNaira(item.price)} x ${item.quantity}</span><br>
            <span>Subtotal: ${formatNaira(item.price * item.quantity)}</span>
          </div>

          <div class="cartControls">
            <button onclick="decreaseCartQty('${item.cartId}')" type="button">−</button>
            <span>${item.quantity}</span>
            <button onclick="increaseCartQty('${item.cartId}')" type="button">+</button>
            <button class="removeBtn" onclick="removeFromCart('${item.cartId}')" type="button">×</button>
          </div>
        </div>
      `
      )
      .join("");
  }

  if (checkoutPreview) {
    checkoutPreview.innerHTML = cart
      .map(
        item => `
        <div class="previewItem">
          <div>
            <strong>${item.name}</strong><br>
            <span>${formatNaira(item.price)} x ${item.quantity}</span>
          </div>
          <strong>${formatNaira(item.price * item.quantity)}</strong>
        </div>
      `
      )
      .join("");
  }

  if (cartTotal) cartTotal.textContent = formatNaira(getCartTotal());
  if (checkoutTotal) checkoutTotal.textContent = formatNaira(getCartTotal());

  if (deliveryFeePreview) {
    deliveryFeePreview.textContent = formatNaira(selectedDeliveryFee);
  }
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    currentCategory = button.dataset.category;
    renderProducts();
  });
});

searchInput?.addEventListener("input", renderProducts);
deliveryZoneSelect?.addEventListener("change", updateDeliveryFee);
fulfillmentSelect?.addEventListener("change", updateDeliveryFee);

clearCartBtn?.addEventListener("click", () => {
  cart = [];
  saveCartToStorage();
  renderCart();
});

export function getCartForCheckout() {
  return cart;
}

export function getCartSubtotalForCheckout() {
  return getCartSubtotal();
}

export function getDeliveryFeeForCheckout() {
  return selectedDeliveryFee;
}

export function getDeliveryZoneForCheckout() {
  return deliveryZoneSelect?.value || "";
}

export function getCartTotalForCheckout() {
  return getCartTotal();
}

export function clearCartAfterOrder() {
  cart = [];
  saveCartToStorage();
  renderCart();
}

await loadDeliveryZones();
await loadProducts();
renderCart();
