# Biserry v11 — Autonomous Launch Edition

This is the deployment candidate that replaces the earlier v10 prototype.

## What v11 changes

### 1. Admin login/session stability
- Explicit Firebase browser-local auth persistence.
- Admin pages wait for Firebase to restore the saved session before redirecting.
- Removes the immediate-login-then-logout race condition.
- Logout remains explicit.

### 2. Dispatch Autopilot
A GitHub Actions worker runs every 10 minutes, even when no Biserry admin browser is open.

For standalone dispatch it can:
- automatically quote a booking from the selected delivery-zone fare;
- apply Standard / Express / Scheduled multipliers;
- calculate rider earning and Biserry commission;
- synchronize submitted payment proofs into the booking state;
- wait for bank payment verification;
- automatically select an approved, active, available rider after payment is marked Paid;
- prefer zone-matching riders, then lower current workload, then fairer last-assignment order;
- reassign if a rider declines;
- reassign when an offer expires;
- stop after repeated failed attempts and surface an admin exception;
- expire old unpaid bookings automatically;
- publish an Autopilot heartbeat/status to the admin dashboard.

### 3. Human-by-exception operations
Routine path:
Customer → Auto Quote → Pay → Verify → Auto Match Rider → Rider Accepts → Delivery → Tracking.

Human action remains for:
- bank-transfer verification, because no reliable no-cost bank webhook is being assumed;
- missing/invalid delivery zone or fare;
- no available riders after repeated attempts;
- cancellations/disputes;
- manual override when needed.

### 4. Dispatcher app
- Standalone dispatch jobs appear in the existing rider PWA.
- Rider can Accept or Decline.
- Declined/expired assignments go back to Autopilot for reassignment.
- Rider progresses Picked Up → On the Way → Arrived → Delivered.
- Customer tracking mirrors each operational stage.

### 5. Free Google Drive backup
An optional weekly GitHub Action exports Biserry Firestore operational data into a private Google Drive folder as a compressed JSON backup.

No Google Drive credentials are exposed in website JavaScript.

## Files to deploy

Upload the package contents to the matching repository paths. Important additions/replacements:

- `.github/workflows/biserry-autopilot.yml`
- `.github/workflows/biserry-drive-backup.yml`
- `automation/package.json`
- `automation/biserry-autopilot.mjs`
- `automation/backup-to-drive.mjs`
- `js/firebase-service.js`
- `js/admin-auth.js`
- `js/admin-dashboard.js`
- `js/admin-dispatch-bookings.js`
- `js/dispatch.js`
- `js/dispatch-track.js`
- `admin/dashboard.html`
- `admin/dispatch-bookings.html`
- `dispatch.html`
- `dispatch-track.html`
- `dispatcher/index.html`
- `dispatcher/app.js`
- `dispatcher/service-worker.js`
- `service-worker.js`
- `firestore.rules.v11-autonomous-launch`

## Deployment order

1. Upload/replace the website files.
2. Replace Firestore Rules with `firestore.rules.v11-autonomous-launch` and Publish.
3. Test the admin login before configuring Autopilot.
4. Configure GitHub secret `FIREBASE_SERVICE_ACCOUNT`.
5. Run `Biserry Autopilot` manually once from GitHub Actions.
6. Confirm Admin Dashboard → Autopilot Health becomes Healthy.
7. Optionally configure Google Drive backup.
8. Run the end-to-end dispatch launch test.

See `SETUP-AUTOPILOT.md` and `SETUP-GOOGLE-DRIVE-BACKUP.md`.

## Cost guard

v11 does NOT require:
- Firebase Cloud Functions
- Firebase Storage
- Google Maps paid APIs
- WhatsApp Business API
- SMS
- automated bank-payment API

GitHub Actions is used as the unattended worker. Confirm the repository/account's current GitHub Actions allowance before relying on it at high volume.

