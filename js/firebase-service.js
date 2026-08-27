import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  limit,
  startAfter,
  getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import { firebaseConfig, FREE_MAX } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// v8 Free-Max observability/security. Performance Monitoring is no-cost.
// App Check and Analytics initialize only after their public console values are configured.
try {
  const { getPerformance } = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-performance.js");
  getPerformance(app);
} catch (e) { console.warn("Performance Monitoring unavailable", e?.message || e); }

if (FREE_MAX?.appCheckSiteKey) {
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js");
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(FREE_MAX.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
    // Request one token in monitoring mode so Firebase App Check metrics can
    // confirm that the deployed Biserry web app is attesting successfully.
    getToken(appCheck, false)
      .then(() => console.info("Biserry App Check: reCAPTCHA Enterprise token ready"))
      .catch((e) => console.warn("Biserry App Check token not ready", e?.message || e));
  } catch (e) { console.warn("App Check initialization skipped", e?.message || e); }
}

if (FREE_MAX?.analyticsMeasurementId) {
  try {
    const { getAnalytics } = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js");
    getAnalytics(app);
  } catch (e) { console.warn("Analytics initialization skipped", e?.message || e); }
}

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  limit,
  startAfter,
  getCountFromServer
};
