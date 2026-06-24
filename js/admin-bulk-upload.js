import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
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
const downloadPriceTemplateBtn = document.getElementById("downloadPriceTemplateBtn");
const downloadStockTemplateBtn = document.getElementById("downloadStockTemplateBtn");

let parsedProducts = [];

function getUploadMode() {
  return document.querySelector("input[name='uploadMode']:checked")?.value || "upsert";
}

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
    const sku = row.sku?.trim() || "";
    const hasVariants = normalizeBoolean(row.hasVariants);
    const optionType = row.optionType?.trim().toLowerCase() || (hasVariants ? "varieties" : "");
    const variantLabel = optionType === "sizes" ? "Size" : optionType === "varieties" ? "Variety" : "";
    const variantName = row.variantName?.trim();
    const variantSku = row.variantSku?.trim() || "";
    const price = normalizeNumber(row.price);
    const stock = normalizeNumber(row.stock);
    const lowStockThreshold = normalizeNumber(row.lowStockThreshold || 5);
    const imageUrl = row.imageUrl?.trim() || "assets/logo.png";

    if (hasVariants) {
      const key = sku ? `sku__${sku}` : `${name.toLowerCase()}__${category}`;

      if (!productMap.has(key)) {
        productMap.set(key, {
          name,
          category,
          sku,
          productType: optionType,
          optionType,
          variantLabel,
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
        sku: variantSku,
        price,
        stock,
        imageUrl
      });

      product.stock = product.variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      product.price = Number(product.variants[0]?.price || 0);
      product.imageUrl = product.variants[0]?.imageUrl || imageUrl;
    } else {
      const key = sku ? `sku__${sku}` : `${name.toLowerCase()}__single__${category}`;

      productMap.set(key, {
        name,
        category,
        sku,
        productType: "single",
        optionType: "",
        variantLabel: "",
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
    "sku",
    "hasVariants",
    "optionType",
    "variantName",
    "variantSku",
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
    previewTable.innerHTML = `<tr><td colspan="7">No products previewed yet.</td></tr>`;
    previewSummary.style.display = "none";
    importBtn.disabled = true;
    return;
  }

  const mode = getUploadMode();
  const totalVariants = parsedProducts.reduce((sum, product) => {
    return sum + (product.hasVariants ? product.variants.length : 0);
  }, 0);

  previewSummary.style.display = "block";
  previewSummary.textContent = `${parsedProducts.length} product(s) ready. ${totalVariants} option(s). Mode: ${mode}.`;

  previewTable.innerHTML = parsedProducts.map(product => {
    const type = product.hasVariants ? (product.variantLabel === "Size" ? "Sizes" : "Varieties") : "Single";
    const priceOrVariants = product.hasVariants
      ? product.variants.map(v => `${v.name}: ₦${Number(v.price).toLocaleString()}`).join("<br>")
      : `₦${Number(product.price).toLocaleString()}`;

    const stock = product.hasVariants
      ? product.variants.map(v => `${v.name}: ${v.stock}`).join("<br>")
      : product.stock;

    const action = mode === "price"
      ? "Update price"
      : mode === "stock"
        ? "Update stock"
        : "Import/update";

    return `
      <tr>
        <td>${product.name}</td>
        <td>${product.sku || ""}</td>
        <td>${type}</td>
        <td>${product.category}</td>
        <td>${priceOrVariants}</td>
        <td>${stock}</td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");

  importBtn.disabled = false;
}

async function findExistingProduct(product) {
  if (product.sku) {
    const skuQuery = query(collection(db, "products"), where("sku", "==", product.sku));
    const skuSnap = await getDocs(skuQuery);
    if (!skuSnap.empty) return skuSnap.docs[0];
  }

  const nameQuery = query(
    collection(db, "products"),
    where("name", "==", product.name),
    where("category", "==", product.category)
  );

  const nameSnap = await getDocs(nameQuery);
  return nameSnap.empty ? null : nameSnap.docs[0];
}

function mergeVariants(existingProduct, incomingProduct, mode) {
  const existingVariants = existingProduct.variants || [];
  const incomingVariants = incomingProduct.variants || [];

  const merged = [...existingVariants];

  for (const incoming of incomingVariants) {
    const matchIndex = merged.findIndex(existing => {
      if (incoming.sku && existing.sku) return incoming.sku === existing.sku;
      return String(existing.name || "").toLowerCase() === String(incoming.name || "").toLowerCase();
    });

    if (matchIndex >= 0) {
      if (mode === "price") {
        merged[matchIndex].price = incoming.price;
      } else if (mode === "stock") {
        merged[matchIndex].stock = incoming.stock;
      } else {
        merged[matchIndex] = {
          ...merged[matchIndex],
          ...incoming
        };
      }
    } else if (mode === "upsert") {
      merged.push(incoming);
    }
  }

  return merged;
}

async function processProducts() {
  if (!parsedProducts.length) {
    alert("No products to process.");
    return;
  }

  const mode = getUploadMode();
  const confirmImport = confirm(`Process this sheet using mode: ${mode}?`);

  if (!confirmImport) return;

  importBtn.disabled = true;
  importBtn.textContent = "Processing...";

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const product of parsedProducts) {
      const existingDoc = await findExistingProduct(product);

      if (!existingDoc) {
        if (mode === "upsert") {
          await addDoc(collection(db, "products"), {
            ...product,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          created++;
        } else {
          skipped++;
        }

        continue;
      }

      const existingProduct = existingDoc.data();
      let updateData = {
        updatedAt: serverTimestamp()
      };

      if (product.hasVariants) {
        const mergedVariants = mergeVariants(existingProduct, product, mode);

        updateData.variants = mergedVariants;
        updateData.stock = mergedVariants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
        updateData.price = Number(mergedVariants[0]?.price || existingProduct.price || 0);
        updateData.hasVariants = true;
        updateData.variantLabel = product.variantLabel || existingProduct.variantLabel || "";
        updateData.optionType = product.optionType || existingProduct.optionType || "";

        if (mode === "upsert") {
          updateData = {
            ...updateData,
            name: product.name,
            category: product.category,
            sku: product.sku || existingProduct.sku || "",
            imageUrl: product.imageUrl || existingProduct.imageUrl || "assets/logo.png",
            lowStockThreshold: product.lowStockThreshold || existingProduct.lowStockThreshold || 5
          };
        }
      } else {
        if (mode === "price") {
          updateData.price = product.price;
        } else if (mode === "stock") {
          updateData.stock = product.stock;
        } else {
          updateData = {
            ...product,
            updatedAt: serverTimestamp()
          };
        }
      }

      await updateDoc(doc(db, "products", existingDoc.id), updateData);
      updated++;
    }

    showStatus(`Completed. Created: ${created}. Updated: ${updated}. Skipped: ${skipped}.`);
    parsedProducts = [];
    renderPreview();
  } catch (error) {
    showStatus("Processing failed: " + error.message, true);
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "Process Sheet";
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

importBtn.addEventListener("click", processProducts);
document.querySelectorAll("input[name='uploadMode']").forEach(input => input.addEventListener("change", renderPreview));

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join("\\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

downloadTemplateBtn.addEventListener("click", () => {
  downloadCsv("biserry-full-product-template.csv", [
    "name,category,sku,hasVariants,optionType,variantName,variantSku,price,stock,lowStockThreshold,imageUrl",
    "Goldimo,grains,GLD,true,sizes,900g,GLD-900G,5000,20,5,assets/goldimo-900g.jpg",
    "Goldimo,grains,GLD,true,sizes,300g,GLD-300G,2500,15,5,assets/goldimo-300g.jpg",
    "Rice 50kg,grains,RICE-50KG,false,,,85000,20,5,assets/rice.jpg"
  ]);
});

downloadPriceTemplateBtn.addEventListener("click", () => {
  downloadCsv("biserry-price-update-template.csv", [
    "name,category,sku,hasVariants,optionType,variantName,variantSku,price,stock,lowStockThreshold,imageUrl",
    "Goldimo,grains,GLD,true,sizes,900g,GLD-900G,5500,,,"
  ]);
});

downloadStockTemplateBtn.addEventListener("click", () => {
  downloadCsv("biserry-stock-count-template.csv", [
    "name,category,sku,hasVariants,optionType,variantName,variantSku,price,stock,lowStockThreshold,imageUrl",
    "Goldimo,grains,GLD,true,sizes,900g,GLD-900G,,40,,"
  ]);
});

renderPreview();
