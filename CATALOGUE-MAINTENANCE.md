# Catalogue maintenance

Desktop Shop and homepage Popular Products share the same compact rules: 4 columns from 761px, 5 from 1200px, 6 from 1600px. Product images have a 170px area. Mobile rules are unchanged.

Run GitHub Actions → Catalogue maintenance for stock verification and a bounded image enrichment batch. The initial workflow publication triggers one run. No recurring jobs or Firebase billing changes are introduced.

## Stock
Only products with isActive=true are selected. Embedded variants inherit active status unless isActive=false. Every selected stock field is raised to at least 30 independently; higher parent or variant stock is preserved. Prices and visibility are untouched. Per-product transactions read the latest values, retain a before/after record in catalogueMaintenance/stock-floor-30-v1/products, and a completion marker prevents replenishing stock again after subsequent sales. Do not delete that marker to perform routine restocking.

## Images
The source registry in functions/image-policy.cjs ranks manufacturers ahead of suppliers and retailers. Its initial reviewed manufacturer is Nestlé CWA; the existing supermarket sources remain available. New supplier domains require identity and CDN review. The model cannot approve domains. Unknown brand, size, source, or product matches are left for review.

Known generic category photos and logo placeholders count as missing real images. Actual existing photos are preserved, including during concurrent edits. Each candidate needs a unique Product JSON-LD object or explicit Open Graph product metadata, matching all name terms, brand, quantity, unit dimension and pack count. Redirect destinations are checked before fetching; responses are bounded and image MIME types checked. The accepted image retains its exact source page, source type, matched name, confidence basis and verification date. Confidence 95 is a rule-based quality score, not a calibrated probability.

The runner updates image fields only. It never changes selling prices, stock or product identity. External source URLs remain external image URLs; no random image search scraping or bulk image copying occurs. It does not grant image licensing rights. Source availability can change.

GEMINI_API_KEY in GitHub Actions enables up to five grounded Gemini discovery calls per manual batch. Without that secret only supplied source pages are checked. Firebase Secret Manager secrets are not automatically GitHub secrets. Limits are 50 image tasks per run and no automatic recurring schedule. The workflow exports `missing-image-review.csv` for all remaining image gaps, with the missing identifiers and next action. No API keys are sent to the browser or stored in the repository.

The legacy Firebase Cloud Function source now shares the image policy, but it is not deployed by this workflow: the project has an explicit Spark-only cost guard. If Cloud Functions are deployed separately in the future, deploy the entire functions directory so image-policy.cjs is included.

## Verification
Run `node --test tests/*.test.cjs` for inventory and source-validation safeguards. `tests/catalogue-layout.cjs` uses Playwright to check both pages at 390, 1024, 1366 and 1600px, detect horizontal overflow, and exercise variant selection and add-to-cart. Set PLAYWRIGHT_PATH when using an external Playwright installation.
