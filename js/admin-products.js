import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  storage,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL
} from "./firebase-service.js";

protectAdminPage();

let editingId = null;
let editingImageUrl = "";

const form = document.getElementById("productForm");
const productId = document.getElementById("productId");
const nameInput = document.getElementById("name");
const categoryInput = document.getElementById("category");
const priceInput = document.getElementById("price");
const stockInput = document.getElementById("stock");
const lowStockInput = document.getElementById("lowStockThreshold");
const imageFileInput = document.getElementById("imageFile");
const imageUrlInput = document.getElementById("imageUrl");
const productsTable = document.getElementById("productsTable");
const formTitle = document.getElementById("formTitle");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

function formatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function uploadImage(file) {
  if (!file) return "";

  const imageRef = ref(storage, `product-images/${Date.now()}-${file.name}`);
  await uploadBytes(imageRef, file);
  return await getDownloadURL(imageRef);
}

function resetForm() {
  form.reset();
  editingId = null;
  editingImageUrl = "";
  productId.value = "";
  formTitle.textContent = "Add Product";
  saveBtn.textContent = "Save Product";
}

async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  productsTable.innerHTML = "";

  snap.forEach(docSnap => {
    const p = docSnap.data();
    const low = Number(p.stock || 0) <= Number(p.lowStockThreshold || 5);

    productsTable.innerHTML += `
      <tr>
        <td><img src="${p.imageUrl || "assets/logo.png"}" alt="${p.name}"></td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${formatNaira(Number(p.price))}</td>
        <td style="color:${low ? "#9f1d1d" : "inherit"};font-weight:${low ? "900" : "400"}">${p.stock}</td>
        <td>
          <div class="actionBtns">
            <button class="editBtn" onclick="editProduct('${docSnap.id}', '${encodeURIComponent(JSON.stringify(p))}')">Edit</button>
            <button class="deleteBtn" onclick="deleteProduct('${docSnap.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  let imageUrl = imageUrlInput.value.trim() || editingImageUrl || "assets/logo.png";

  if (imageFileInput.files[0]) {
    imageUrl = await uploadImage(imageFileInput.files[0]);
  }

  const data = {
    name: nameInput.value.trim(),
    category: categoryInput.value,
    price: Number(priceInput.value),
    stock: Number(stockInput.value),
    lowStockThreshold: Number(lowStockInput.value || 5),
    imageUrl,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingId) {
      await updateDoc(doc(db, "products", editingId), data);
      alert("Product updated.");
    } else {
      await addDoc(collection(db, "products"), {
        ...data,
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

  editingId = id;
  editingImageUrl = product.imageUrl || "";
  productId.value = id;
  nameInput.value = product.name || "";
  categoryInput.value = product.category || "grains";
  priceInput.value = product.price || 0;
  stockInput.value = product.stock || 0;
  lowStockInput.value = product.lowStockThreshold || 5;
  imageUrlInput.value = product.imageUrl || "";

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

loadProducts().catch(error => alert(error.message));
