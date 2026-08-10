# Biserry AI Catalogue Manager

## What this upgrade adds

The Bulk Upload page is now an intelligent catalogue ingestion layer that preserves the existing Firestore `products` collection while accepting richer master data.

### Supplier-list recognition
Common supplier headings are normalized automatically, including Product/Item/Description → `name`, Cost Price/Wholesale Price/Supplier Price → `estimatedCost`, Qty/Quantity → `stock`, Vendor/Wholesaler → `supplier`, and Size/Pack → `packSize` / `variantName`.

### Product matching
Matching runs in this order:
1. Exact SKU
2. Exact barcode/GTIN
3. Normalized name token similarity, with category/brand/pack-size bonuses

A confidence score is generated for every proposed action.

### Pricing
If a selling price is blank but `estimatedCost` exists, Biserry calculates a price using `markupPct`. If markup is blank, category defaults are used:
- grains 16%
- oil 14%
- spices 22%
- fresh 24%
- drinks 18%
- household 22%

Prices are rounded up to the nearest ₦50.

### Safety rules
- Selling price below cost: BLOCKED
- Existing price changes over ±20%: REVIEW
- Weak fuzzy product match: REVIEW
- Missing/placeholder image: REVIEW
- Price/stock-only row with no existing match: BLOCKED
- Exact SKU/barcode match with normal values: usually AUTO-READY

### Approval queue
Auto-ready rows begin approved. Review rows require explicit approval. Blocked rows cannot be approved until source data is corrected.

The system attempts to log non-auto rows to a Firestore collection named `catalogueExceptions`. If Firestore rules do not permit that collection, import still continues and a warning is written to the browser console.

## Rich master fields
`name, brand, category, subcategory, sku, barcode, hasVariants, optionType, variantName, variantSku, packSize, unit, estimatedCost, markupPct, price, stock, lowStockThreshold, imageUrl, imageSearchQuery, imageStatus, priceStatus, supplier, country, lastPriceCheck, notes`

## Important distinction: AI-ready vs autonomous external AI
This implementation uses deterministic intelligent matching and confidence scoring in the browser. It deliberately does **not** embed a secret OpenAI/Gemini key in client-side JavaScript.

For unattended operation, add a trusted backend (Firebase Cloud Functions is the natural fit) that can:
- receive supplier files from a secure upload/email workflow;
- call an AI model for irregular supplier spreadsheet interpretation;
- call an approved product-image search/provider;
- write results to Firestore with server-side credentials;
- schedule recurring processing;
- send alerts for review items.

Never place private AI API keys in this static GitHub Pages frontend.
