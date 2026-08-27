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
const brandInput=document.getElementById("brand"), packSizeInput=document.getElementById("packSize"), costPriceInput=document.getElementById("costPrice"), searchAliasesInput=document.getElementById("searchAliases");
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
const productStatusFilter = document.getElementById("productStatusFilter");
const productImageFilter = document.getElementById("productImageFilter");
const productQualityFilter = document.getElementById("productQualityFilter");
const productStockFilter = document.getElementById("productStockFilter");
const productCategoryFilter = document.getElementById("productCategoryFilter");
const productPriceFilter=document.getElementById("productPriceFilter");
const productFilterBanner = document.getElementById("productFilterBanner");
const productFilterLabel = document.getElementById("productFilterLabel");
const clearProductFilterBtn = document.getElementById("clearProductFilterBtn");
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
const activateReadyProductsBtn = document.getElementById("activateReadyProductsBtn");
const analyseCatalogueBtn = document.getElementById("analyseCatalogueBtn");
const productSelectAllCheckbox = document.getElementById("productSelectAllCheckbox");
const productVisibilitySummary = document.getElementById("productVisibilitySummary");
let selectedProductIds = new Set();
const PRODUCT_PAGE_SIZE = 50;
let currentProductPage = 1;
let currentProductView = [];
let totalProductCount = 0;
let activeProductCount = 0;
let inactiveProductCount = 0;
let currentStatusFilter = "all";
let currentImageFilter = "all";
let currentQualityFilter = "all";
let currentStockFilter = "all";
let currentCategoryFilter = "all";
let currentPriceFilter = "all";
let currentCombinedFilterCount = null;
const pageEndCursors = new Map();
let adminSearchTimer = null;
const productPager = document.getElementById("productPager");
const previousProductPageBtn = document.getElementById("previousProductPageBtn");
const nextProductPageBtn = document.getElementById("nextProductPageBtn");
const productPageSummary = document.getElementById("productPageSummary");


const PLACEHOLDER_IMAGE_PATTERNS = [
  "assets/logo.png","../assets/logo.png","assets/rice.jpg","assets/vegetable-oil.jpg",
  "assets/tomato-paste.jpg","assets/fresh-vegetables.jpg","assets/beverages.jpg","assets/household.jpg"
];
function imageQuality(product){
  const image=String(product?.imageUrl || product?.variants?.[0]?.imageUrl || "").trim().toLowerCase();
  if(!image) return "missing";
  if(PLACEHOLDER_IMAGE_PATTERNS.some(x=>image.includes(x.replace("../","")))) return "placeholder";
  if(image.includes("logo.png") || image.includes("placeholder")) return "placeholder";
  return "real";
}
function stockQuality(product){
  const stock=product?.hasVariants ? (product.variants||[]).reduce((s,v)=>s+Number(v.stock||0),0) : Number(product?.stock||0);
  const low=Number(product?.lowStockThreshold||5);
  if(stock<=0) return "out";
  if(stock<=low) return "low";
  return "in";
}
function priceQuality(product){
  const prices=product?.hasVariants ? (product.variants||[]).map(v=>Number(v.price||0)) : [Number(product?.price||0)];
  return prices.length && prices.every(v=>v>0) ? "priced" : "missing";
}
function catalogueQuality(product){
  const imageStatus=imageQuality(product), stockStatus=stockQuality(product), priceStatus=priceQuality(product);
  let score=0;
  if(String(product?.name||"").trim()) score+=20;
  if(String(product?.category||"").trim()) score+=10;
  if(priceStatus==="priced") score+=20;
  if(stockStatus!=="out") score+=15;
  if(imageStatus==="real") score+=25; else if(imageStatus==="placeholder") score+=5;
  if(String(product?.sku||product?.barcode||"").trim()) score+=5;
  if(String(product?.description||product?.productNote||"").trim()) score+=5;
  const ready=Boolean(String(product?.name||"").trim() && String(product?.category||"").trim() && priceStatus==="priced" && stockStatus!=="out" && imageStatus==="real");
  return {imageStatus,stockStatus,priceStatus,qualityScore:score,qualityStatus:ready?"ready":"review",readyToActivate:ready};
}
async function audit(action,details={}){
  try{await addDoc(collection(db,"audit_logs"),{action,details,createdAt:serverTimestamp()});}catch(e){console.warn("Audit log skipped",e.message)}
}
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

