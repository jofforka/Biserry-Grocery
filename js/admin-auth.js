import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "./firebase-service.js";

import { ADMIN_EMAILS } from "./firebase-config.js";

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      if (!ADMIN_EMAILS.includes(userCredential.user.email.toLowerCase())) {
        await signOut(auth);
        alert("This email is not authorized as admin.");
        return;
      }

      window.location.href = "dashboard.html";
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

export function protectAdminPage() {
  onAuthStateChanged(auth, (user) => {
    if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      window.location.href = "login.html";
    }
  });
}
