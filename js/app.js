let cart = [];
let selectedQuantities = {};
let currentCategory = "all";

const grid = document.getElementById("productGrid");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const checkoutTotal = document.getElementById("checkoutTotal");
const checkoutPreview = document.getElementById("checkoutPreview");
const searchInput = document.getElementById("searchInput");
const clearCartBtn = document.getElementById("clearCartBtn");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount);
}

function getSelectedQuantity(id) {
  return selectedQuantities[id] || 1;
}

function increaseProductQty(id) {
  const product = products.find(p => p.id === id);
  const currentQty = getSelectedQuantity(id);

  if (currentQty >= product.stock) {
    alert("Selected quantity cannot exceed available stock.");
    return;
  }

  selectedQuantities[id] = currentQty + 1;
  renderProducts();
}

function decreaseProductQty(id) {
  const currentQty = getSelectedQuantity(id);
  selectedQuantities[id] = Math.max(1, currentQty - 1);
  renderProducts();
}

function renderProducts() {
  const search = searchInput.value.toLowerCase();

  const filtered = products.filter(product => {
    const matchCategory = currentCategory === "all" || product.category === currentCategory;
    const matchSearch = product.name.toLowerCase().includes(search);
    return matchCategory && matchSearch;
  });

  grid.innerHTML = filtered.map(product => {
    const selectedQty = getSelectedQuantity(product.id);

    return `
      <div class="card">
        <div class="productImage">
          <img src="${product.image}" alt="${product.name}">
        </div>

        <div class="cardBody">
          <div class="productMeta">
            <h3>${product.name}</h3>
            <span class="categoryTag">${product.category}</span>
          </div>

          <p class="price">${formatNaira(product.price)}</p>
          <p class="stockText">Available Stock: ${product.stock}</p>

          <div class="quantityRow">
            <button class="qtyBtn" onclick="decreaseProductQty(${product.id})" type="button">−</button>
            <div class="qtyDisplay">${selectedQty}</div>
            <button class="qtyBtn" onclick="increaseProductQty(${product.id})" type="button">+</button>
          </div>

          <button class="btn addBtn" onclick="addToCart(${product.id})" type="button">
            Add ${selectedQty} to Cart
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function addToCart(id) {
  const product = products.find(p => p.id === id);
  const quantity = getSelectedQuantity(id);
  const existing = cart.find(item => item.id === id);

  if (existing) {
    const newQty = existing.quantity + quantity;

    if (newQty > product.stock) {
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
}

function increaseCartQty(id) {
  const item = cart.find(i => i.id === id);
  const product = products.find(p => p.id === id);

  if (item.quantity >= product.stock) {
    alert("Quantity cannot exceed available stock.");
    return;
  }

  item.quantity += 1;
  renderCart();
}

function decreaseCartQty(id) {
  const item = cart.find(i => i.id === id);
  if (!item) return;

  item.quantity -= 1;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.id !== id);
  }

  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function renderCart() {
  if (cart.length === 0) {
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
        <span>${formatNaira(item.price)} x ${item.quantity}</span><br>
        <span>Subtotal: ${formatNaira(item.price * item.quantity)}</span>
      </div>

      <div class="cartControls">
        <button onclick="decreaseCartQty(${item.id})" type="button">−</button>
        <span>${item.quantity}</span>
        <button onclick="increaseCartQty(${item.id})" type="button">+</button>
        <button class="removeBtn" onclick="removeFromCart(${item.id})" type="button">×</button>
      </div>
    </div>
  `).join("");

  checkoutPreview.innerHTML = cart.map(item => `
    <div class="previewItem">
      <div>
        <strong>${item.name}</strong><br>
        <span>${formatNaira(item.price)} x ${item.quantity}</span>
      </div>
      <strong>${formatNaira(item.price * item.quantity)}</strong>
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

searchInput.addEventListener("input", renderProducts);
clearCartBtn.addEventListener("click", clearCart);

document.getElementById("checkoutForm").addEventListener("submit", function(e) {
  e.preventDefault();

  if (cart.length === 0) {
    alert("Please add at least one item to cart.");
    document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const name = document.getElementById("customerName").value;
  const phone = document.getElementById("customerPhone").value;
  const address = document.getElementById("customerAddress").value;
  const fulfillment = document.getElementById("fulfillment").value;
  const paymentMethod = document.getElementById("paymentMethod").value;

  const orderList = cart.map(item =>
    `- ${item.name} x ${item.quantity} = ${formatNaira(item.price * item.quantity)}`
  ).join("%0A");

  const message =
    `Hello Biserry Groceries,%0A%0A` +
    `I want to place an order.%0A%0A` +
    `Name: ${name}%0A` +
    `Phone: ${phone}%0A` +
    `Order Type: ${fulfillment}%0A` +
    `Payment Method: ${paymentMethod}%0A` +
    `Address/Note: ${address}%0A%0A` +
    `Items:%0A${orderList}%0A%0A` +
    `Total: ${formatNaira(getCartTotal())}`;

  window.open(`https://wa.me/2348100584211?text=${message}`, "_blank");
});

renderProducts();
renderCart();
