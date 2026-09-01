# Biserry v11.1 Critical Stability Hotfix

This patch fixes two launch blockers:

1. Admin pages redirecting back to login while Firebase Auth is still restoring the persisted session.
2. Standalone dispatch requests failing when the deployed JavaScript and the published Firestore rules are from different versions.

## Deploy in this exact order

1. Upload/replace:
   - js/firebase-service.js
   - js/admin-auth.js
   - js/dispatch.js
   - admin/dispatch-bookings.html
   - admin/dashboard.html
   - dispatch.html
   - service-worker.js

2. Firebase Console → Firestore Database → Rules:
   replace the complete rules with `firestore.rules.v11.1-stability`, then Publish.

3. Close all Biserry admin tabs.
4. Open a new tab and sign in to Admin once.
5. Click Dashboard → Dispatch Control → Dispatchers → Rider Settlements and confirm the session stays signed in.
6. Open the public Dispatch page and submit ONE standalone package request.

## Why the dispatch request failed

The v11 booking payload contains new automation fields such as confirmedFare, riderEarning,
biserryCommission and commissionPercent. If the browser has v11 JavaScript while Firestore
still has the earlier rules, Firestore rejects the create.

v11.1 also makes creation of the sanitized tracking mirror non-fatal: if the booking itself is
saved but the tracking mirror is temporarily blocked during deployment, the customer is not
incorrectly told that the entire booking failed.

## Cost

No paid Firebase service is introduced by this hotfix.
