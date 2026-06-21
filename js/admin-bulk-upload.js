import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "./firebase-service.js";

protectAdminPage();

const csvFileInput = document.getElementById("csvFile");
const previewBtn = document.getElementById("previewBtn");
const clearPreviewBtn = document.getElementById("clearPreviewBtn");
const importBtn = document.getElementById("importBtn");
const previewTable = document.getElementById("previewTable");
const uploadStatus = document.getElementById("uploadStatus");
const previewSummary = document.getElementById("previewSummary");
const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");

let parsedProducts = [];

function showStatus(message, isError = false) {
  uploadStatus.style.display = "block";
  uploadStatus.textContent = message;
  uploadStatus.style.borderLeftColor = isError ? "#9f1d1d" : "var(--gold)";
}

function hideStatus() {
  uploadStatus.style.display = "none";
  uploadStatus.textContent = "";
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(header) {
  return header.trim().replace(/^\uFEFF/, "");
}

function normalizeBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeNumber(value) {
  const clean = String(value || "0").replace(/[₦,\s]/g, "");
  return Number(clean || 0);
}

function makeVariantId(name) {
  return "v-" + String(name || "variant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") + "-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
}

function groupRowsIntoProducts(rows) {
  const productMap = new Map();

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;

    const category = row.category?.trim().toLowerCase() || "household";
    const hasVariants = normalizeBoolean(row.hasVariants);
    const variantName = row.variantName?.trim();
    const price = normalizeNumber(row.price);
    const stock = normalizeNumber(row.stock);
    const lowStockThreshold = normalizeNumber(row.lowStockThreshold || 5);
    const imageUrl = row.imageUrl?.trim() || "assets/logo.png";

    if (hasVariants) {
      const key = `${name.toLowerCase()}__${category}`;

      if (!productMap.has(key)) {
        productMap.set(key, {
          name,
          category,
          hasVariants: true,
          lowStockThreshold,
          imageUrl,
          variants: []
        });
      }

      const product = productMap.get(key);

      product.variants.push({
        id: makeVariantId(variantName || name),
        name: variantName || name,
        price,
        stock,
        imageUrl
      });

      product.stock = product.variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      product.price = Number(product.variants[0]?.price || 0);
      product.imageUrl = product.variants[0]?.imageUrl || imageUrl;
    } else {
      const key = `${name.toLowerCase()}__single__${category}`;

      productMap.set(key, {
        name,
        category,
        hasVariants: false,
        price,
        stock,
        lowStockThreshold,
        imageUrl,
        variants: []
      });
    }
  }

  return Array.from(productMap.values());
}

async function readCsvFile(file) {
  return await file.text();
}

function parseCsvToRows(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV file is empty or missing data rows.");
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const requiredHeaders = [
    "name",
    "category",
    "hasVariants",
    "variantName",
    "price",
    "stock",
    "lowStockThreshold",
    "imageUrl"
  ];

  const missing = requiredHeaders.filter(header => !headers.includes(header));
  if (missing.length) {
    throw new Error("Missing required columns: " + missing.join(", "));
  }

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

function renderPreview() {
  if (!parsedProducts.length) {
    previewTable.innerHTML = `<tr><td colspan="6">No products previewed yet.</td></tr>`;
    previewSummary.style.display = "none";
    importBtn.disabled = true;
    return;
  }

  const totalVariants = parsedProducts.reduce((sum, product) => {
    return sum + (product.hasVariants ? product.variants.length : 0);
  }, 0);

  previewSummary.style.display = "block";
  previewSummary.textContent = `${parsedProducts.length} product(s) ready. ${totalVariants} variant(s) detected.`;

  previewTable.innerHTML = parsedProducts.map(product => {
    const type = product.hasVariants ? "Variants" : "Single";
    const priceOrVariants = product.hasVariants
      ? product.variants.map(v => `${v.name}: ₦${Number(v.price).toLocaleString()}`).join("<br>")
      : `₦${Number(product.price).toLocaleString()}`;

    const stock = product.hasVariants
      ? product.variants.map(v => `${v.name}: ${v.stock}`).join("<br>")
      : product.stock;

    const image = product.imageUrl || product.variants?.[0]?.imageUrl || "assets/logo.png";

    return `
      <tr>
        <td>${product.name}</td>
        <td>${type}</td>
        <td>${product.category}</td>
        <td>${priceOrVariants}</td>
        <td>${stock}</td>
        <td><img src="${image}" alt="${product.name}" style="width:60px;height:50px;object-fit:cover;border-radius:10px;"></td>
      </tr>
    `;
  }).join("");

  importBtn.disabled = false;
}

async function productExists(name, category) {
  const q = query(
    collection(db, "products"),
    where("name", "==", name),
    where("category", "==", category)
  );

  const snap = await getDocs(q);
  return !snap.empty;
}

async function importProducts() {
  if (!parsedProducts.length) {
    alert("No products to import.");
    return;
  }

  const confirmImport = confirm(
    "Import these products to Firebase? Existing products with the same name and category will be skipped."
  );

  if (!confirmImport) return;

  importBtn.disabled = true;
  importBtn.textContent = "Importing...";

  let imported = 0;
  let skipped = 0;

  try {
    for (const product of parsedProducts) {
      const exists = await productExists(product.name, product.category);

      if (exists) {
        skipped++;
        continue;
      }

      await addDoc(collection(db, "products"), {
        ...product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      imported++;
    }

    showStatus(`Import completed. Imported: ${imported}. Skipped duplicates: ${skipped}.`);
    parsedProducts = [];
    renderPreview();
  } catch (error) {
    showStatus("Import failed: " + error.message, true);
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "Import to Firebase";
  }
}

previewBtn.addEventListener("click", async () => {
  hideStatus();

  const file = csvFileInput.files[0];

  if (!file) {
    showStatus("Please select a CSV file first.", true);
    return;
  }

  try {
    const csvText = await readCsvFile(file);
    const rows = parseCsvToRows(csvText);
    parsedProducts = groupRowsIntoProducts(rows);
    renderPreview();
    showStatus("CSV preview generated successfully.");
  } catch (error) {
    parsedProducts = [];
    renderPreview();
    showStatus(error.message, true);
  }
});

clearPreviewBtn.addEventListener("click", () => {
  parsedProducts = [];
  csvFileInput.value = "";
  renderPreview();
  hideStatus();
});

importBtn.addEventListener("click", importProducts);

downloadTemplateBtn.addEventListener("click", () => {
  const csvTemplate = [
    "name,category,hasVariants,variantName,price,stock,lowStockThreshold,imageUrl",
    "Toothpaste,household,true,Colgate,2500,20,5,assets/colgate.jpg",
    "Toothpaste,household,true,Close-Up,2300,15,5,assets/closeup.jpg",
    "Rice 50kg,grains,false,,85000,20,5,assets/rice.jpg",
    "Vegetable Oil 5L,oil,false,,12000,30,5,assets/oil.jpg"
  ].join("\\n");

  const blob = new Blob([csvTemplate], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "biserry-products-template.csv";
  link.click();

  URL.revokeObjectURL(url);
});

renderPreview();
