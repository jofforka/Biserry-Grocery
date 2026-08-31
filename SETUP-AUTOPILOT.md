# Setup Biserry Autopilot

The browser alone cannot provide true unattended automation because browser JavaScript stops when nobody has the site open.

v11 therefore uses GitHub Actions as the background worker.

## Step A — Create a Firebase service-account key

In Google Cloud Console for project `biserry-groceries-os`:

1. Open IAM & Admin → Service Accounts.
2. Use a dedicated service account for Biserry automation.
3. Grant only the Firestore access needed for this automation. For initial setup, a project Firebase/Firestore administrative role can be used, then reduced after validation.
4. Create a JSON key.
5. Download the JSON file.
6. Never place it in the repository and never paste it into public JavaScript.

## Step B — Add the GitHub secret

Repository:
`jofforka/Biserry-Grocery`

Open:
Settings → Secrets and variables → Actions → New repository secret

Name:
`FIREBASE_SERVICE_ACCOUNT`

Value:
Paste the entire service-account JSON.

## Step C — Deploy v11 automation files

Ensure these repository paths exist:
- `.github/workflows/biserry-autopilot.yml`
- `automation/package.json`
- `automation/biserry-autopilot.mjs`

## Step D — Test manually

GitHub → Actions → Biserry Autopilot → Run workflow.

Expected:
- workflow succeeds;
- Firestore gets/updates `app_config/autopilotStatus`;
- Admin Dashboard shows Autopilot Health.

## Normal cadence

The workflow runs every 10 minutes.

GitHub scheduled workflows can occasionally start later than the exact cron minute, so the system is near-real-time rather than second-by-second.

## Automation settings

Optional Firestore document:

Collection:
`app_config`

Document:
`dispatchAutomation`

Supported fields:
- `enabled`: true/false
- `expressMultiplier`: default 1.30
- `scheduledMultiplier`: default 1.00
- `offerWindowMinutes`: default 15
- `maxAssignmentAttempts`: default 8
- `unpaidExpiryHours`: default 24

If the document does not exist, safe defaults are used.

## Payment verification

Bank-transfer verification remains deliberately human at launch. A submitted payment reference or receipt is not proof that funds actually reached Biserry.

After an admin verifies the transfer and clicks Mark Paid:
- no rider needs to be chosen manually;
- Autopilot matches and assigns a rider;
- declined or expired offers are automatically reassigned.

