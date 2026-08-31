import admin from "firebase-admin";
import { google } from "googleapis";
import { gzipSync } from "node:zlib";
import { Readable } from "node:stream";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT.");
if (!folderId) {
  console.log("GOOGLE_DRIVE_FOLDER_ID is not configured. Drive backup skipped.");
  process.exit(0);
}

const serviceAccount = JSON.parse(raw);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});
const db = admin.firestore();

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});
const drive = google.drive({ version: "v3", auth });

const COLLECTIONS = [
  "products",
  "orders",
  "orderTracking",
  "paymentProofs",
  "dispatchers",
  "dispatchRequests",
  "dispatchBookings",
  "dispatchBookingTracking",
  "dispatchPaymentProofs",
  "delivery_zones",
  "customers",
  "settings",
  "app_config"
];

async function dumpCollection(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

const payload = {
  schema: "biserry-backup-v11",
  projectId: serviceAccount.project_id,
  createdAt: new Date().toISOString(),
  collections: {}
};

for (const name of COLLECTIONS) {
  payload.collections[name] = await dumpCollection(name);
  console.log(`${name}: ${payload.collections[name].length}`);
}

const json = JSON.stringify(payload);
const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const name = `biserry-backup-${stamp}.json.gz`;

const result = await drive.files.create({
  requestBody: {
    name,
    parents: [folderId],
    description: "Automated Biserry OS Firestore backup. Keep this Drive folder private."
  },
  media: {
    mimeType: "application/gzip",
    body: Readable.from(gz)
  },
  fields: "id,name,createdTime"
});

console.log("Drive backup created:", result.data);
