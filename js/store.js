import { db, collection, getDocs, query, orderBy } from "./firebase-service.js";

const CART_STORAGE_KEY = "biserryCart";

const fallbackProducts = [
  { id: "demo-1", name: "Premium Rice", category: "grains", price: 75000, stock: 20, imageUrl: "assets/rice.jpg", hasVariants: false, isFeatured: true },
  {
    id: "demo-2",
    name: "Toothpaste",
    category: "household",
    hasVariants: true,
    imageUrl: "assets/household.jpg",
    isFeatured: true,
    variants: [
      { id: "v1", name: "Colgate", price: 2500, stock: 20, imageUrl: "assets/household.jpg" },
      { id: "v2", name: "Close-Up", price: 2300, stock: 15, imageUrl: "assets/household.jpg" },
      { id: "v3", name: "Oral-B", price: 2800, stock: 10, imageUrl: "assets/household.jpg" }
    ]
  },
  { id: "demo-3", name: "Vegetable Oil", category: "oil", price: 48000, stock: 10, imageUrl: "assets/vegetable-oil.jpg", hasVariants: false, isFeatured: true }
];

let products = [];
let cart = loadCartFromStorage();
let selectedQuantities = {};
let selectedVariants = {};
let deliveryZones = [];
let selectedDeliveryFee = 0;
let currentCategory = "all";

const productGrid = document.getElementById("productGrid");
const featuredGrid = document.getElementById("featuredGrid");
const recentGrid = document.getElementById("recentGrid");
const searchInput = document.getElementById("searchInput");

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const navCartCount = document.getElementById("navCartCount");
const floatingCartCount = document.getElementById("floatingCartCount");

const checkoutPreview = document.getElementById("checkoutPreview");
const checkoutTotal = document.getElementById("checkoutTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const deliveryZoneSelect = document.getElementById("deliveryZone");
const fulfillmentSelect = document.getElementById("fulfillment");
const deliveryFeePreview = document.getElementById("deliveryFeePreview");

const floatingCartBtn = document.getElementById("floatingCartBtn");
const miniCart = document.getElementById("miniCart");
const miniCartOverlay = document.getElementById("miniCartOverlay");
const closeMiniCartBtn = document.getElementById("closeMiniCartBtn");
const miniCartItems = document.getElementById("miniCartItems");
const miniCartTotal = document.getElementById("miniCartTotal");

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
  if (!productGrid && !featuredGrid && !recentGrid) return;

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
  renderFeaturedProducts();
  renderRecentProducts();
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
  renderFeaturedProducts();
  renderRecentProducts();
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
  renderFeaturedProducts();
  renderRecentProducts();
};

window.decreaseProductQty = id => {
  selectedQuantities[id] = Math.max(1, getSelectedQuantity(id) - 1);
  renderProducts();
  renderFeaturedProducts();
  renderRecentProducts();
};

function productCard(product) {
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
          <label>Select ${product.variantLabel || "Variety"}</label>
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
          <span class="categoryTag">${product.variantLabel ? product.variantLabel + "s" : product.hasVariants ? "Varieties" : product.category}</span>
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
}

function renderProducts() {
  if (!productGrid) return;

  const search = (searchInput?.value || "").toLowerCase();

  const filtered = products.filter(
    product =>
      (currentCategory === "all" || product.category === currentCategory) &&
      product.name.toLowerCase().includes(search)
  );

  productGrid.innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : '<div class="emptyState">No product found.</div>';
}

function renderFeaturedProducts() {
  if (!featuredGrid) return;

  const featured = products
    .filter(product => product.isFeatured || product.featured)
    .slice(0, 6);

  const display = featured.length ? featured : products.slice(0, 3);

  featuredGrid.innerHTML = display.length
    ? display.map(productCard).join("")
    : '<div class="emptyState">No featured products yet.</div>';
}

function renderRecentProducts() {
  if (!recentGrid) return;

  const recent = products.slice(0, 6);

  recentGrid.innerHTML = recent.length
    ? recent.map(productCard).join("")
    : '<div class="emptyState">No recent products yet.</div>';
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
  renderFeaturedProducts();
  renderRecentProducts();
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

function renderMiniCart() {
  if (!miniCartItems || !miniCartTotal) return;

  if (!cart.length) {
    miniCartItems.innerHTML = '<div class="emptyState">Your cart is empty.</div>';
    miniCartTotal.textContent = formatNaira(0);
    return;
  }

  miniCartItems.innerHTML = cart
    .map(
      item => `
      <div class="miniCartItem">
        <img src="${item.imageUrl || "assets/logo.png"}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <span>${formatNaira(item.price)} x ${item.quantity}</span>
        </div>
        <button onclick="removeFromCart('${item.cartId}')" type="button">×</button>
      </div>
    `
    )
    .join("");

  miniCartTotal.textContent = formatNaira(getCartTotal());
}

function renderCart() {
  const count = getCartCount();

  if (cartCount) cartCount.textContent = count;
  if (navCartCount) navCartCount.textContent = count;
  if (floatingCartCount) floatingCartCount.textContent = count;

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

    renderMiniCart();
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

  renderMiniCart();
}

function openMiniCart() {
  if (miniCart) miniCart.classList.add("open");
  if (miniCartOverlay) miniCartOverlay.classList.add("show");
}

function closeMiniCart() {
  if (miniCart) miniCart.classList.remove("open");
  if (miniCartOverlay) miniCartOverlay.classList.remove("show");
}

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    currentCategory = button.dataset.category;
    renderProducts();
  });
});

document.querySelectorAll("[data-category-jump]").forEach(button => {
  button.addEventListener("click", () => {
    const category = button.dataset.categoryJump;
    const filterBtn = document.querySelector(`.filter[data-category="${category}"]`);
    if (filterBtn) filterBtn.click();
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
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

floatingCartBtn?.addEventListener("click", openMiniCart);
closeMiniCartBtn?.addEventListener("click", closeMiniCart);
miniCartOverlay?.addEventListener("click", closeMiniCart);

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
