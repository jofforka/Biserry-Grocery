# Biserry v7 — Premium Commerce Foundation

## Implemented in this release
- Spark-conscious Firestore architecture.
- Storefront product batching: 24 active products per request.
- Admin Products server-side Firestore pagination: 50 per page.
- Full-catalogue Activate All / Deactivate All remains explicit rather than happening during normal page load.
- Public navigation no longer exposes the Admin link.
- Premium storefront visual layer and micro-interactions.
- Network-first HTML/service-worker strategy to reduce stale deployments.
- Purpose-built offline page.
- One-page checkout improvements and repeat-customer local detail memory.
- Checkout no longer forces WhatsApp to open before the order confirmation page.
- Order tracking page with status timeline.
- Order confirmation offers Track Order, Dispatch and optional WhatsApp copy.
- Admin order schema normalized to work with current checkout fields.
- Latest 50 orders loaded in Admin instead of the entire order collection.
- Order statuses aligned across admin and customer tracking.

## Phase 2 — can remain Spark/no-cost at modest usage
- Firebase customer accounts using email/social auth.
- Buy Again from authenticated order history.
- Saved addresses and favourites.
- Dispatcher job request/acceptance marketplace using Firestore.
- Better Firestore security rules + App Check.
- Lightweight admin exception dashboard.

## Phase 3 — requires cost approval before implementation
- Cloud Functions / Cloud Tasks background automation (Blaze required).
- Secure unattended AI catalogue enrichment.
- Payment gateway webhook automation.
- Automated SMS/WhatsApp Business notifications.
- Advanced hosted full-text search if Firestore search no longer meets scale/UX needs.
