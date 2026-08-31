# Biserry Dispatch v9 — Booking Funnel

Purpose
-------
Transforms the existing Dispatch page from a rider list into a premium booking experience inspired by the core convenience pattern used by modern appointment/booking products: choose service → choose timing → submit a confirmed request.

What this patch changes
-----------------------
1. dispatch.html
   - Premium Biserry Dispatch landing/booking experience.
   - Two modes: "Biserry Order" and "Send a Package".
   - Keeps the existing Biserry-order-to-dispatcher workflow.
   - Adds standalone delivery booking.

2. js/dispatch.js
   - Preserves existing order lookup and live dispatcher rendering.
   - Reads active `delivery_zones` for estimates.
   - Adds Standard / Express / Scheduled service options.
   - Adds ASAP / scheduled pickup.
   - Creates standalone requests in `dispatchBookings`.
   - Shows a booking reference and WhatsApp support link.

3. css/dispatch-v9.css
   - New mobile-first premium UI.
   - App-like cards, tabs, service selection, fare estimate and success modal.

4. service-worker.js
   - Cache version bumped so the new Dispatch UI reaches returning PWA users.

5. firestore.rules.dispatchBookings-snippet.txt
   - IMPORTANT: this is a rule SNIPPET only.
   - Add it inside the existing Firestore `/documents` block.
   - Do not replace your full production rules file with this snippet.

Deployment order
----------------
A. Upload/replace:
   dispatch.html
   js/dispatch.js
   css/dispatch-v9.css
   service-worker.js

B. In Firebase Firestore Rules, add the `dispatchBookings` match block from:
   firestore.rules.dispatchBookings-snippet.txt

C. Publish the Firestore rules.

D. Test:
   - Dispatch → Send a Package.
   - Choose zone.
   - Enter pickup/drop-off/contact details.
   - Submit.
   - Confirm a new `dispatchBookings` document appears.
   - Confirm the success modal shows a booking reference.

Cost / Spark plan
-----------------
This phase uses the existing static website + Firestore reads/writes only.
No Cloud Functions, Maps API, paid routing API, payment gateway or Firebase Storage is added.
Express fare is shown as a 30% estimate over the configured zone fee; final fare remains subject to confirmation.

Recommended next phase
----------------------
Admin Dispatch Control Tower:
New → Quoted → Awaiting Payment → Ready → Assigned → Picked Up → In Transit → Delivered.
Then connect standalone bookings to the existing rider mini-app and rider settlement workflow.
