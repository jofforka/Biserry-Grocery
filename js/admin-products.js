import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "./firebase-service.js";

import { uploadImageToGoogleDrive } from "./google-drive-upload.js";

protectAdminPage();

let editingId = null;
let editingImageUrl = "";
let variants = [];
let allProducts = [];

const form = document.getElementById("productForm");
const nameInput = document.getElementById("name");
const categoryInput = document.getElementById("category");
const skuInput = document.getElementById("sku");
const productTypeInput = document.getElementById("productType");
const priceInput = document.getElementById("price");
const stockInput = document.getElementById("stock");
const lowStockInput = document.getElementById("lowStockThreshold");
const isFeaturedInput = document.getElementById("isFeatured");
const isActiveInput = document.getElementById("isActive");
const productNoteInput = document.getElementById("productNote");
const imageFileInput = document.getElementById("imageFile");
const imageUrlInput = document.getElementById("imageUrl");
const productsTable = document.getElementById("productsTable");
const adminProductSearch = document.getElementById("adminProductSearch");
const formTitle = document.getElementById("formTitle");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const singleProductFields = document.getElementById("singleProductFields");
const variantProductFields = document.getElementById("variantProductFields");
const variantRows = document.getElementById("variantRows");
const addVariantBtn = document.getElementById("addVariantBtn");
const variantSectionTitle = document.getElementById("variantSectionTitle");
const variantSectionHelp = document.getElementById("variantSectionHelp");
const selectAllProductsBtn = document.getElementById("selectAllProductsBtn");
const clearProductSelectionBtn = document.getElementById("clearProductSelectionBtn");
const activateSelectedBtn = document.getElementById("activateSelectedBtn");
const deactivateSelectedBtn = document.getElementById("deactivateSelectedBtn");
const activateAllProductsBtn = document.getElementById("activateAllProductsBtn");
const deactivateAllProductsBtn = document.getElementById("deactivateAllProductsBtn");
const productSelectAllCheckbox = document.getElementById("productSelectAllCheckbox");
const productVisibilitySummary = document.getElementById("productVisibilitySummary");
let selectedProductIds = new Set();
const PRODUCT_PAGE_SIZE = 50;
let currentProductPage = 1;
let currentProductView = [];
let totalProductCount = 0;
let activeProductCount = 0;
let inactiveProductCount = 0;
const pageEndCursors = new Map();
let adminSearchTimer = null;
const productPager = document.getElementById("productPager");
const previousProductPageBtn = document.getElementById("previousProductPageBtn");
const nextProductPageBtn = document.getElementById("nextProductPageBtn");
const productPageSummary = document.getElementById("productPageSummary");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function makeVariantId() {
  return "v-" + Date.now() + "-" + Math.floor(Math.random() * 99999);
}

function getVariantLabel() {
  if (productTypeInput.value === "sizes") return "Size";
  if (productTypeInput.value === "varieties") return "Variety";
  return "Option";
}

function getVariantPlaceholder() {
  if (productTypeInput.value === "sizes") return "e.g. Small, Medium, Large, 500g, 1kg";
  if (productTypeInput.value === "varieties") return "e.g. Colgate, Close-Up, Strawberry";
  return "Option name";
}

function toggleProductType() {
  const productType = productTypeInput.value;
  const hasOptions = productType === "sizes" || productType === "varieties";
  const label = getVariantLabel();

  singleProductFields.style.display = hasOptions ? "none" : "block";
  variantProductFields.style.display = hasOptions ? "block" : "none";

  variantSectionTitle.textContent = productType === "sizes"
    ? "Product Sizes"
    : productType === "varieties"
      ? "Product Varieties"
      : "Product Options";

  variantSectionHelp.textContent = productType === "sizes"
    ? "Example: Goldimo → Small, Medium, Large. Each size can have a different SKU, price, stock and image."
    : productType === "varieties"
      ? "Example: Toothpaste → Colgate, Close-Up, Oral-B. Each variety can have a different SKU, price, stock and image."
      : "Add each option with its own SKU, price, stock and image.";

  addVariantBtn.textContent = "Add " + label;
  renderVariantRows();
}

