/**
 * Biserry autonomous catalogue enrichment + supplier import processing.
 *
 * Uses deterministic matching first. Gemini Search grounding is only used for
 * rows that still need product/pack/price/source enrichment. The API key is a
 * Firebase Secret and is never exposed to GitHub Pages/browser JavaScript.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const DEFAULT_MARKUPS = { grains: 16, oil: 14, spices: 22, fresh: 24, drinks: 18, household: 22 };
const RETAIL_REFERENCE_DOMAINS = ["supermart.ng", "pricepally.com", "jendolstores.com"];
const IMAGE_HOST_ALLOWLIST = ["supermart.ng", "cdn.shopify.com", "shopifycdn.net", "pricepally.com", "jendolstores.com"];

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
function hostAllowed(url, allowlist) {
  try { const h = new URL(url).hostname.toLowerCase(); return allowlist.some(d => h === d || h.endsWith(`.${d}`)); }
  catch { return false; }
}
function cleanJsonText(text = "") {
  const t = String(text).trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{"); const end = t.lastIndexOf("}");
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}
function extractInteractionText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.text === "string") return data.text;
  const candidates = [];
  const walk = v => {
    if (!v) return;
    if (typeof v === "string") { if (v.trim().startsWith("{") && v.trim().endsWith("}")) candidates.push(v); return; }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  return candidates.sort((a,b)=>b.length-a.length)[0] || "";
}

async function extractOgImage(pageUrl) {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return "";
  try {
    const res = await fetch(pageUrl, { headers: { "user-agent": "BiserryCatalogueBot/1.0" }, redirect: "follow" });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 400000);
    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1].replace(/&amp;/g, "&");
    }
  } catch (e) { console.warn("OG image lookup failed", pageUrl, e.message); }
  return "";
}

async function geminiEnrich(item) {
  const key = GEMINI_API_KEY.value();
  if (!key) return null;
  const schema = {
    type: "object",
    properties: {
      canonicalName: { type: "string" }, brand: { type: "string" }, category: { type: "string" },
      subcategory: { type: "string" }, packSize: { type: "string" }, barcode: { type: "string" },
      referenceRetailPrice: { type: "number" }, currency: { type: "string" }, sourceUrl: { type: "string" },
      imageSourcePageUrl: { type: "string" }, confidence: { type: "number" }, notes: { type: "string" }
    },
    required: ["canonicalName","brand","packSize","referenceRetailPrice","currency","sourceUrl","imageSourcePageUrl","confidence","notes"]
  };
  const prompt = `You are enriching a Nigerian grocery ecommerce catalogue. Search the live web for this exact product: ${JSON.stringify({name:item.name, brand:item.brand||"", packSize:item.packSize||"", barcode:item.barcode||""})}. Prefer Nigerian manufacturer pages, authorized distributors, and Nigerian supermarkets. Return the exact current pack size and a CURRENT NIGERIAN RETAIL REFERENCE price in NGN when found. Never describe a retail reference price as wholesale cost. Return the best product/detail page URL that visually shows the exact product pack. If uncertain, lower confidence. Do not invent barcodes.`;
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ model: "gemini-3.6-flash", input: prompt, tools: [{type:"google_search"}], response_format: {type:"text", mime_type:"application/json", schema} })
  });
  if (!res.ok) throw new Error(`Gemini enrichment failed ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  const text = extractInteractionText(data);
  return JSON.parse(cleanJsonText(text));
}

async function enrichItem(item, allowAI = true) {
  const patch = {};
  let page = item.imageSourcePageUrl || item.productSourceUrl || "";
  if (page) {
    const image = await extractOgImage(page);
    if (image && hostAllowed(image, IMAGE_HOST_ALLOWLIST)) {
      patch.imageUrl = image; patch.imageStatus = "Product image resolved from verified source page"; patch.imageConfidence = 95;
      patch.imageSourcePageUrl = page;
    }
  }
  const needsFull = !item.brand || !item.packSize || !item.priceSourceUrl || !patch.imageUrl;
  if (allowAI && needsFull) {
    try {
      const ai = await geminiEnrich({...item, ...patch});
      if (ai) {
        if (ai.canonicalName && Number(ai.confidence) >= 80) patch.canonicalNameSuggestion = ai.canonicalName;
        if (!item.brand && ai.brand) patch.brand = ai.brand;
        if (!item.packSize && ai.packSize) patch.packSize = ai.packSize;
        if (!item.barcode && ai.barcode) patch.barcode = ai.barcode;
        if (ai.referenceRetailPrice > 0 && ai.currency === "NGN") {
          patch.referenceRetailPrice = ai.referenceRetailPrice;
          patch.priceSourceUrl = ai.sourceUrl || "";
          patch.priceObservedAt = new Date().toISOString().slice(0,10);
          patch.priceStatus = "AI-grounded Nigerian retail reference — supplier cost still required";
          patch.priceConfidence = Math.round(Number(ai.confidence || 0));
        }
        const candidatePage = ai.imageSourcePageUrl || ai.sourceUrl || "";
        if (!patch.imageUrl && candidatePage) {
          const img = await extractOgImage(candidatePage);
          if (img && hostAllowed(img, IMAGE_HOST_ALLOWLIST)) {
            patch.imageUrl = img; patch.imageSourcePageUrl = candidatePage;
            patch.imageStatus = "Product image resolved from AI-grounded source page";
            patch.imageConfidence = Math.min(95, Math.round(Number(ai.confidence || 85)));
          }
        }
        patch.enrichmentNotes = ai.notes || "";
        patch.enrichmentConfidence = Math.round(Number(ai.confidence || 0));
      }
    } catch (e) { patch.enrichmentError = e.message.slice(0,500); }
  }
  const imageReady = Boolean(patch.imageUrl || item.imageUrl);
  const dataReady = Boolean((patch.brand || item.brand) && (patch.packSize || item.packSize));
  patch.enrichmentStatus = imageReady && dataReady ? "enriched" : "needs-review";
  patch.lastEnrichedAt = FieldValue.serverTimestamp();
  return patch;
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
    let s = similarity(item.name, p.name) * 80;
    if (item.category && item.category === p.category) s += 10;
    if (item.brand && p.brand && normalizeText(item.brand) === normalizeText(p.brand)) s += 6;
    if (item.packSize && p.packSize && normalizeText(item.packSize) === normalizeText(p.packSize)) s += 4;
    if (s > score) { score = s; best = p; }
  }
  return { product: score >= 50 ? best : null, confidence: Math.min(99, Math.round(score)), basis: "name/category/brand/pack" };
}
async function queueException(importId, item, assessment) {
  await db.collection("catalogueExceptions").add({ importId, productName:item.name||"", sku:item.sku||"", supplier:item.supplier||"", ...assessment, resolution:"pending", createdAt:FieldValue.serverTimestamp() });
}

async function processSupplierImport(importId, payload) {
  const index = await buildIndex(); const items = Array.isArray(payload.items) ? payload.items : [];
  let autoUpdated=0, queued=0, blocked=0, enriched=0;
  for (const raw of items) {
    let item = { ...raw };
    item.category = String(item.category || "household").toLowerCase();
    item.markupPct = Number(item.markupPct || DEFAULT_MARKUPS[item.category] || 20);
    item.estimatedCost = Number(item.estimatedCost || item.cost || 0);
    item.price = Number(item.price || sellingPrice(item.estimatedCost, item.markupPct));

    if (!item.imageUrl || !item.brand || !item.packSize) {
      const patch = await enrichItem(item, true); item = {...item, ...patch}; if (patch.imageUrl || patch.brand || patch.packSize) enriched++;
    }
    const match = bestMatch(item,index); const oldPrice=Number(match.product?.price||0);
    const priceChangePct=oldPrice&&item.price ? ((item.price-oldPrice)/oldPrice)*100 : 0;
    const sellingBelowCost=item.estimatedCost&&item.price<item.estimatedCost;
    const needsReview=Math.abs(priceChangePct)>20 || (match.product&&match.confidence<90) || !item.imageUrl || Number(item.imageConfidence||0)<80;
    if (sellingBelowCost || !item.name || !item.price) { await queueException(importId,item,{status:"blocked",confidence:match.confidence,priceChangePct,reason:"Invalid/missing selling price or selling price below cost."}); blocked++; continue; }
    if (needsReview) { await queueException(importId,item,{status:"review",confidence:match.confidence,priceChangePct,matchId:match.product?.id||"",matchName:match.product?.name||"",reason:"Price, product match or image requires approval."}); queued++; continue; }
    const data={...item,catalogueConfidence:match.product?match.confidence:92,matchMethod:match.basis,updatedAt:FieldValue.serverTimestamp()};
    if(match.product) await db.collection("products").doc(match.product.id).set(data,{merge:true}); else await db.collection("products").add({...data,createdAt:FieldValue.serverTimestamp()});
    autoUpdated++;
  }
  await db.collection("supplierImports").doc(importId).set({status:"processed",autoUpdated,queued,blocked,enriched,processedAt:FieldValue.serverTimestamp()},{merge:true});
}

exports.processSupplierImport = onDocumentCreated({ document:"supplierImports/{importId}", secrets:[GEMINI_API_KEY] }, async event => {
  const data=event.data?.data(); if(!data || data.status==="processed") return; await processSupplierImport(event.params.importId,data);
});
exports.processPendingSupplierImports = onSchedule({ schedule:"every 30 minutes", secrets:[GEMINI_API_KEY] }, async () => {
  const snap=await db.collection("supplierImports").where("status","==","pending").limit(20).get();
  for(const d of snap.docs) await processSupplierImport(d.id,d.data());
});

// Catalogue enrichment worker. Processes a small batch every hour to control API cost.
exports.enrichPendingCatalogue = onSchedule({ schedule:"every 60 minutes", secrets:[GEMINI_API_KEY], timeoutSeconds:540 }, async () => {
  const snap=await db.collection("products").where("enrichmentStatus","in",["pending-image","pending-full","needs-review"]).limit(15).get();
  for(const d of snap.docs) {
    const current={id:d.id,...d.data()};
    const patch=await enrichItem(current,true);
    await d.ref.set(patch,{merge:true});
  }
});
