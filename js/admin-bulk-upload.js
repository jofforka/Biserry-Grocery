import { protectAdminPage } from "./admin-auth.js";
import {
  db,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp
} from "./firebase-service.js";

protectAdminPage();

const $ = (id) => document.getElementById(id);
const csvFileInput = $("csvFile");
const previewBtn = $("previewBtn");
const clearPreviewBtn = $("clearPreviewBtn");
const importBtn = $("importBtn");
const previewTable = $("previewTable");
const uploadStatus = $("uploadStatus");
const previewSummary = $("previewSummary");
const downloadTemplateBtn = $("downloadTemplateBtn");
const downloadPriceTemplateBtn = $("downloadPriceTemplateBtn");
const downloadStockTemplateBtn = $("downloadStockTemplateBtn");
const downloadMasterTemplateBtn = $("downloadMasterTemplateBtn");
const exceptionTable = $("exceptionTable");
const exceptionSummary = $("exceptionSummary");
const approvalPanel = $("approvalPanel");
const autoReadyCount = $("autoReadyCount");
const reviewCount = $("reviewCount");
const blockedCount = $("blockedCount");
const avgConfidence = $("avgConfidence");

let parsedProducts = [];
let catalogueIndex = null;

const CATEGORY_DEFAULT_MARKUPS = {
  grains: 16,
  oil: 14,
  spices: 22,
  fresh: 24,
  drinks: 18,
  household: 22
};

const HEADER_ALIASES = {
  name: ["name", "product", "productname", "product_name", "item", "itemname", "description"],
  brand: ["brand", "manufacturer", "make"],
  category: ["category", "department", "dept"],
  subcategory: ["subcategory", "sub_category", "producttype", "product_type"],
  sku: ["sku", "productsku", "product_sku", "itemcode", "item_code", "code"],
  barcode: ["barcode", "gtin", "ean", "upc"],
  hasVariants: ["hasvariants", "has_variants", "variants"],
  optionType: ["optiontype", "option_type", "varianttype", "variant_type"],
  variantName: ["variantname", "variant_name", "size", "packsize", "pack_size"],
  variantSku: ["variantsku", "variant_sku"],
  packSize: ["packsize", "pack_size", "size", "pack"],
  unit: ["unit", "uom", "unitofmeasure", "unit_of_measure"],
  estimatedCost: ["estimatedcost", "estimated_cost", "cost", "costprice", "cost_price", "wholesaleprice", "wholesale_price", "supplierprice", "supplier_price"],
  markupPct: ["markuppct", "markup_pct", "markup", "margin", "marginpct", "margin_pct"],
  price: ["price", "sellingprice", "selling_price", "retailprice", "retail_price"],
  stock: ["stock", "qty", "quantity", "inventory", "onhand", "on_hand"],
  lowStockThreshold: ["lowstockthreshold", "low_stock_threshold", "reorderlevel", "reorder_level"],
  imageUrl: ["imageurl", "image_url", "image", "photo", "picture", "imagepath", "image_path"],
  imageSearchQuery: ["imagesearchquery", "image_search_query"],
  imageStatus: ["imagestatus", "image_status"],
  priceStatus: ["pricestatus", "price_status"],
  supplier: ["supplier", "vendor", "wholesaler"],
  country: ["country", "origin", "countryoforigin", "country_of_origin"],
  lastPriceCheck: ["lastpricecheck", "last_price_check", "priceupdated", "price_updated"],
  notes: ["notes", "note", "comments", "comment"]
};

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

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalHeader(rawHeader) {
  const key = normalizeKey(rawHeader);
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.map(normalizeKey).includes(key)) return canonical;
  }
  return String(rawHeader || "").trim().replace(/^\uFEFF/, "");
}

function normalizeBoolean(value) {
  return ["true", "yes", "1", "y"].includes(String(value || "").trim().toLowerCase());
}

function normalizeNumber(value) {
  const clean = String(value ?? "0").replace(/[₦,$%\s]/g, "").replace(/,/g, "");
  const parsed = Number(clean || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMarkup(value, category) {
  const n = normalizeNumber(value);
  if (n > 0 && n <= 1) return n * 100;
  if (n > 1) return n;
  return CATEGORY_DEFAULT_MARKUPS[category] ?? 20;
}

function normalizeProductText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(gms?|grams?)\b/g, "g")
    .replace(/\b(kgs?|kilograms?)\b/g, "kg")
    .replace(/\b(litres?|liters?)\b/g, "l")
    .replace(/\b(millilitres?|milliliters?)\b/g, "ml")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeProductText(value).split(" ").filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach(token => { if (B.has(token)) common++; });
  return common / (A.size + B.size - common);
}

