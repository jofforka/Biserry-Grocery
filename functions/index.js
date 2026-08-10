/**
 * Biserry unattended catalogue automation scaffold.
 *
 * This intentionally contains no AI provider/API key. Configure secrets in
 * Firebase/Google Cloud and add a provider adapter inside processSupplierImport.
 * Never put private keys in the GitHub Pages frontend.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const DEFAULT_MARKUPS = { grains: 16, oil: 14, spices: 22, fresh: 24, drinks: 18, household: 22 };

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  const A = new Set(normalizeText(a).split(" ").filter(Boolean));
  const B = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let common = 0; A.forEach(t => { if (B.has(t)) common++; });
  return common / (A.size + B.size - common);
}

function sellingPrice(cost, markupPct) {
  const raw = Number(cost || 0) * (1 + Number(markupPct || 0) / 100);
  return raw ? Math.ceil(raw / 50) * 50 : 0;
}

async function buildIndex() {
  const snap = await db.collection("products").get();
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const bySku = new Map(); const byBarcode = new Map();
  for (const p of products) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), p);
    if (p.barcode) byBarcode.set(String(p.barcode), p);
  }
  return { products, bySku, byBarcode };
}

function bestMatch(item, index) {
  if (item.sku && index.bySku.has(String(item.sku).toLowerCase())) return { product: index.bySku.get(String(item.sku).toLowerCase()), confidence: 100, basis: "SKU" };
  if (item.barcode && index.byBarcode.has(String(item.barcode))) return { product: index.byBarcode.get(String(item.barcode)), confidence: 100, basis: "barcode" };
  let best = null; let score = 0;
  for (const p of index.products) {
    let s = similarity(item.name, p.name) * 82;
    if (item.category && item.category === p.category) s += 12;
    if (item.brand && p.brand && normalizeText(item.brand) === normalizeText(p.brand)) s += 6;
    if (s > score) { score = s; best = p; }
  }
  return { product: score >= 50 ? best : null, confidence: Math.min(99, Math.round(score)), basis: "name/category" };
}

async function queueException(importId, item, assessment) {
  await db.collection("catalogueExceptions").add({
    importId, productName: item.name || "", sku: item.sku || "", supplier: item.supplier || "",
    ...assessment, resolution: "pending", createdAt: FieldValue.serverTimestamp()
  });
}

async function processSupplierImport(importId, payload) {
  const index = await buildIndex();
  const items = Array.isArray(payload.items) ? payload.items : [];
  let autoUpdated = 0; let queued = 0; let blocked = 0;

  for (const raw of items) {
    const item = { ...raw };
    item.category = String(item.category || "household").toLowerCase();
    item.markupPct = Number(item.markupPct || DEFAULT_MARKUPS[item.category] || 20);
    item.estimatedCost = Number(item.estimatedCost || item.cost || 0);
    item.price = Number(item.price || sellingPrice(item.estimatedCost, item.markupPct));

    const match = bestMatch(item, index);
    const oldPrice = Number(match.product?.price || 0);
    const priceChangePct = oldPrice && item.price ? ((item.price - oldPrice) / oldPrice) * 100 : 0;
    const sellingBelowCost = item.estimatedCost && item.price < item.estimatedCost;
    const needsReview = Math.abs(priceChangePct) > 20 || (match.product && match.confidence < 90) || !item.imageUrl;

    if (sellingBelowCost || !item.name || !item.price) {
      await queueException(importId, item, { status: "blocked", confidence: match.confidence, priceChangePct, reason: "Invalid/missing price or selling price below cost." });
      blocked++; continue;
    }
    if (needsReview) {
      await queueException(importId, item, { status: "review", confidence: match.confidence, priceChangePct, matchId: match.product?.id || "", matchName: match.product?.name || "", reason: "Price, match or image requires approval." });
      queued++; continue;
    }

    const data = { ...item, catalogueConfidence: match.product ? match.confidence : 92, matchMethod: match.basis, updatedAt: FieldValue.serverTimestamp() };
    if (match.product) await db.collection("products").doc(match.product.id).set(data, { merge: true });
    else await db.collection("products").add({ ...data, createdAt: FieldValue.serverTimestamp() });
    autoUpdated++;
  }

  await db.collection("supplierImports").doc(importId).set({
    status: "processed", autoUpdated, queued, blocked, processedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

// Immediate processing when another trusted service creates a supplierImports document.
exports.processSupplierImport = onDocumentCreated("supplierImports/{importId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.status === "processed") return;
  await processSupplierImport(event.params.importId, data);
});

// Safety net for imports created while the trigger was unavailable.
exports.processPendingSupplierImports = onSchedule("every 30 minutes", async () => {
  const snap = await db.collection("supplierImports").where("status", "==", "pending").limit(20).get();
  for (const d of snap.docs) await processSupplierImport(d.id, d.data());
});
