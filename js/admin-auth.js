import {
  auth,
  authReady,
  signInWithEmailAndPassword,
  signOut
} from "./firebase-service.js";

import { ADMIN_EMAILS } from "./firebase-config.js";

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

function isAuthorizedAdmin(user) {
  const email = String(user?.email || "").toLowerCase();
  return !!user && ADMIN_EMAILS.map(x => x.toLowerCase()).includes(email);
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

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const submit = loginForm.querySelector('button[type="submit"]');

    try {
      submit && (submit.disabled = true);
      await authReady;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      if (!isAuthorizedAdmin(userCredential.user)) {
        await signOut(auth);
        alert("This email is not authorized as admin.");
        return;
      }

      window.location.replace("dashboard.html");
    } catch (error) {
      alert("Login failed: " + error.message);
    } finally {
      submit && (submit.disabled = false);
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
 * v11: do not redirect while Firebase is still restoring its persisted session.
 * This fixes the "login then immediately kicked back out" race.
 */
export async function protectAdminPage() {
  await authReady;
  const user = auth.currentUser;

  if (!isAuthorizedAdmin(user)) {
    const target = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
    window.location.replace(`login.html?next=${target}`);
    return false;
  }

  document.documentElement.dataset.adminAuth = "ready";
  return true;
}
