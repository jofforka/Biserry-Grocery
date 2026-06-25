import { db, collection, getDocs, query, orderBy } from "./firebase-service.js";

const CART_STORAGE_KEY = "biserryCart";
const WISHLIST_STORAGE_KEY = "biserryWishlist";
const RECENT_STORAGE_KEY = "biserryRecentlyViewed";

const fallbackProducts = [
  {
    id: "demo-1",
    name: "Premium Rice",
    category: "grains",
    price: 75000,
    stock: 20,
    imageUrl: "assets/rice.jpg",
    hasVariants: false,
    isFeatured: true,
    productNote: "Quality rice and grains for family meals."
  },
  {
    id: "demo-2",
    name: "Toothpaste",
    category: "household",
    hasVariants: true,
    variantLabel: "Variety",
    imageUrl: "assets/household.jpg",
    isFeatured: true,
    productNote: "Household essentials with selectable varieties.",
    variants: [
      { id: "v1", name: "Colgate", price: 2500, stock: 20, imageUrl: "assets/household.jpg" },
      { id: "v2", name: "Close-Up", price: 2300, stock: 15, imageUrl: "assets/household.jpg" },
      { id: "v3", name: "Oral-B", price: 2800, stock: 10, imageUrl: "assets/household.jpg" }
    ]
  },
  {
    id: "demo-3",
    name: "Vegetable Oil",
    category: "oil",
    price: 48000,
    stock: 10,
    imageUrl: "assets/vegetable-oil.jpg",
    hasVariants: false,
    isFeatured: true,
    productNote: "Cooking oil for everyday meals."
  }
];

const heroSlides = [
  {
    badge: "Fresh • Affordable • Reliable",
    title: "Fresh groceries delivered to your doorstep.",
    text: "Shop foodstuff, beverages, household essentials and fresh items from Biserry Groceries.",
    image: "assets/hero-banner.png"
  },
  {
    badge: "Fast Delivery",
    title: "Order from home. We handle the delivery.",
    text: "Choose your items, review your cart, and send your order directly to Biserry Groceries.",
    image: "assets/fresh-vegetables.jpg"
  },
  {
    badge: "Everyday Essentials",
    title: "Stock your kitchen without market stress.",
    text: "From grains to oil, drinks, spices and household items — everything in one place.",
    image: "assets/rice.jpg"
  }
];

let products = [];
let cart = loadCartFromStorage();
let wishlist = loadWishlistFromStorage();
let selectedQuantities = {};
let selectedVariants = {};
let deliveryZones = [];
let selectedDeliveryFee = 0;
let currentCategory = "all";
let activeModalProductId = null;
let activeModalImageIndex = 0;
let heroIndex = 0;

const productGrid = document.getElementById("productGrid");
const featuredGrid = document.getElementById("featuredGrid");
const recentGrid = document.getElementById("recentGrid");
const searchInput = document.getElementById("searchInput");

const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const navCartCount = document.getElementById("navCartCount");
const floatingCartCount = document.getElementById("floatingCartCount");
const bottomCartCount = document.getElementById("bottomCartCount");

const checkoutPreview = document.getElementById("checkoutPreview");
const checkoutTotal = document.getElementById("checkoutTotal");
const clearCartBtn = document.getElementById("clearCartBtn");
const deliveryZoneSelect = document.getElementById("deliveryZone");
const fulfillmentSelect = document.getElementById("fulfillment");
const deliveryFeePreview = document.getElementById("deliveryFeePreview");

const floatingCartBtn = document.getElementById("floatingCartBtn");
const bottomCartBtn = document.getElementById("bottomCartBtn");
const miniCart = document.getElementById("miniCart");
const miniCartOverlay = document.getElementById("miniCartOverlay");
const closeMiniCartBtn = document.getElementById("closeMiniCartBtn");
const miniCartItems = document.getElementById("miniCartItems");
const miniCartTotal = document.getElementById("miniCartTotal");

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mainNav = document.getElementById("mainNav");

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

function loadWishlistFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveWishlistToStorage() {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
}