function hasCombinedFilters(){ return currentImageFilter!=="all" || currentQualityFilter!=="all" || currentStockFilter!=="all" || currentCategoryFilter!=="all" || currentPriceFilter!=="all"; }
function getFilteredProductCount() {
  if(currentCombinedFilterCount!==null) return currentCombinedFilterCount;
  if (currentStatusFilter === "active") return activeProductCount;
  if (currentStatusFilter === "inactive") return inactiveProductCount;
  return totalProductCount;
}

function getFilterDisplayName() {
  const labels=[];
  if(currentStatusFilter!=="all") labels.push(currentStatusFilter);
  if(currentImageFilter!=="all") labels.push(`${currentImageFilter} image`);
  if(currentQualityFilter!=="all") labels.push(currentQualityFilter==="ready"?"ready to activate":"needs review");
  if(currentStockFilter!=="all") labels.push(`${currentStockFilter} stock`);
  if(currentCategoryFilter!=="all") labels.push(currentCategoryFilter);
  if(currentPriceFilter!=="all") labels.push(currentPriceFilter==="priced"?"has price":"missing price");
  return labels.length?labels.join(" • "):"all products";
}

function updateFilterBanner() {
  const count = getFilteredProductCount();
  if (productFilterLabel) {
    productFilterLabel.textContent = `Showing ${count.toLocaleString()} ${getFilterDisplayName()}`;
  }
  if (clearProductFilterBtn) {
    clearProductFilterBtn.style.display = (currentStatusFilter === "all" && !hasCombinedFilters()) ? "none" : "inline-flex";
  }
}

function renderProductPager() {
  const filteredCount = getFilteredProductCount();
  const pageCount = Math.max(1, Math.ceil(filteredCount / PRODUCT_PAGE_SIZE));
  if (productPager) productPager.style.display = filteredCount > PRODUCT_PAGE_SIZE ? "flex" : "none";
  if (productPageSummary) {
    const start = filteredCount ? ((currentProductPage - 1) * PRODUCT_PAGE_SIZE) + 1 : 0;
    const finish = Math.min(filteredCount, start + Math.max(0, currentProductView.length - 1));
    productPageSummary.textContent = `${start.toLocaleString()}–${finish.toLocaleString()} of ${filteredCount.toLocaleString()} ${getFilterDisplayName()}`;
  }
  if (previousProductPageBtn) previousProductPageBtn.disabled = currentProductPage <= 1;
  if (nextProductPageBtn) nextProductPageBtn.disabled = currentProductPage >= pageCount || currentProductView.length < PRODUCT_PAGE_SIZE;
  updateFilterBanner();
}

function renderProductsTable(products) {
  currentProductView = products;
  if (!products.length) {
    productsTable.innerHTML = `<tr><td colspan="11"><div class="emptyState">No products match these filters on this page.</div></td></tr>`;
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
        <td><strong>${product.name || "Unnamed product"}</strong>${product.brand?`<br><small>${product.brand}${product.packSize?` • ${product.packSize}`:""}</small>`:""}${Number(product.costPrice||0)>0&&!isOptionProduct?`<br><small>Margin: ${Math.round(((Number(product.price||0)-Number(product.costPrice||0))/Math.max(1,Number(product.price||0)))*100)}%</small>`:""}${skuText}${product.isFeatured ? "<br><span class='statusBadge'>Featured</span>" : ""}</td>
        <td>${optionLabel}</td><td>${product.category || ""}</td><td>${priceDisplay}</td><td>${totalStock}</td>
        <td><span class="qualityPill image-${(product.imageStatus||imageQuality(product))}">${(product.imageStatus||imageQuality(product)) === "real" ? "Real image" : (product.imageStatus||imageQuality(product)) === "missing" ? "No image" : "Placeholder"}</span></td>
        <td><span class="qualityPill ${(product.qualityStatus||catalogueQuality(product).qualityStatus)}">${product.qualityScore ?? catalogueQuality(product).qualityScore}% • ${(product.qualityStatus||catalogueQuality(product).qualityStatus)==="ready"?"Ready":"Review"}</span></td>
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
    const [totalSnap, activeSnap, inactiveSnap] = await Promise.all([
      getCountFromServer(base),
      getCountFromServer(query(base, where("isActive", "==", true))),
      getCountFromServer(query(base, where("isActive", "==", false)))
    ]);
    totalProductCount = totalSnap.data().count;
    activeProductCount = activeSnap.data().count;
    inactiveProductCount = inactiveSnap.data().count;
  } catch (e) {
    console.warn("Count refresh failed", e);
  }
}

