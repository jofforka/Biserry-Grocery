# Optional Google Drive Backup Setup

v11 includes a weekly private Firestore backup to Google Drive.

## Why Drive is used this way

Google Drive is useful as a no-cost archive, but it is not used as an unauthenticated public upload target. Website visitors never receive Drive credentials.

## Setup

1. In Google Cloud, enable the Google Drive API for the project/service account used by Biserry automation.
2. In your normal Google Drive account, create a private folder such as:
   `Biserry System Backups`
3. Share that folder with the service account email from the Firebase service-account JSON.
4. Copy the Drive folder ID.
5. In GitHub:
   Settings → Secrets and variables → Actions → New repository secret
6. Create:
   `GOOGLE_DRIVE_FOLDER_ID`
7. Paste only the folder ID as its value.
8. GitHub → Actions → Biserry Weekly Google Drive Backup → Run workflow.

The same `FIREBASE_SERVICE_ACCOUNT` secret is reused securely by GitHub Actions.

## Schedule

The backup runs weekly and can also be run manually.

## Backup contents

The compressed JSON archive includes:
- products
- orders / order tracking
- payment-proof metadata
- dispatchers / dispatch jobs
- standalone dispatch bookings / tracking / payment-proof metadata
- delivery zones
- customers
- settings / app_config

The Drive folder should remain private because the backup contains business and customer information.