function saveRecentlyViewed(productId) {
  const existing = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
  const updated = [productId, ...existing.filter(id => String(id) !== String(productId))].slice(0, 12);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
}

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function normalizeImageUrl(url) {
  if (!url) return "assets/logo.png";

  const cleanUrl = String(url).trim();

  const fileMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch && fileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1000`;
  }

  const idMatch = cleanUrl.match(/[?&]id=([^&]+)/);
  if (cleanUrl.includes("drive.google.com") && idMatch && idMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
  }

  return cleanUrl;
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

function startHeroCarousel() {
  const badge = document.getElementById("heroBadge");
  const title = document.getElementById("heroTitle");
  const text = document.getElementById("heroText");
  const image = document.getElementById("heroImage");

  if (!badge || !title || !text || !image) return;

  setInterval(() => {
    heroIndex = (heroIndex + 1) % heroSlides.length;
    const slide = heroSlides[heroIndex];

    badge.textContent = slide.badge;
    title.textContent = slide.title;
    text.textContent = slide.text;
    image.src = slide.image;
  }, 5200);
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
      .map(zone => `<option value="${zone.zone}" data-fee="${zone.fee}">${zone.zone} — ${formatNaira(Number(zone.fee))}</option>`)
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

  if (String(activeModalProductId) === String(productId)) {
    activeModalImageIndex = 0;
    refreshProductModal();
  }
};

window.toggleWishlist = productId => {
  if (wishlist.includes(productId)) {
    wishlist = wishlist.filter(id => id !== productId);
    showCartToast("Removed from wishlist");
  } else {
    wishlist.push(productId);
    showCartToast("Added to wishlist");
  }

  saveWishlistToStorage();
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

  if (String(activeModalProductId) === String(id)) refreshProductModal();
};

window.decreaseProductQty = id => {
  selectedQuantities[id] = Math.max(1, getSelectedQuantity(id) - 1);

  renderProducts();
  renderFeaturedProducts();
  renderRecentProducts();

  if (String(activeModalProductId) === String(id)) refreshProductModal();
};

function productCard(product) {
  const variant = getSelectedVariant(product);
  const quantity = getSelectedQuantity(product.id);

  const price = variant ? Number(variant.price || 0) : Number(product.price || 0);
  const stock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);

  const rawImage = variant?.imageUrl || product.imageUrl || product.image || "assets/logo.png";
  const image = normalizeImageUrl(rawImage);
  const optionLabel = product.variantLabel || (product.optionType === "sizes" ? "Size" : "Variety");
  const tagLabel = product.variantLabel ? `${product.variantLabel}s` : product.hasVariants ? "Varieties" : product.category;
  const stockClass = stock <= Number(product.lowStockThreshold || 5) ? "stockText low" : "stockText";
  const isWishlisted = wishlist.includes(product.id);

  const variantHtml =
    product.hasVariants && product.variants?.length
      ? `
        <div class="variantBox">
          <label>Select ${optionLabel}</label>
          <select onchange="selectVariant('${product.id}', this.value)">
            ${product.variants
              .map(item => `<option value="${item.id}" ${variant?.id === item.id ? "selected" : ""}>${item.name} — ${formatNaira(Number(item.price || 0))}</option>`)
              .join("")}
          </select>
        </div>
      `
      : "";

  return `
    <div class="card">
      <button class="productImage productImageButton" type="button" onclick="openProductModal('${product.id}')">
        <img src="${image}" alt="${product.name}" onerror="this.src='assets/logo.png'">
        <span class="imageHint">Tap to view</span>
      </button>

      <div class="cardBody">
        <div class="productBadges">
          ${(product.isFeatured || product.featured) ? '<span class="productBadge">Featured</span>' : ''}
          ${stock <= Number(product.lowStockThreshold || 5) && stock > 0 ? '<span class="productBadge">Low Stock</span>' : ''}
          ${product.isBestSeller ? '<span class="productBadge">Best Seller</span>' : ''}
        </div>

        <div class="productMeta">
          <h3>${product.name}</h3>
          <span class="categoryTag">${tagLabel}</span>
        </div>

        <div class="ratingLine">★★★★★ <span>(Popular)</span></div>

        ${variantHtml}

        <p class="price">${formatNaira(price)}</p>

        <p class="${stockClass}">
          ${stock > 0 ? `Available Stock: ${stock}` : "Out of Stock"}
        </p>

        <div class="quantityRow">
          <button class="qtyBtn" onclick="decreaseProductQty('${product.id}')" type="button">−</button>
          <div class="qtyDisplay">${quantity}</div>
          <button class="qtyBtn" onclick="increaseProductQty('${product.id}')" type="button">+</button>
        </div>

        <div class="productActionRow">
          <button class="wishlistBtn ${isWishlisted ? "active" : ""}" onclick="toggleWishlist('${product.id}')" type="button">♥</button>
          <button class="btn addBtn" onclick="addToCart('${product.id}')" type="button" ${stock <= 0 ? "disabled" : ""}>
            ${stock <= 0 ? "Out of Stock" : `Add ${quantity} to Cart`}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderProducts() {
  if (!productGrid) return;

  const search = (searchInput?.value || "").toLowerCase();

  const filtered = products.filter(product => {
    const variantText = (product.variants || []).map(v => `${v.name} ${v.sku || ""}`).join(" ").toLowerCase();

    return (
      (currentCategory === "all" || product.category === currentCategory) &&
      `${product.name} ${product.category} ${product.sku || ""} ${variantText}`.toLowerCase().includes(search)
    );
  });

  productGrid.innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : '<div class="emptyState">No product found.</div>';
}

function renderFeaturedProducts() {
  if (!featuredGrid) return;

  const featured = products.filter(product => product.isFeatured || product.featured).slice(0, 6);
  const display = featured.length ? featured : products.slice(0, 3);

  featuredGrid.innerHTML = display.length
    ? display.map(productCard).join("")
    : '<div class="emptyState">No featured products yet.</div>';
}

function renderRecentProducts() {
  if (!recentGrid) return;

  const recentIds = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
  const recentViewed = recentIds
    .map(id => products.find(product => String(product.id) === String(id)))
    .filter(Boolean);

  const display = recentViewed.length ? recentViewed : products.slice(0, 6);

  recentGrid.innerHTML = display.length
    ? display.map(productCard).join("")
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
  const rawImage = variant?.imageUrl || product.imageUrl || product.image || "assets/logo.png";
  const imageUrl = normalizeImageUrl(rawImage);

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
      variantLabel: product.variantLabel || null,
      category: product.category,
      price,
      stock,
      imageUrl,
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
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
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
    if (deliveryZoneSelect) deliveryZoneSelect.value = "Pickup";
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
    .map(item => `
      <div class="miniCartItem">
        <img src="${normalizeImageUrl(item.imageUrl)}" alt="${item.name}" onerror="this.src='assets/logo.png'">
        <div>
          <strong>${item.name}</strong>
          <span>${formatNaira(item.price)} x ${item.quantity}</span>
        </div>
        <button onclick="removeFromCart('${item.cartId}')" type="button">×</button>
      </div>
    `)
    .join("");

  miniCartTotal.textContent = formatNaira(getCartTotal());
}

function renderCart() {
  const count = getCartCount();

  if (cartCount) cartCount.textContent = count;
  if (navCartCount) navCartCount.textContent = count;
  if (floatingCartCount) floatingCartCount.textContent = count;
  if (bottomCartCount) bottomCartCount.textContent = count;

  if (!cart.length) {
    if (cartItems) {
      cartItems.innerHTML = '<div class="emptyState">Your cart is empty. Select groceries from the shop page.</div>';
    }

    if (checkoutPreview) checkoutPreview.innerHTML = '<div class="emptyState">No item selected yet.</div>';
    if (cartTotal) cartTotal.textContent = formatNaira(0);
    if (checkoutTotal) checkoutTotal.textContent = formatNaira(0);
    if (deliveryFeePreview) deliveryFeePreview.textContent = formatNaira(selectedDeliveryFee);

    renderMiniCart();
    return;
  }

  if (cartItems) {
    cartItems.innerHTML = cart
      .map(item => `
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
      `)
      .join("");
  }

  if (checkoutPreview) {
    checkoutPreview.innerHTML = cart
      .map(item => `
        <div class="previewItem">
          <div>
            <strong>${item.name}</strong><br>
            <span>${formatNaira(item.price)} x ${item.quantity}</span>
          </div>
          <strong>${formatNaira(item.price * item.quantity)}</strong>
        </div>
      `)
      .join("");
  }

  if (cartTotal) cartTotal.textContent = formatNaira(getCartTotal());
  if (checkoutTotal) checkoutTotal.textContent = formatNaira(getCartTotal());
  if (deliveryFeePreview) deliveryFeePreview.textContent = formatNaira(selectedDeliveryFee);

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

function getProductGalleryImages(product) {
  const variant = getSelectedVariant(product);

  const images = [
    variant?.imageUrl,
    product.imageUrl,
    product.image,
    ...(product.galleryImages || []),
    ...(variant?.galleryImages || [])
  ]
    .filter(Boolean)
    .map(normalizeImageUrl);

  return [...new Set(images.length ? images : ["assets/logo.png"])];
}

function ensureProductModal() {
  if (document.getElementById("productModalOverlay")) return;

  const modal = document.createElement("div");
  modal.id = "productModalOverlay";
  modal.className = "productModalOverlay";

  modal.innerHTML = `
    <div class="productModal">
      <button class="productModalClose" type="button" onclick="closeProductModal()">×</button>

      <div class="productModalGallery">
        <button class="galleryArrow left" type="button" onclick="changeProductModalImage(-1)">‹</button>
        <img id="productModalImage" src="assets/logo.png" alt="Product image" onerror="this.src='assets/logo.png'">
        <button class="galleryArrow right" type="button" onclick="changeProductModalImage(1)">›</button>
        <div id="productModalDots" class="productModalDots"></div>
      </div>

      <div class="productModalInfo">
        <span id="productModalCategory" class="categoryTag"></span>
        <h2 id="productModalName"></h2>
        <p id="productModalDescription"></p>
        <div id="productModalVariantBox"></div>
        <p id="productModalPrice" class="price"></p>
        <p id="productModalStock" class="stockText"></p>

        <div class="quantityRow modalQtyRow">
          <button class="qtyBtn" type="button" onclick="decreaseProductQty(activeModalProductId)">−</button>
          <div id="productModalQty" class="qtyDisplay">1</div>
          <button class="qtyBtn" type="button" onclick="increaseProductQty(activeModalProductId)">+</button>
        </div>

        <button id="productModalAddBtn" class="btn addBtn" type="button">Add to Cart</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", event => {
    if (event.target.id === "productModalOverlay") closeProductModal();
  });
}

function renderProductModalImage(product) {
  const images = getProductGalleryImages(product);
  const image = images[activeModalImageIndex] || images[0] || "assets/logo.png";

  const imgEl = document.getElementById("productModalImage");
  const dotsEl = document.getElementById("productModalDots");

  if (imgEl) imgEl.src = image;

  if (dotsEl) {
    dotsEl.innerHTML = images
      .map((_, index) => `<button type="button" class="${index === activeModalImageIndex ? "active" : ""}" onclick="setProductModalImage(${index})"></button>`)
      .join("");
  }
}

window.openProductModal = function(productId) {
  ensureProductModal();
  activeModalProductId = productId;
  activeModalImageIndex = 0;

  saveRecentlyViewed(productId);
  refreshProductModal();

  document.getElementById("productModalOverlay")?.classList.add("show");
};

window.closeProductModal = function() {
  document.getElementById("productModalOverlay")?.classList.remove("show");
};

window.changeProductModalImage = function(direction) {
  const product = products.find(item => String(item.id) === String(activeModalProductId));
  if (!product) return;

  const images = getProductGalleryImages(product);
  activeModalImageIndex = (activeModalImageIndex + direction + images.length) % images.length;

  renderProductModalImage(product);
};

window.setProductModalImage = function(index) {
  const product = products.find(item => String(item.id) === String(activeModalProductId));
  if (!product) return;

  activeModalImageIndex = index;
  renderProductModalImage(product);
};

window.refreshProductModal = function() {
  const product = products.find(item => String(item.id) === String(activeModalProductId));
  if (!product) return;

  const variant = getSelectedVariant(product);
  const quantity = getSelectedQuantity(product.id);
  const price = variant ? Number(variant.price || 0) : Number(product.price || 0);
  const stock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);
  const optionLabel = product.variantLabel || (product.optionType === "sizes" ? "Size" : "Variety");

  const categoryEl = document.getElementById("productModalCategory");
  const nameEl = document.getElementById("productModalName");
  const descEl = document.getElementById("productModalDescription");
  const variantBox = document.getElementById("productModalVariantBox");
  const priceEl = document.getElementById("productModalPrice");
  const stockEl = document.getElementById("productModalStock");
  const qtyEl = document.getElementById("productModalQty");
  const addBtn = document.getElementById("productModalAddBtn");

  if (categoryEl) categoryEl.textContent = product.variantLabel ? `${product.variantLabel}s` : product.category || "Product";
  if (nameEl) nameEl.textContent = variant ? `${product.name} - ${variant.name}` : product.name;
  if (descEl) descEl.textContent = product.productNote || product.description || "Fresh, affordable and reliable groceries from Biserry Groceries.";
  if (priceEl) priceEl.textContent = formatNaira(price);
  if (stockEl) stockEl.textContent = stock > 0 ? `Available Stock: ${stock}` : "Out of Stock";
  if (qtyEl) qtyEl.textContent = quantity;

  if (variantBox) {
    variantBox.innerHTML =
      product.hasVariants && product.variants?.length
        ? `
          <div class="variantBox">
            <label>Select ${optionLabel}</label>
            <select onchange="selectVariant('${product.id}', this.value)">
              ${product.variants
                .map(item => `<option value="${item.id}" ${variant?.id === item.id ? "selected" : ""}>${item.name} — ${formatNaira(Number(item.price || 0))}</option>`)
                .join("")}
            </select>
          </div>
        `
        : "";
  }

  if (addBtn) {
    addBtn.disabled = stock <= 0;
    addBtn.textContent = stock <= 0 ? "Out of Stock" : `Add ${quantity} to Cart`;
    addBtn.onclick = () => {
      addToCart(product.id);
      refreshProductModal();
    };
  }

  renderProductModalImage(product);
};

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
bottomCartBtn?.addEventListener("click", openMiniCart);
closeMiniCartBtn?.addEventListener("click", closeMiniCart);
miniCartOverlay?.addEventListener("click", closeMiniCart);

mobileMenuBtn?.addEventListener("click", () => {
  mainNav?.classList.toggle("open");
});

mainNav?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => mainNav?.classList.remove("open"));
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

startHeroCarousel();
await loadDeliveryZones();
await loadProducts();
renderCart();
