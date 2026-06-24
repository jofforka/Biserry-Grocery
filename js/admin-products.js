import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
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

      <button type="button" onclick="removeVariant(${index})">Remove</button>
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

function renderProductsTable(products) {
  productsTable.innerHTML = "";

  products.forEach(({ id, product }) => {
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

    productsTable.innerHTML += `
      <tr>
        <td><img src="${image}" alt="${product.name}"></td>
        <td>
          <strong>${product.name}</strong>
          ${skuText}
          ${product.isFeatured ? "<br><span class='statusBadge'>Featured</span>" : ""}
        </td>
        <td>${optionLabel}</td>
        <td>${product.category || ""}</td>
        <td>${priceDisplay}</td>
        <td>${totalStock}</td>
        <td>
          <div class="actionBtns">
            <button class="editBtn" onclick="editProduct('${id}', '${encodeURIComponent(JSON.stringify(product))}')">Edit</button>
            <button class="deleteBtn" onclick="deleteProduct('${id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}

function productMatchesSearch(product, term) {
  const variantsText = (product.variants || [])
    .map(v => `${v.name || ""} ${v.sku || ""}`)
    .join(" ");

  const haystack = `
    ${product.name || ""}
    ${product.sku || ""}
    ${product.category || ""}
    ${product.productNote || ""}
    ${variantsText}
  `.toLowerCase();

  return haystack.includes(term);
}

async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));

  allProducts = snap.docs.map(docSnap => ({
    id: docSnap.id,
    product: docSnap.data()
  }));

  renderProductsTable(allProducts);
}

adminProductSearch?.addEventListener("input", () => {
  const term = adminProductSearch.value.trim().toLowerCase();

  if (!term) {
    renderProductsTable(allProducts);
    return;
  }

  renderProductsTable(allProducts.filter(item => productMatchesSearch(item.product, term)));
});

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

cancelBtn.addEventListener("click", resetForm);

toggleProductType();
loadProducts().catch(error => alert(error.message));
