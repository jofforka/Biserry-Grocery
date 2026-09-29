import {
  auth,
  authReady,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "./firebase-service.js";

import { ADMIN_EMAILS, ADMIN_UIDS } from "./firebase-config.js";

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

function normalizedAdminEmails() {
  return (Array.isArray(ADMIN_EMAILS) ? ADMIN_EMAILS : [])
    .map(x => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizedAdminUids() {
  return (Array.isArray(ADMIN_UIDS) ? ADMIN_UIDS : [])
    .map(x => String(x || "").trim())
    .filter(Boolean);
}

function isAuthorizedAdmin(user) {
  if (!user) return false;
  const uids = normalizedAdminUids();
  if (uids.length) return uids.includes(String(user.uid || "").trim());
  const email = String(user.email || "").trim().toLowerCase();
  return normalizedAdminEmails().includes(email);
}

function ensureOpsNav() {
  const items=[
    ["dashboard.html","Dashboard"],
    ["products.html","Products"],
    ["bulk-upload.html","Bulk Upload"],
    ["orders.html","Orders"],
    ["payments.html","Payments"],
    ["customers.html","Customers"],
    ["reports.html","Reports"],
    ["delivery-zones.html","Delivery Zones"],
    ["dispatch-bookings.html","Dispatch Control"],
    ["dispatchers.html","Dispatchers"],
    ["dispatch-settlements.html","Rider Settlements"],
    ["inventory-logs.html","Inventory Logs"],
    ["../index.html","View Store"]
  ];
  const current=location.pathname.split("/").pop()||"dashboard.html";
  document.querySelectorAll(".sidebar").forEach(sidebar=>{
    sidebar.querySelectorAll(":scope > a").forEach(a=>a.remove());
    let toggle=sidebar.querySelector(".adminNavToggle");
    if(!toggle){
      toggle=document.createElement("button");
      toggle.type="button";
      toggle.className="adminNavToggle";
      toggle.textContent="☰ Admin Menu";
      const title=sidebar.querySelector("h2");
      title?.insertAdjacentElement("afterend",toggle);
    }
    const logout=sidebar.querySelector("#logoutBtn");
    for(const [href,label] of items){
      const link=document.createElement("a");
      link.href=href;
      link.textContent=label;
      if(href===current)link.classList.add("active");
      logout?sidebar.insertBefore(link,logout):sidebar.appendChild(link);
    }
    const compact=window.matchMedia?.("(max-width: 1100px)")?.matches;
    sidebar.classList.toggle("navCollapsed",Boolean(compact));
    toggle.setAttribute("aria-expanded",String(!compact));
    toggle.addEventListener("click",()=>{
      const collapsed=sidebar.classList.toggle("navCollapsed");
      toggle.setAttribute("aria-expanded",String(!collapsed));
    });
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
        alert("This Firebase account is not authorized as admin.");
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
