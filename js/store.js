


/* ===== Product Image Modal + Gallery ===== */
let activeModalProductId = null;
let activeModalImageIndex = 0;

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
        <img id="productModalImage" src="assets/logo.png" alt="Product image">
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
          <button class="qtyBtn" type="button" onclick="decreaseProductQty(activeModalProductId); refreshProductModal()">−</button>
          <div id="productModalQty" class="qtyDisplay">1</div>
          <button class="qtyBtn" type="button" onclick="increaseProductQty(activeModalProductId); refreshProductModal()">+</button>
        </div>

        <button id="productModalAddBtn" class="btn addBtn" type="button">
          Add to Cart
        </button>
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
    dotsEl.innerHTML = images.map((_, index) => `
      <button type="button" class="${index === activeModalImageIndex ? "active" : ""}" onclick="setProductModalImage(${index})"></button>
    `).join("");
  }
}

window.openProductModal = function(productId) {
  ensureProductModal();

  activeModalProductId = productId;
  activeModalImageIndex = 0;

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
  const optionLabel = product.variantLabel || "Variety";

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
            <select onchange="selectVariant('${product.id}', this.value); activeModalImageIndex = 0; refreshProductModal();">
              ${product.variants.map(item => `
                <option value="${item.id}" ${variant?.id === item.id ? "selected" : ""}>
                  ${item.name} — ${formatNaira(Number(item.price || 0))}
                </option>
              `).join("")}
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
