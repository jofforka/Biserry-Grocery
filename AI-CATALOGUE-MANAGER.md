# Biserry AI Catalogue Manager v2

## What changed
The catalogue now separates supplier cost from public retail references and removes generic category photos as if they were product photos. Missing product images are explicitly queued for enrichment.

### Data quality fields
In addition to the original master fields, v2 accepts:
`referenceRetailPrice, priceSourceUrl, productSourceUrl, imageSourcePageUrl, sourceRecency, priceConfidence, imageConfidence, enrichmentStatus, dataQuality`.

`estimatedCost` is reserved for supplier/wholesale cost. `referenceRetailPrice` is a market/retailer reference only.

## Autonomous enrichment
Cloud Functions now perform three stages:
1. If a verified product/detail page is already known, fetch its Open Graph product image.
2. If key information is missing, use Gemini with Google Search grounding to find a current Nigerian product source, exact pack size and current retail reference price.
3. Fetch the product page image, apply confidence rules and update Firestore. Weak results remain in `catalogueExceptions`/review instead of publishing silently.

The scheduled enrichment worker intentionally handles a small batch per hour to limit API cost.

## Setup
1. Upgrade to the Firebase Blaze plan if required for Cloud Functions/Secret Manager usage.
2. From the project root, set the server-side Gemini key:
   `firebase functions:secrets:set GEMINI_API_KEY`
3. Deploy functions:
   `firebase deploy --only functions`
4. Import `data/biserry-1200-master-catalogue-v2.csv` through the admin Bulk Upload page.
5. Keep products with `pending-*` / `needs-review` status unpublished until image/data confidence is acceptable.

## Image rights / source policy
The system should use supplier, manufacturer or otherwise authorized product imagery. Retailer pages are excellent for matching/verification, but Biserry should confirm it has the right to reuse externally hosted images before long-term production use. The code therefore records the source page and confidence rather than pretending every image is owned by Biserry.

## Pricing policy
Public online supermarket prices fluctuate and are not wholesale quotations. They are stored as `referenceRetailPrice`. Selling price should primarily be calculated from the verified supplier `estimatedCost` plus Biserry markup rules.

## Production safeguards
- exact SKU/barcode preferred;
- fuzzy matches require confidence thresholds;
- >20% price movement is reviewed;
- selling below supplier cost is blocked;
- missing/low-confidence images remain review items;
- AI keys stay in Firebase Secret Manager, never browser JavaScript;
- scheduled/event-driven functions should be idempotent.