function makeVariantId(name) {
  return "v-" + String(name || "variant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") + "-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"'; i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvToRows(csvText) {
  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(canonicalHeader);
  if (!headers.includes("name")) throw new Error("A product-name column is required (for example: name, product, item or description).");

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] || ""; });
    return row;
  });
}

function extractPackSize(name) {
  const match = String(name || "").match(/\b\d+(?:\.\d+)?\s?(?:kg|g|ml|cl|l|pcs?|rolls?|bags?|pads?)\b/i);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function inferCategory(row) {
  if (row.category) return String(row.category).trim().toLowerCase();
  const text = normalizeProductText(`${row.name} ${row.subcategory || ""}`);
  const rules = [
    ["oil", ["oil", "margarine", "butter"]],
    ["drinks", ["milk", "malt", "juice", "water", "cola", "fanta", "sprite", "tea", "coffee", "milo", "bournvita"]],
    ["fresh", ["fresh", "tomato", "onion", "pepper", "yam", "plantain", "banana", "orange", "beef", "chicken", "turkey", "fish", "egg"]],
    ["spices", ["seasoning", "maggi", "knorr", "onga", "curry", "thyme", "paste", "salt", "crayfish", "egusi", "ogbono"]],
    ["household", ["detergent", "soap", "toothpaste", "tissue", "bleach", "insecticide", "diaper", "pads", "freshener"]]
  ];
  for (const [category, keywords] of rules) if (keywords.some(k => text.includes(k))) return category;
  return "grains";
}

function calculateRecommendedPrice(cost, markupPct) {
  if (!cost) return 0;
  const raw = cost * (1 + markupPct / 100);
  return Math.ceil(raw / 50) * 50;
}

function imageConfidence(imageUrl, imageStatus) {
  const url = String(imageUrl || "").toLowerCase();
  const status = String(imageStatus || "").toLowerCase();
  if (!url || url.endsWith("assets/logo.png")) return 25;
  if (status.includes("placeholder") || url.includes("assets/rice.jpg") || url.includes("assets/vegetable-oil.jpg") || url.includes("assets/beverages.jpg") || url.includes("assets/tomato-paste.jpg") || url.includes("assets/fresh-vegetables.jpg") || url.includes("assets/household.jpg")) return 55;
  if (/^https?:\/\//.test(url) || /\.(png|jpe?g|webp|gif)(\?.*)?$/.test(url)) return 90;
  return 70;
}

function groupRowsIntoProducts(rows) {
  const productMap = new Map();

  for (const raw of rows) {
    const name = String(raw.name || "").trim();
    if (!name) continue;

    const category = inferCategory(raw);
    const sku = String(raw.sku || "").trim();
    const barcode = String(raw.barcode || "").trim();
    const hasVariants = normalizeBoolean(raw.hasVariants);
    const optionType = String(raw.optionType || "").trim().toLowerCase() || (hasVariants ? "sizes" : "");
    const variantLabel = optionType === "sizes" ? "Size" : optionType === "varieties" ? "Variety" : "";
    const variantName = String(raw.variantName || "").trim();
    const variantSku = String(raw.variantSku || "").trim();
    const cost = normalizeNumber(raw.estimatedCost);
    const markupPct = normalizeMarkup(raw.markupPct, category);
    const suppliedPrice = normalizeNumber(raw.price);
    const price = suppliedPrice || calculateRecommendedPrice(cost, markupPct);
    const stock = normalizeNumber(raw.stock);
    const lowStockThreshold = normalizeNumber(raw.lowStockThreshold || 5);
    const imageUrl = String(raw.imageUrl || "").trim() || "assets/logo.png";
    const packSize = String(raw.packSize || variantName || extractPackSize(name)).trim();

    const richFields = {
      brand: String(raw.brand || "").trim(),
      subcategory: String(raw.subcategory || "").trim(),
      barcode,
      packSize,
      unit: String(raw.unit || "item").trim(),
      estimatedCost: cost,
      markupPct,
      supplier: String(raw.supplier || "").trim(),
      priceStatus: String(raw.priceStatus || (cost ? "Estimated" : "Unverified")).trim(),
      imageSearchQuery: String(raw.imageSearchQuery || `${raw.brand || ""} ${name} Nigeria product pack`).trim(),
      imageStatus: String(raw.imageStatus || (imageUrl === "assets/logo.png" ? "Missing" : "Provided")).trim(),
      country: String(raw.country || "").trim(),
      lastPriceCheck: String(raw.lastPriceCheck || "").trim(),
      notes: String(raw.notes || "").trim()
    };

    if (hasVariants) {
      const key = sku ? `sku__${sku.toLowerCase()}` : `name__${normalizeProductText(name)}__${category}`;
      if (!productMap.has(key)) {
        productMap.set(key, {
          name, category, sku, productType: optionType, optionType, variantLabel,
          hasVariants: true, lowStockThreshold, imageUrl, variants: [], ...richFields
        });
      }
      const product = productMap.get(key);
      product.variants.push({
        id: makeVariantId(variantName || name), name: variantName || packSize || name,
        sku: variantSku, barcode, price, estimatedCost: cost, markupPct, stock, imageUrl
      });
      product.stock = product.variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      product.price = Number(product.variants[0]?.price || 0);
    } else {
      const key = sku ? `sku__${sku.toLowerCase()}` : barcode ? `barcode__${barcode}` : `name__${normalizeProductText(name)}__${category}`;
      productMap.set(key, {
        name, category, sku, productType: "single", optionType: "", variantLabel: "",
        hasVariants: false, price, stock, lowStockThreshold, imageUrl, variants: [], ...richFields
      });
    }
  }

  return Array.from(productMap.values());
}

async function loadCatalogueIndex() {
  const snap = await getDocs(collection(db, "products"));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const bySku = new Map();
  const byBarcode = new Map();
  docs.forEach(p => {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p);
    if (p.barcode) byBarcode.set(String(p.barcode), p);
  });
  return { docs, bySku, byBarcode };
}

function findBestExistingMatch(product) {
  if (!catalogueIndex) return { product: null, confidence: 0, basis: "none" };
  if (product.sku && catalogueIndex.bySku.has(product.sku.toLowerCase())) {
    return { product: catalogueIndex.bySku.get(product.sku.toLowerCase()), confidence: 100, basis: "SKU" };
  }
  if (product.barcode && catalogueIndex.byBarcode.has(product.barcode)) {
    return { product: catalogueIndex.byBarcode.get(product.barcode), confidence: 100, basis: "barcode" };
  }

  let best = null;
  let bestScore = 0;
  for (const existing of catalogueIndex.docs) {
    let score = jaccardSimilarity(product.name, existing.name) * 78;
    if (product.category && existing.category === product.category) score += 12;
    if (product.brand && existing.brand && normalizeProductText(product.brand) === normalizeProductText(existing.brand)) score += 6;
    if (product.packSize && existing.packSize && normalizeProductText(product.packSize) === normalizeProductText(existing.packSize)) score += 4;
    if (score > bestScore) { bestScore = score; best = existing; }
  }
  return { product: bestScore >= 50 ? best : null, confidence: Math.min(99, Math.round(bestScore)), basis: "name/category" };
}

function assessProduct(product) {
  const match = findBestExistingMatch(product);
  const issues = [];
  const warnings = [];
  const mode = getUploadMode();

  // If a supplier sheet has no trustworthy image but the matched Biserry product does,
  // reuse Biserry's existing image instead of introducing a placeholder.
  let incomingImageConfidence = imageConfidence(product.imageUrl, product.imageStatus);
  if (match.product && incomingImageConfidence < 75) {
    const existingImageConfidence = imageConfidence(match.product.imageUrl, "Verified existing catalogue image");
    if (existingImageConfidence >= 75) {
      product.imageUrl = match.product.imageUrl;
      product.imageStatus = "Reused from matched Biserry catalogue product";
      incomingImageConfidence = existingImageConfidence;
    }
  }
  const imgConfidence = incomingImageConfidence;
  let matchConfidence = match.confidence;

  if (!product.sku && !product.barcode) warnings.push("No SKU/barcode; matching relies on name/category.");
  if (!product.price && mode !== "stock") issues.push("No usable selling price or cost price.");
  if (product.estimatedCost && product.price < product.estimatedCost) issues.push("Selling price is below cost.");

  let priceChangePct = 0;
  if (match.product && Number(match.product.price) > 0 && Number(product.price) > 0) {
    priceChangePct = ((Number(product.price) - Number(match.product.price)) / Number(match.product.price)) * 100;
    if (Math.abs(priceChangePct) > 20) warnings.push(`Price change ${priceChangePct.toFixed(1)}% exceeds 20% threshold.`);
  }

  if (match.product && matchConfidence >= 50 && matchConfidence < 85) warnings.push(`Possible match only (${matchConfidence}% confidence).`);
  if (imgConfidence < 75) warnings.push(`Image confidence is ${imgConfidence}%.`);
  if (!match.product && mode !== "upsert") issues.push(`No existing product found for ${mode} update.`);

  let status = "auto";
  if (issues.length) status = "blocked";
  else if (warnings.length || (match.product && matchConfidence < 90)) status = "review";

  const confidenceParts = [match.product ? matchConfidence : 92, imgConfidence, product.sku || product.barcode ? 100 : 70, product.price ? 100 : 40];
  const confidence = Math.round(confidenceParts.reduce((a,b) => a+b, 0) / confidenceParts.length);

  return {
    ...product,
    _analysis: {
      status, confidence, matchConfidence, imageConfidence: imgConfidence,
      matchId: match.product?.id || null, matchName: match.product?.name || "",
      matchBasis: match.basis, priceChangePct, issues, warnings,
      approved: status === "auto"
    }
  };
}

function renderStats() {
  const analyses = parsedProducts.map(p => p._analysis).filter(Boolean);
  const auto = analyses.filter(a => a.status === "auto").length;
  const review = analyses.filter(a => a.status === "review").length;
  const blocked = analyses.filter(a => a.status === "blocked").length;
  const avg = analyses.length ? Math.round(analyses.reduce((s,a) => s + a.confidence, 0) / analyses.length) : 0;
  autoReadyCount.textContent = auto;
  reviewCount.textContent = review;
  blockedCount.textContent = blocked;
  avgConfidence.textContent = `${avg}%`;
}

function statusBadge(status) {
  const label = status === "auto" ? "Auto-ready" : status === "review" ? "Review" : "Blocked";
  return `<span class="aiBadge ${status}">${label}</span>`;
}

function renderPreview() {
  if (!parsedProducts.length) {
    previewTable.innerHTML = `<tr><td colspan="9">No products previewed yet.</td></tr>`;
    exceptionTable.innerHTML = `<tr><td colspan="6">No exceptions yet.</td></tr>`;
    previewSummary.style.display = "none";
    exceptionSummary.style.display = "none";
    approvalPanel.style.display = "none";
    importBtn.disabled = true;
    renderStats();
    return;
  }

  const mode = getUploadMode();
  const approved = parsedProducts.filter(p => p._analysis?.approved && p._analysis.status !== "blocked").length;
  previewSummary.style.display = "block";
  previewSummary.textContent = `${parsedProducts.length} product(s) analyzed. ${approved} currently approved for processing. Mode: ${mode}.`;

  previewTable.innerHTML = parsedProducts.map((product, index) => {
    const a = product._analysis;
    const oldPrice = a.matchId ? catalogueIndex.docs.find(p => p.id === a.matchId)?.price : null;
    return `<tr>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.sku || product.barcode || "")}</td>
      <td>${escapeHtml(product.brand || "")}</td>
      <td>${escapeHtml(product.category)}</td>
      <td>${oldPrice ? `₦${Number(oldPrice).toLocaleString()} → ` : ""}₦${Number(product.price || 0).toLocaleString()}</td>
      <td>${a.matchName ? `${escapeHtml(a.matchName)}<br><small>${a.matchConfidence}% via ${escapeHtml(a.matchBasis)}</small>` : "New product"}</td>
      <td>${a.confidence}%</td>
      <td>${statusBadge(a.status)}</td>
      <td><input class="approvalCheck" data-index="${index}" type="checkbox" ${a.approved ? "checked" : ""} ${a.status === "blocked" ? "disabled" : ""}></td>
    </tr>`;
  }).join("");

  const exceptions = parsedProducts.map((p,index) => ({p,index})).filter(({p}) => p._analysis.status !== "auto");
  approvalPanel.style.display = exceptions.length ? "block" : "none";
  exceptionSummary.style.display = exceptions.length ? "block" : "none";
  exceptionSummary.textContent = `${exceptions.length} exception(s) require attention. Blocked rows cannot be approved until the source data is corrected.`;
  exceptionTable.innerHTML = exceptions.length ? exceptions.map(({p,index}) => {
    const a = p._analysis;
    const reason = [...a.issues, ...a.warnings].join(" ");
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${a.confidence}%</td>
      <td>${escapeHtml(reason)}</td>
      <td>${a.matchName ? escapeHtml(a.matchName) : "—"}</td>
      <td>${a.status === "blocked" ? "Correct source data" : `<button class="btn outline approveOne" data-index="${index}" type="button">${a.approved ? "Unapprove" : "Approve"}</button>`}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6">No exceptions. All rows are auto-ready.</td></tr>`;

  importBtn.disabled = approved === 0;
  renderStats();
  bindApprovalControls();
}

function bindApprovalControls() {
  document.querySelectorAll(".approvalCheck").forEach(input => input.addEventListener("change", e => {
    const index = Number(e.target.dataset.index);
    parsedProducts[index]._analysis.approved = e.target.checked;
    renderPreview();
  }));
  document.querySelectorAll(".approveOne").forEach(btn => btn.addEventListener("click", e => {
    const index = Number(e.currentTarget.dataset.index);
    parsedProducts[index]._analysis.approved = !parsedProducts[index]._analysis.approved;
    renderPreview();
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function mergeVariants(existingProduct, incomingProduct, mode) {
  const merged = [...(existingProduct.variants || [])];
  for (const incoming of incomingProduct.variants || []) {
    const matchIndex = merged.findIndex(existing => {
      if (incoming.sku && existing.sku) return String(incoming.sku).toLowerCase() === String(existing.sku).toLowerCase();
      return normalizeProductText(existing.name) === normalizeProductText(incoming.name);
    });
    if (matchIndex >= 0) {
      if (mode === "price") merged[matchIndex].price = incoming.price;
      else if (mode === "stock") merged[matchIndex].stock = incoming.stock;
      else merged[matchIndex] = { ...merged[matchIndex], ...incoming };
    } else if (mode === "upsert") merged.push(incoming);
  }
  return merged;
}

function cleanProductForFirestore(product) {
  const copy = { ...product };
  delete copy._analysis;
  return copy;
}

async function saveException(product, result = "pending") {
  try {
    await addDoc(collection(db, "catalogueExceptions"), {
      productName: product.name,
      sku: product.sku || "",
      supplier: product.supplier || "",
      status: product._analysis.status,
      confidence: product._analysis.confidence,
      matchConfidence: product._analysis.matchConfidence,
      imageConfidence: product._analysis.imageConfidence,
      proposedPrice: product.price || 0,
      priceChangePct: product._analysis.priceChangePct || 0,
      matchId: product._analysis.matchId || "",
      matchName: product._analysis.matchName || "",
      issues: product._analysis.issues,
      warnings: product._analysis.warnings,
      resolution: result,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Could not persist catalogue exception. Firestore rules may need catalogueExceptions permission.", error);
  }
}

async function processProducts() {
  const approvedProducts = parsedProducts.filter(p => p._analysis?.approved && p._analysis.status !== "blocked");
  if (!approvedProducts.length) { alert("No approved products to process."); return; }
  const mode = getUploadMode();
  if (!confirm(`Process ${approvedProducts.length} approved product(s) using mode: ${mode}?`)) return;

  importBtn.disabled = true;
  importBtn.textContent = "Processing...";
  let created = 0, updated = 0, skipped = 0, exceptionsLogged = 0;

  try {
    for (const product of parsedProducts) {
      if (product._analysis.status !== "auto") {
        await saveException(product, product._analysis.approved ? "approved" : "pending");
        exceptionsLogged++;
      }
      if (!product._analysis.approved || product._analysis.status === "blocked") { skipped++; continue; }

      const existingId = product._analysis.matchId;
      if (!existingId) {
        if (mode === "upsert") {
          await addDoc(collection(db, "products"), {
            ...cleanProductForFirestore(product),
            catalogueConfidence: product._analysis.confidence,
            matchMethod: "new-product",
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          });
          created++;
        } else skipped++;
        continue;
      }

      const existingProduct = catalogueIndex.docs.find(p => p.id === existingId) || {};
      let updateData = { updatedAt: serverTimestamp(), catalogueConfidence: product._analysis.confidence, matchMethod: product._analysis.matchBasis };

      if (product.hasVariants) {
        const mergedVariants = mergeVariants(existingProduct, product, mode);
        updateData.variants = mergedVariants;
        updateData.stock = mergedVariants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
        updateData.price = Number(mergedVariants[0]?.price || existingProduct.price || 0);
        updateData.hasVariants = true;
        if (mode === "upsert") updateData = { ...updateData, ...cleanProductForFirestore(product), variants: mergedVariants };
      } else if (mode === "price") {
        updateData.price = product.price;
        if (product.estimatedCost) updateData.estimatedCost = product.estimatedCost;
        if (product.markupPct) updateData.markupPct = product.markupPct;
        if (product.priceStatus) updateData.priceStatus = product.priceStatus;
        if (product.lastPriceCheck) updateData.lastPriceCheck = product.lastPriceCheck;
      } else if (mode === "stock") {
        updateData.stock = product.stock;
      } else {
        updateData = { ...cleanProductForFirestore(product), updatedAt: serverTimestamp(), catalogueConfidence: product._analysis.confidence, matchMethod: product._analysis.matchBasis };
      }

      await updateDoc(doc(db, "products", existingId), updateData);
      updated++;
    }

    showStatus(`Completed. Created: ${created}. Updated: ${updated}. Skipped/unapproved: ${skipped}. Exceptions logged: ${exceptionsLogged}.`);
    parsedProducts = [];
    catalogueIndex = null;
    renderPreview();
  } catch (error) {
    showStatus("Processing failed: " + error.message, true);
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = "Process Approved Rows";
  }
}

async function analyzeFile() {
  hideStatus();
  const file = csvFileInput.files[0];
  if (!file) { showStatus("Please select a CSV file first.", true); return; }
  previewBtn.disabled = true;
  previewBtn.textContent = "Analyzing...";
  try {
    const rows = parseCsvToRows(await file.text());
    catalogueIndex = await loadCatalogueIndex();
    parsedProducts = groupRowsIntoProducts(rows).map(assessProduct);
    renderPreview();
    showStatus(`AI Catalogue Manager analyzed ${parsedProducts.length} product(s) against ${catalogueIndex.docs.length} existing catalogue item(s).`);
  } catch (error) {
    parsedProducts = [];
    renderPreview();
    showStatus(error.message, true);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = "Analyze Supplier / Master CSV";
  }
}

previewBtn.addEventListener("click", analyzeFile);
clearPreviewBtn.addEventListener("click", () => { parsedProducts = []; catalogueIndex = null; csvFileInput.value = ""; renderPreview(); hideStatus(); });
importBtn.addEventListener("click", processProducts);
document.querySelectorAll("input[name='uploadMode']").forEach(input => input.addEventListener("change", () => {
  if (parsedProducts.length) parsedProducts = parsedProducts.map(assessProduct);
  renderPreview();
}));

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename, matrix) {
  const content = matrix.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

const basicHeaders = ["name","category","sku","hasVariants","optionType","variantName","variantSku","price","stock","lowStockThreshold","imageUrl"];
const masterHeaders = ["name","brand","category","subcategory","sku","barcode","hasVariants","optionType","variantName","variantSku","packSize","unit","estimatedCost","markupPct","price","stock","lowStockThreshold","imageUrl","imageSearchQuery","imageStatus","priceStatus","supplier","country","lastPriceCheck","notes"];

downloadTemplateBtn.addEventListener("click", () => downloadCsv("biserry-full-product-template.csv", [basicHeaders,["Goldimo","grains","GLD","true","sizes","900g","GLD-900G","5000","20","5","assets/goldimo-900g.jpg"]]));
downloadPriceTemplateBtn.addEventListener("click", () => downloadCsv("biserry-price-update-template.csv", [basicHeaders,["Goldimo","grains","GLD","true","sizes","900g","GLD-900G","5500","","",""]]));
downloadStockTemplateBtn.addEventListener("click", () => downloadCsv("biserry-stock-count-template.csv", [basicHeaders,["Goldimo","grains","GLD","true","sizes","900g","GLD-900G","","40","",""]]));
downloadMasterTemplateBtn.addEventListener("click", () => downloadCsv("biserry-ai-master-template.csv", [masterHeaders,["Golden Penny Spaghetti 500g","Golden Penny","grains","Pasta","GP-SPAG-500","","false","","","","500g","item","900","18","","30","5","assets/spaghetti.jpg","Golden Penny Spaghetti 500g Nigeria product pack","Verified","Supplier verified","Example Supplier","Nigeria","2026-08-10",""]]));

renderPreview();