function renderVariantRows() {
  const label = getVariantLabel();

  if (!variants.length) {
    variantRows.innerHTML = `<div class="emptyState">No ${label.toLowerCase()} added yet.</div>`;
    return;
  }

  variantRows.innerHTML = variants.map((variant, index) => `
    <div class="variantRow upgradedVariantRow">
      <div>
        <label>${label} Name</label>
        <input value="${variant.name || ""}" onchange="updateVariant(${index}, 'name', this.value)" placeholder="${getVariantPlaceholder()}">
      </div>

      <div>
        <label>${label} SKU / Barcode</label>
        <input value="${variant.sku || ""}" onchange="updateVariant(${index}, 'sku', this.value)" placeholder="Optional">
      </div>

      <div>
        <label>Price</label>
        <input type="number" value="${variant.price || 0}" onchange="updateVariant(${index}, 'price', this.value)" placeholder="Price">
      </div>

      <div>
        <label>Stock</label>
        <input type="number" value="${variant.stock || 0}" onchange="updateVariant(${index}, 'stock', this.value)" placeholder="Stock">
      </div>

      <div>
        <label>${label} Image Upload</label>
        <input type="file" accept="image/*" onchange="setVariantImageFile(${index}, this.files[0])">
      </div>

      <div>
        <label>Image URL / Asset Path</label>
        <input value="${variant.imageUrl || ""}" onchange="updateVariant(${index}, 'imageUrl', this.value)" placeholder="assets/product.jpg">
      </div>

      <div class="variantPreviewCell">
        <label>Preview</label>
        <img src="${variant.imageUrl || "../assets/logo.png"}" alt="${variant.name || label}">
      </div>

      <div class="variantActions"><button class="duplicateVariantBtn" type="button" onclick="duplicateVariant(${index})">Duplicate</button><button class="removeVariantBtn" type="button" onclick="removeVariant(${index})">Remove</button></div>
    </div>
  `).join("");
}

window.updateVariant = function(index, field, value) {
  if (!variants[index]) return;

  variants[index][field] = field === "price" || field === "stock"
    ? Number(value)
    : value;
};

window.setVariantImageFile = function(index, file) {
  if (!variants[index]) return;
  variants[index].imageFile = file || null;
};

window.duplicateVariant = function(index) {
  const original = variants[index];
  if (!original) return;

  variants.splice(index + 1, 0, {
    ...original,
    id: makeVariantId(),
    name: `${original.name || "Option"} Copy`,
    sku: original.sku ? `${original.sku}-COPY` : "",
    imageFile: null
  });

  renderVariantRows();
};

window.removeVariant = function(index) {
  variants.splice(index, 1);
  renderVariantRows();
};

addVariantBtn.addEventListener("click", () => {
  variants.push({
    id: makeVariantId(),
    name: "",
    sku: "",
    price: 0,
    stock: 0,
    imageUrl: "",
    imageFile: null
  });

  renderVariantRows();
});

productTypeInput.addEventListener("change", toggleProductType);

async function uploadImage(file) {
  if (!file) return "";
  return await uploadImageToGoogleDrive(file);
}

async function prepareVariantsForSave() {
  const cleaned = [];

  for (const variant of variants) {
    let imageUrl = variant.imageUrl || "assets/logo.png";

    if (variant.imageFile) {
      imageUrl = await uploadImage(variant.imageFile);
    }

    cleaned.push({
      id: variant.id || makeVariantId(),
      name: variant.name,
      sku: variant.sku || "",
      price: Number(variant.price || 0),
      stock: Number(variant.stock || 0),
      imageUrl
    });
  }

  return cleaned;
}

