export const firebaseConfig = {
  apiKey: "AIzaSyDH5p5LyIjimkHpIvJy2Jh5rkPSYzylzS8",
  authDomain: "biserry-groceries-os.firebaseapp.com",
  projectId: "biserry-groceries-os",
  storageBucket: "biserry-groceries-os.firebasestorage.app",
  messagingSenderId: "758590070159",
  appId: "1:758590070159:web:6a0effae0aa74662d5fffa"
};

export const ADMIN_EMAILS = [
  "admin@biserry.com"
];

// Populate this with the exact Firebase UID shown in Biserry OS > Admin Security.
// Once populated, the frontend will use UID authorization instead of email fallback.
export const ADMIN_UIDS = [];
export const BUSINESS = {
  name: "Biserry Groceries",
  phone: "+234 810 058 4211",
  whatsapp: "2348100584211",
  orderWhatsapp: "2348118103510",
  backupWhatsapp: "2348137216136",
  legacyHomepagePhone: "+234 810 058 4211",
  address: "Amac Market, Abuja",
  instagram: "@biserry_groceries",
  currency: "NGN"
};

// v8 Free-Max optional no-cost platform services.
// Leave blank until configured in Firebase Console. Never place private secrets here.
export const FREE_MAX = {
  appCheckSiteKey: "6LcG5ZwtAAAAAIKo7dgchM2eN_u9qxTdzj151100", // reCAPTCHA Enterprise public site key
  analyticsMeasurementId: "" // e.g. G-XXXXXXXXXX
};
