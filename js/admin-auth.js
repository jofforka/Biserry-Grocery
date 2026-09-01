import {
  auth,
  authReady,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "./firebase-service.js";

import { ADMIN_EMAILS } from "./firebase-config.js";

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

function normalizedAdminEmails() {
  return (Array.isArray(ADMIN_EMAILS) ? ADMIN_EMAILS : [])
    .map(x => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

function isAuthorizedAdmin(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return !!user && normalizedAdminEmails().includes(email);
}

function ensureOpsNav() {
  document.querySelectorAll(".sidebar").forEach(sidebar => {
    const add = (href, text, beforeHref) => {
      if (sidebar.querySelector(`a[href="${href}"]`)) return;
      const link = document.createElement("a");
      link.href = href;
      link.textContent = text;
      const before = sidebar.querySelector(`a[href="${beforeHref}"]`);
      if (before) sidebar.insertBefore(link, before);
      else {
        const logout = sidebar.querySelector("#logoutBtn");
        logout ? sidebar.insertBefore(link, logout) : sidebar.appendChild(link);
      }
    };
    add("dispatch-bookings.html", "Dispatch Control", "dispatchers.html");
    add("dispatchers.html", "Dispatchers", "inventory-logs.html");
    add("dispatch-settlements.html", "Rider Settlements", "inventory-logs.html");
  });
}
ensureOpsNav();

async function definitiveAuthUser() {
  // First let persistence initialise.
  try { await authReady; } catch {}

  // If Firebase already restored the user, return immediately.
  if (auth.currentUser) return auth.currentUser;

  // Otherwise wait for the first definitive auth-state callback.
  return await new Promise(resolve => {
    let finished = false;
    const stop = onAuthStateChanged(
      auth,
      user => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        stop();
        resolve(user || null);
      },
      () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        stop();
        resolve(null);
      }
    );

    // Do not hang forever if a browser extension/network issue blocks Auth.
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      stop();
      resolve(auth.currentUser || null);
    }, 8000);
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const submit = loginForm.querySelector('button[type="submit"]');

    try {
      if (submit) submit.disabled = true;
      await authReady;

      const credential = await signInWithEmailAndPassword(auth, email, password);

      if (!isAuthorizedAdmin(credential.user)) {
        await signOut(auth);
        alert("This email is not authorized as admin.");
        return;
      }

      // Make sure Firebase has committed the signed-in state before navigation.
      await definitiveAuthUser();

      const next = new URLSearchParams(location.search).get("next");
      const safeNext = next && /^[a-z0-9._-]+\.html$/i.test(next) ? next : "dashboard.html";
      window.location.replace(safeNext);
    } catch (error) {
      console.error("Admin login failed", error);
      alert("Login failed: " + (error?.message || "Please try again."));
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await signOut(auth);
      window.location.replace("login.html");
    } finally {
      logoutBtn.disabled = false;
    }
  });
}

/*
 * v11.1 stability guard:
 * Redirect only after Firebase returns a definitive auth state.
 * This function is safe both for old pages that call it without await
 * and new pages that use: if (await protectAdminPage()) { ... }.
 */
export async function protectAdminPage() {
  const user = await definitiveAuthUser();

  if (!isAuthorizedAdmin(user)) {
    const target = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
    window.location.replace(`login.html?next=${target}`);
    return false;
  }

  document.documentElement.dataset.adminAuth = "ready";
  return true;
}