function resetForm() {
  form.reset();

  editingId = null;
  editingImageUrl = "";
  variants = [];

  formTitle.textContent = "Add Product";
  saveBtn.textContent = "Save Product";

  productTypeInput.value = "single";
  lowStockInput.value = 5;
  if (isFeaturedInput) isFeaturedInput.value = "false";
  if (isActiveInput) isActiveInput.value = "false";

  toggleProductType();
}

function productTypeFromProduct(product) {
  if (product.optionType === "sizes") return "sizes";
  if (product.optionType === "varieties") return "varieties";
  if (product.variantLabel === "Size") return "sizes";
  if (product.variantLabel === "Variety") return "varieties";
  if (product.hasVariants) return "varieties";
  return "single";
}

function isProductActive(product) {
  return product?.isActive === true;
}

function getCurrentFilteredProducts() {
  const term = adminProductSearch?.value.trim().toLowerCase() || "";
  return term
    ? allProducts.filter(item => productMatchesSearch(item.product, term))
    : allProducts;
}

function renderProductPager() {
  const pageCount = Math.max(1, Math.ceil(totalProductCount / PRODUCT_PAGE_SIZE));
  if (productPager) productPager.style.display = totalProductCount > PRODUCT_PAGE_SIZE ? "flex" : "none";
  if (productPageSummary) {
    const start = totalProductCount ? ((currentProductPage - 1) * PRODUCT_PAGE_SIZE) + 1 : 0;
    const finish = Math.min(totalProductCount, start + Math.max(0, currentProductView.length - 1));
    productPageSummary.textContent = `${start.toLocaleString()}–${finish.toLocaleString()} of ${totalProductCount.toLocaleString()} products`;
  }
  if (previousProductPageBtn) previousProductPageBtn.disabled = currentProductPage <= 1;
  if (nextProductPageBtn) nextProductPageBtn.disabled = currentProductPage >= pageCount || currentProductView.length < PRODUCT_PAGE_SIZE;
}

function renderProductsTable(products) {
  currentProductView = products;
  if (!products.length) {
    productsTable.innerHTML = `<tr><td colspan="9"><div class="emptyState">No products found on this page.</div></td></tr>`;
    renderProductPager();
    updateVisibilitySummary();
    return;
  }

  productsTable.innerHTML = products.map(({ id, product }) => {
    const productType = productTypeFromProduct(product);
    const isOptionProduct = productType === "sizes" || productType === "varieties";
    const optionLabel = productType === "sizes" ? "Sizes" : productType === "varieties" ? "Varieties" : "Single";
    const totalStock = isOptionProduct
      ? (product.variants || []).reduce((sum, item) => sum + Number(item.stock || 0), 0)
      : Number(product.stock || 0);
    const priceDisplay = isOptionProduct
      ? `${(product.variants || []).length} ${optionLabel.toLowerCase()}`
      : formatNaira(Number(product.price || 0));
    const image = product.imageUrl || product.variants?.[0]?.imageUrl || "../assets/logo.png";
    const skuText = product.sku ? `<br><small>SKU: ${product.sku}</small>` : "";
    const active = isProductActive(product);

    return `
      <tr>
        <td style="text-align:center;"><input class="productSelectionCheck" type="checkbox" data-product-id="${id}" ${selectedProductIds.has(id) ? "checked" : ""}></td>
        <td><img class="adminProductThumb" loading="lazy" decoding="async" src="${image}" alt="${product.name || "Product"}" onerror="this.src='../assets/logo.png'" style="width:56px;height:56px;object-fit:contain;border-radius:12px;border:1px solid #e9ddc3;padding:4px;background:#fff;display:block;"></td>
        <td><strong>${product.name || "Unnamed product"}</strong>${skuText}${product.isFeatured ? "<br><span class='statusBadge'>Featured</span>" : ""}</td>
        <td>${optionLabel}</td><td>${product.category || ""}</td><td>${priceDisplay}</td><td>${totalStock}</td>
        <td><span class="statusBadge" style="background:${active ? "#e6f5ea" : "#f4e7e7"};color:${active ? "#176b37" : "#8b2d2d"};">${active ? "Active" : "Inactive"}</span></td>
        <td><div class="actionBtns">
          <button class="${active ? "duplicateBtn" : "editBtn"}" onclick="setProductActive('${id}', ${active ? "false" : "true"})">${active ? "Deactivate" : "Activate"}</button>
          <button class="editBtn" onclick="editProduct('${id}', '${encodeURIComponent(JSON.stringify(product))}')">Edit</button>
          <button class="duplicateBtn" onclick="duplicateProduct('${id}', '${encodeURIComponent(JSON.stringify(product))}')">Duplicate</button>
          <button class="deleteBtn" onclick="deleteProduct('${id}')">Delete</button>
        </div></td>
      </tr>`;
  }).join("");

  document.querySelectorAll(".productSelectionCheck").forEach(input => input.addEventListener("change", event => {
    const id = event.target.dataset.productId;
    if (event.target.checked) selectedProductIds.add(id); else selectedProductIds.delete(id);
    updateVisibilitySummary();
  }));
  renderProductPager();
  updateVisibilitySummary();
}