function updateVisibilitySummary() {
  if (productVisibilitySummary) {
    productVisibilitySummary.textContent = `${totalProductCount.toLocaleString()} total • ${activeProductCount.toLocaleString()} active • ${inactiveProductCount.toLocaleString()} inactive • ${selectedProductIds.size.toLocaleString()} selected • filter: ${getFilterDisplayName()} • only ${PRODUCT_PAGE_SIZE} products are downloaded per page`;
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
    await audit(isActive?"products_activated":"products_deactivated",{count:ids.length});
    await refreshCounts();
    const filteredCount = getFilteredProductCount();
    const maxPage = Math.max(1, Math.ceil(filteredCount / PRODUCT_PAGE_SIZE));
    if (currentProductPage > maxPage) currentProductPage = maxPage;
    pageEndCursors.clear();
    await loadProducts(1);
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

function buildCatalogueConstraints(){
  const c=[];
  if(currentStatusFilter==="active") c.push(where("isActive","==",true));
  if(currentStatusFilter==="inactive") c.push(where("isActive","==",false));
  if(currentImageFilter!=="all") c.push(where("imageStatus","==",currentImageFilter));
  if(currentQualityFilter!=="all") c.push(where("qualityStatus","==",currentQualityFilter));
  if(currentStockFilter!=="all") c.push(where("stockStatus","==",currentStockFilter));
  if(currentCategoryFilter!=="all") c.push(where("category","==",currentCategoryFilter));
  if(currentPriceFilter!=="all") c.push(where("priceStatus","==",currentPriceFilter));
  return c;
}
async function refreshCombinedFilterCount(){
  if(!hasCombinedFilters()){currentCombinedFilterCount=null;return;}
  try{currentCombinedFilterCount=(await getCountFromServer(query(collection(db,"products"),...buildCatalogueConstraints()))).data().count;}catch(e){console.warn("Combined count failed",e);currentCombinedFilterCount=null;}
}
async function analyseCatalogue(){
  if(!confirm("Analyze the full catalogue now? This reads each product once and writes lightweight quality metadata once. With ~1,300 products this is normally within the Spark daily quota, but do not run it repeatedly.")) return;
  analyseCatalogueBtn.disabled=true; analyseCatalogueBtn.textContent="Analyzing…";
  try{
    const snap=await getDocs(collection(db,"products")); const docs=snap.docs;
    for(let i=0;i<docs.length;i+=400){
      const batch=writeBatch(db);
      docs.slice(i,i+400).forEach(d=>{const q=catalogueQuality(d.data());batch.update(d.ref,{...q,qualityAnalyzedAt:serverTimestamp(),updatedAt:serverTimestamp()});});
      await batch.commit();
    }
    await audit("catalogue_quality_analysis",{products:docs.length});
    pageEndCursors.clear(); await refreshCounts(); await refreshCombinedFilterCount(); await loadProducts(1);
    alert(`Catalogue analysis complete for ${docs.length.toLocaleString()} products.`);
  }catch(e){alert("Catalogue analysis failed: "+e.message)}finally{analyseCatalogueBtn.disabled=false;analyseCatalogueBtn.textContent="Analyze / Refresh Quality";}
}
async function activateReadyProducts(){
  if(!confirm("Activate every product currently marked Ready to Activate? Products still needing review will remain inactive.")) return;
  try{const snap=await getDocs(query(collection(db,"products"),where("readyToActivate","==",true)));const ids=snap.docs.filter(d=>d.data().isActive!==true).map(d=>d.id);if(!ids.length)return alert("No inactive Ready products found. Run Analyze / Refresh Quality if needed.");await setManyProductsActive(ids,true,"Ready catalogue");await audit("activate_ready_products",{count:ids.length});}catch(e){alert("Could not activate ready products: "+e.message)}
}
async function loadProducts(page = 1) {
  productsTable.innerHTML = `<tr><td colspan="11"><div class="emptyState">Loading up to ${PRODUCT_PAGE_SIZE} ${getFilterDisplayName()}…</div></td></tr>`;
  if (!totalProductCount) await refreshCounts();

  const base = collection(db, "products");
  const constraints = buildCatalogueConstraints();

  // Only use name ordering when no filters are active, avoiding unnecessary composite indexes.
  if (currentStatusFilter === "all" && !hasCombinedFilters()) constraints.push(orderBy("name"));

  if (page > 1) {
    const previousCursor = pageEndCursors.get(page - 1);
    if (!previousCursor) return;
    constraints.push(startAfter(previousCursor));
  }
  constraints.push(limit(PRODUCT_PAGE_SIZE));

  const snap = await getDocs(query(base, ...constraints));
  allProducts = snap.docs.map(docSnap => ({ id: docSnap.id, product: docSnap.data() }));

  // Filtered Firestore pages are sorted client-side to keep the UI tidy without
  // requiring a paid service or a new composite index.
  if (currentStatusFilter !== "all" || hasCombinedFilters()) {
    allProducts.sort((a, b) => (a.product.name || "").localeCompare(b.product.name || ""));
  }

  currentProductPage = page;
  if (snap.docs.length) pageEndCursors.set(page, snap.docs[snap.docs.length - 1]);
  renderCurrentProducts();
}

async function applyCatalogueFilters() {
  currentStatusFilter = productStatusFilter?.value || "all";
  currentImageFilter = productImageFilter?.value || "all";
  currentQualityFilter = productQualityFilter?.value || "all";
  currentStockFilter = productStockFilter?.value || "all";
  currentCategoryFilter = productCategoryFilter?.value || "all";
  currentPriceFilter = productPriceFilter?.value || "all";
  currentProductPage=1; pageEndCursors.clear(); selectedProductIds.clear(); currentCombinedFilterCount=null;
  if(adminProductSearch) adminProductSearch.value="";
  await refreshCombinedFilterCount(); updateFilterBanner(); await loadProducts(1);
}

adminProductSearch?.addEventListener("input", () => {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(renderCurrentProducts, 150);
});
[productStatusFilter,productImageFilter,productQualityFilter,productStockFilter,productCategoryFilter,productPriceFilter].forEach(el=>el?.addEventListener("change",()=>{applyCatalogueFilters().catch(error=>alert(`Could not filter products: ${error.message}`));}));
clearProductFilterBtn?.addEventListener("click",()=>{
  [productStatusFilter,productImageFilter,productQualityFilter,productStockFilter,productCategoryFilter,productPriceFilter].forEach(el=>{if(el)el.value="all";});
  applyCatalogueFilters().catch(error=>alert(`Could not clear product filters: ${error.message}`));
});
analyseCatalogueBtn?.addEventListener("click",analyseCatalogue);
activateReadyProductsBtn?.addEventListener("click",activateReadyProducts);
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
    brand: brandInput?.value.trim()||"", packSize: packSizeInput?.value.trim()||"", costPrice:Number(costPriceInput?.value||0), searchAliases:(searchAliasesInput?.value||"").split(",").map(x=>x.trim()).filter(Boolean),
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

  productData = {...productData, ...catalogueQuality(productData)};
  try {
    if (editingId) {
      await updateDoc(doc(db, "products", editingId), productData);
      await audit("product_updated",{productId:editingId,name:productData.name});
      alert("Product updated.");
    } else {
      await addDoc(collection(db, "products"), {
        ...productData,
        createdAt: serverTimestamp()
      });
      await audit("product_created",{name:productData.name});
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
  if(brandInput)brandInput.value=product.brand||"";if(packSizeInput)packSizeInput.value=product.packSize||"";if(costPriceInput)costPriceInput.value=product.costPrice||0;if(searchAliasesInput)searchAliasesInput.value=(product.searchAliases||[]).join(", ");
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
