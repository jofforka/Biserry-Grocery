import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
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

if (FREE_MAX?.appCheckSiteKey) {
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(
      "https://www.gstatic.com/firebasejs/12.15.0/firebase-app-check.js"
    );
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(FREE_MAX.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) {
    console.warn("App Check initialization skipped", e?.message || e);
  }
}

try {
  const { getPerformance } = await import(
    "https://www.gstatic.com/firebasejs/12.15.0/firebase-performance.js"
  );
  getPerformance(app);
} catch (e) {
  console.warn("Performance Monitoring unavailable", e?.message || e);
}

if (FREE_MAX?.analyticsMeasurementId) {
  try {
    const { getAnalytics } = await import(
      "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js"
    );
    getAnalytics(app);
  } catch (e) {
    console.warn("Analytics initialization skipped", e?.message || e);
  }
}

export const auth = getAuth(app);

/*
 * v11 admin/session stability:
 * Explicitly use browser-local persistence and expose one readiness promise.
 * Pages should await authReady before deciding that a user is signed out.
 */
export const authReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
    }
  } catch (e) {
    console.warn("Auth persistence initialization warning", e?.message || e);
  }
  return auth.currentUser;
})();

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