function renderCurrentProducts() {
  const term = adminProductSearch?.value.trim().toLowerCase() || "";
  renderProductsTable(term ? allProducts.filter(item => productMatchesSearch(item.product, term)) : allProducts);
}

async function refreshCounts() {
  try {
    const base = collection(db, "products");
    const [totalSnap, activeSnap] = await Promise.all([
      getCountFromServer(base),
      getCountFromServer(query(base, where("isActive", "==", true)))
    ]);
    totalProductCount = totalSnap.data().count;
    activeProductCount = activeSnap.data().count;
    inactiveProductCount = Math.max(0, totalProductCount - activeProductCount);
  } catch (e) {
    console.warn("Count refresh failed", e);
  }
}

function updateVisibilitySummary() {
  if (productVisibilitySummary) {
    productVisibilitySummary.textContent = `${totalProductCount.toLocaleString()} total • ${activeProductCount.toLocaleString()} active • ${inactiveProductCount.toLocaleString()} inactive • ${selectedProductIds.size.toLocaleString()} selected • only ${PRODUCT_PAGE_SIZE} products are downloaded per page`;
  }
  if (productSelectAllCheckbox) {
    productSelectAllCheckbox.checked = allProducts.length > 0 && allProducts.every(item => selectedProductIds.has(item.id));
    productSelectAllCheckbox.indeterminate = allProducts.some(item => selectedProductIds.has(item.id)) && !productSelectAllCheckbox.checked;
  }
}

