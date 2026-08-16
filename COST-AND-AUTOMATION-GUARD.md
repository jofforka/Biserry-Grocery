# Biserry v7 — Cost & Automation Guard

## Current operating target: Firebase Spark (no-cost)

Biserry v7 is deliberately designed so the core store does not require Cloud Functions or a paid search provider.

### Core features intended to work on Spark
- Customer storefront and cart
- Active/inactive product visibility
- Firestore product/order storage within Spark quotas
- 24-product storefront batch loading
- 50-product admin server-side pagination
- Email/password Firebase Authentication
- Dispatcher PWA and availability status
- Order tracking by order ID
- Admin order status updates
- PWA/offline shell
- Firestore Security Rules / Firebase App Check (after configuration)

## Current published Firestore no-cost quota
At the time v7 was prepared, Firebase documents the free Cloud Firestore quota as:
- 1 GiB stored data
- 50,000 document reads/day
- 20,000 document writes/day
- 20,000 document deletes/day
- 10 GiB outbound data transfer/month

Always re-check Firebase's official pricing page before a large launch because pricing and quotas can change.

## Operations that can consume noticeable quota
### Activate All / Deactivate All
With 1,300 products, one full-catalogue visibility operation is approximately:
- 1,300 document reads to obtain the IDs
- 1,300 document writes to change visibility

This is acceptable occasionally within current Spark quotas, but it should not be used repeatedly throughout the day.

### Bulk imports
A 1,200-product import can consume roughly 1,200+ writes, plus any reads used for matching/deduplication. Test small batches first and avoid repeated re-imports.

## Features that require approval before enabling because they can require billing

### Firebase Cloud Functions / Cloud Tasks
**Requires Firebase Blaze billing access.** Do not deploy as a required part of Biserry while the project must remain Spark-only.

These would be useful later for:
- unattended catalogue enrichment
- scheduled supplier-price checks
- automatic external notifications
- background dispatch matching
- secure server-side AI API calls
- payment webhooks

### AI APIs
Gemini/OpenAI/other AI services can have free quotas or paid usage depending on product/model and may change. Never place a private AI API key in GitHub/browser JavaScript. A secure unattended AI workflow normally needs a trusted backend, which may itself require a paid/billing-enabled platform.

### Payment gateways
Payment providers may charge transaction fees even if Biserry itself has no monthly software subscription. Do not activate a gateway until current Nigerian transaction pricing is reviewed and approved.

### SMS / WhatsApp Business API
Normal WhatsApp links are free. Automated WhatsApp Business Platform messaging or SMS can have per-message/provider charges. Do not enable without cost review.

### Third-party search
Algolia/Typesense-hosted/other search SaaS may introduce paid tiers. v7 does not require one.

## Cost-control principle
1. Prefer indexed Firestore queries instead of full collection downloads.
2. Paginate customer/admin lists.
3. Avoid real-time listeners on large collections.
4. Use listeners only where live behaviour materially matters (for example dispatcher availability).
5. Cache static assets, not live Firestore data.
6. Batch writes where appropriate.
7. Do not turn on Blaze or any paid external API without explicit owner approval.
