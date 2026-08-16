# Biserry Dispatch Module Setup

## What is included

- Public `dispatch.html` page showing only dispatchers whose `isPublic` field is `true`.
- Admin `admin/dispatchers.html` section for approval, activation and availability overrides.
- Installable dispatcher PWA in `dispatcher/`.
- Dispatcher self-registration using Firebase Authentication email/password.
- Real-time Firestore listener: when an approved dispatcher changes availability, the public Dispatch page updates automatically.
- Checkout now stores the last order locally and routes customers to `order-success.html`, where they can open the available dispatcher list.

## Dispatcher workflow

1. Dispatcher opens `/dispatcher/` and registers.
2. A `dispatchers` Firestore record is created as `isApproved:false`, `isAvailable:false`, `isPublic:false`.
3. Admin opens `/admin/dispatchers.html` and approves the profile.
4. Dispatcher signs into the mini app and taps the availability button.
5. When available, `isAvailable:true` and `isPublic:true`; when offline both return to false.
6. `dispatch.html` watches `isPublic == true` in real time, so the dispatcher appears/disappears without a manual reload.

## Security

The dispatcher app needs Firestore rules that let:

- the public read only active storefront products and public dispatcher profiles;
- signed-in dispatchers create their own pending profile;
- signed-in dispatchers change only their availability fields;
- the Biserry admin account manage all dispatcher fields.

A starting rules file is provided as `firestore.rules.dispatch-example`. Review your existing production rules before deploying it. Do not overwrite production Firestore rules blindly.

## Install on phone

- Android/Chrome: open `/dispatcher/` and use the in-app **Install Dispatcher App** button when shown.
- iPhone/Safari: open `/dispatcher/`, tap Share, then **Add to Home Screen**.