async function setManyProductsActive(ids, isActive, label) {
  if (!ids.length) { alert("Please select at least one product."); return; }
  const action = isActive ? "activate" : "deactivate";
  if (!confirm(`${label}: ${action} ${ids.length.toLocaleString()} product(s)?`)) return;
  const controls = [activateSelectedBtn, deactivateSelectedBtn, activateAllProductsBtn, deactivateAllProductsBtn].filter(Boolean);
  controls.forEach(btn => btn.disabled = true);
  try {
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(db);
      ids.slice(i, i + chunkSize).forEach(id => batch.update(doc(db, "products", id), { isActive, visibilityUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await batch.commit();
    }
    selectedProductIds.clear();
    await refreshCounts();
    await loadProducts(currentProductPage);
    alert(`${ids.length.toLocaleString()} product(s) ${isActive ? "activated" : "deactivated"}.`);
  } catch (error) {
    alert(`Could not ${action} products: ${error.message}`);
  } finally { controls.forEach(btn => btn.disabled = false); }
}

async function setAllProductsActive(isActive) {
  const action = isActive ? "activate" : "deactivate";
  const expected = totalProductCount || 0;
  if (!confirm(`${action === "activate" ? "Activate" : "Deactivate"} ALL ${expected.toLocaleString()} products? This operation reads the catalogue once and writes each product once.`)) return;
  try {
    if (productVisibilitySummary) productVisibilitySummary.textContent = `Preparing to ${action} all products…`;
    const snap = await getDocs(collection(db, "products"));
    await setManyProductsActive(snap.docs.map(d => d.id), isActive, "ALL products");
  } catch (e) { alert(`Could not ${action} all products: ${e.message}`); }
}

window.setProductActive = async function(id, isActive) { await setManyProductsActive([id], isActive, "Product visibility"); };

function productMatchesSearch(product, term) {
  const variantsText = (product.variants || []).map(v => `${v.name || ""} ${v.sku || ""}`).join(" ");
  return `${product.name || ""} ${product.sku || ""} ${product.barcode || ""} ${product.brand || ""} ${product.category || ""} ${product.productNote || ""} ${variantsText}`.toLowerCase().includes(term);
}

async function loadProducts(page = 1) {
  productsTable.innerHTML = `<tr><td colspan="9"><div class="emptyState">Loading up to ${PRODUCT_PAGE_SIZE} products…</div></td></tr>`;
  if (!totalProductCount) await refreshCounts();
  const base = collection(db, "products");
  let q;
  if (page <= 1) {
    q = query(base, orderBy("name"), limit(PRODUCT_PAGE_SIZE));
  } else {
    const previousCursor = pageEndCursors.get(page - 1);
    if (!previousCursor) return;
    q = query(base, orderBy("name"), startAfter(previousCursor), limit(PRODUCT_PAGE_SIZE));
  }
  const snap = await getDocs(q);
  allProducts = snap.docs.map(docSnap => ({ id: docSnap.id, product: docSnap.data() }));
  currentProductPage = page;
  if (snap.docs.length) pageEndCursors.set(page, snap.docs[snap.docs.length - 1]);
  renderCurrentProducts();
}

adminProductSearch?.addEventListener("input", () => {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(renderCurrentProducts, 150);
});
previousProductPageBtn?.addEventListener("click", async () => { if (currentProductPage > 1) await loadProducts(currentProductPage - 1); });
nextProductPageBtn?.addEventListener("click", async () => { await loadProducts(currentProductPage + 1); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productType = productTypeInput.value;
  const hasOptions = productType === "sizes" || productType === "varieties";
  const variantLabel = productType === "sizes" ? "Size" : productType === "varieties" ? "Variety" : "";

  let imageUrl = imageUrlInput?.value.trim() || editingImageUrl || "assets/logo.png";

  if (!hasOptions && imageFileInput.files[0]) {
    imageUrl = await uploadImage(imageFileInput.files[0]);
  }

  let productData = {
    name: nameInput.value.trim(),
    category: categoryInput.value,
    sku: skuInput ? skuInput.value.trim() : "",
    productType,
    optionType: hasOptions ? productType : "",
    variantLabel,
    hasVariants: hasOptions,
    lowStockThreshold: Number(lowStockInput.value || 5),
    isFeatured: isFeaturedInput ? isFeaturedInput.value === "true" : false,
    isActive: isActiveInput ? isActiveInput.value === "true" : false,
    productNote: productNoteInput ? productNoteInput.value.trim() : "",
    updatedAt: serverTimestamp()
  };

  if (hasOptions) {
    if (!variants.length) {
      alert(`Please add at least one ${variantLabel.toLowerCase()}.`);
      return;
    }

    const cleanedVariants = await prepareVariantsForSave();
    const invalidVariant = cleanedVariants.find(item => !item.name || Number(item.price || 0) <= 0);

    if (invalidVariant) {
      alert(`Each ${variantLabel.toLowerCase()} needs a name and price.`);
      return;
    }

    productData = {
      ...productData,
      variants: cleanedVariants,
      imageUrl: cleanedVariants[0]?.imageUrl || "assets/logo.png",
      price: Number(cleanedVariants[0]?.price || 0),
      stock: cleanedVariants.reduce((sum, item) => sum + Number(item.stock || 0), 0)
    };
  } else {
    productData = {
      ...productData,
      variants: [],
      imageUrl,
      price: Number(priceInput.value || 0),
      stock: Number(stockInput.value || 0)
    };
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, "products", editingId), productData);
      alert("Product updated.");
    } else {
      await addDoc(collection(db, "products"), {
        ...productData,
        createdAt: serverTimestamp()
      });
      alert("Product added.");
    }

    resetForm();
    loadProducts();
  } catch (error) {
    alert("Product save failed: " + error.message);
  }
});

