# Biserry v8 Free-Max

This release consolidates additional no-cost capabilities on top of v7.6.

## Active immediately
- Firebase Performance Monitoring initialization
- Favorites and recently viewed customer surfaces
- Rule-based reorder suggestions from recent order history (no AI API)
- Richer product metadata: brand, pack size, supplier cost, search aliases
- Product price-quality filter
- Margin visibility in Admin Products
- Search normalization/aliases for loaded catalogue batches
- Spark quota guard messaging
- PWA cache version bump

## Prepared but intentionally OFF until Firebase Console setup
- App Check: add the public reCAPTCHA v3 site key to FREE_MAX.appCheckSiteKey in js/firebase-config.js, test, then enforce in Firebase Console.
- Google Analytics: enable Analytics for the Firebase project and add the Measurement ID to FREE_MAX.analyticsMeasurementId.

No API secret belongs in firebase-config.js.

## Cost boundary
No Cloud Functions, Firebase Storage, paid WhatsApp API, paid AI enrichment, paid search service, or automatic bank-transfer API was added.

## Firestore rules
No rules replacement is required for this v8 patch.