window.editProduct = function(id, encodedProduct) {
  const product = JSON.parse(decodeURIComponent(encodedProduct));
  const productType = productTypeFromProduct(product);

  editingId = id;
  editingImageUrl = product.imageUrl || "";

  nameInput.value = product.name || "";
  categoryInput.value = product.category || "grains";
  if (skuInput) skuInput.value = product.sku || "";
  productTypeInput.value = productType;
  lowStockInput.value = product.lowStockThreshold || 5;

  if (isFeaturedInput) isFeaturedInput.value = product.isFeatured ? "true" : "false";
  if (isActiveInput) isActiveInput.value = product.isActive === true ? "true" : "false";
  if (productNoteInput) productNoteInput.value = product.productNote || "";

  if (productType === "single") {
    priceInput.value = product.price || 0;
    stockInput.value = product.stock || 0;
    imageUrlInput.value = product.imageUrl || "";
    variants = [];
  } else {
    variants = (product.variants || []).map(item => ({
      ...item,
      imageFile: null
    }));
  }

  toggleProductType();

  formTitle.textContent = "Edit Product";
  saveBtn.textContent = "Update Product";

  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.duplicateProduct = async function(id, encodedProduct) {
  const product = JSON.parse(decodeURIComponent(encodedProduct));

  const duplicatedVariants = (product.variants || []).map(variant => ({
    ...variant,
    id: makeVariantId(),
    sku: variant.sku ? `${variant.sku}-COPY` : ""
  }));

  const duplicatedProduct = {
    ...product,
    name: `${product.name || "Product"} Copy`,
    sku: product.sku ? `${product.sku}-COPY` : "",
    variants: duplicatedVariants,
    isFeatured: false,
    isActive: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const newDoc = await addDoc(collection(db, "products"), duplicatedProduct);

    alert("Product duplicated. The copy has been created and opened for editing.");

    await loadProducts();
    window.editProduct(newDoc.id, encodeURIComponent(JSON.stringify(duplicatedProduct)));
  } catch (error) {
    alert("Duplicate failed: " + error.message);
  }
};

window.deleteProduct = async function(id) {
  if (!confirm("Delete this product?")) return;

  try {
    await deleteDoc(doc(db, "products", id));
    alert("Product deleted.");
    loadProducts();
  } catch (error) {
    alert("Delete failed: " + error.message);
  }
};

selectAllProductsBtn?.addEventListener("click", () => {
  selectedProductIds = new Set(allProducts.map(item => item.id));
  renderCurrentProducts();
});
clearProductSelectionBtn?.addEventListener("click", () => {
  selectedProductIds.clear();
  renderCurrentProducts();
});
productSelectAllCheckbox?.addEventListener("change", event => {
  if (event.target.checked) allProducts.forEach(item => selectedProductIds.add(item.id));
  else allProducts.forEach(item => selectedProductIds.delete(item.id));
  renderCurrentProducts();
});
activateSelectedBtn?.addEventListener("click", () => setManyProductsActive([...selectedProductIds], true, "Selected products"));
deactivateSelectedBtn?.addEventListener("click", () => setManyProductsActive([...selectedProductIds], false, "Selected products"));
activateAllProductsBtn?.addEventListener("click", () => setAllProductsActive(true));
deactivateAllProductsBtn?.addEventListener("click", () => setAllProductsActive(false));

cancelBtn.addEventListener("click", resetForm);
toggleProductType();
loadProducts().catch(error => alert(error.message));
