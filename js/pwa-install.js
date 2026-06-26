/* Biserry PWA Install Prompt */
let deferredInstallPrompt = null;

const installBox = document.createElement("div");
installBox.className = "installPrompt";
installBox.innerHTML = `
  <div>
    <strong>Install Biserry Groceries</strong>
    <p>Shop faster from your phone like a real app.</p>
  </div>
  <button id="installAppBtn" type="button">Install</button>
  <button id="dismissInstallBtn" type="button" aria-label="Dismiss">×</button>
`;

function shouldShowInstallPrompt() {
  const dismissed = localStorage.getItem("biserryInstallDismissed");
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  return !dismissed && !isStandalone;
}

function showInstallPrompt() {
  if (!shouldShowInstallPrompt()) return;
  if (!document.body.contains(installBox)) document.body.appendChild(installBox);
  setTimeout(() => installBox.classList.add("show"), 500);
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallPrompt();
});

window.addEventListener("appinstalled", () => {
  localStorage.setItem("biserryInstallDismissed", "yes");
  installBox.remove();
});

document.addEventListener("click", async event => {
  if (event.target?.id === "dismissInstallBtn") {
    localStorage.setItem("biserryInstallDismissed", "yes");
    installBox.remove();
  }

  if (event.target?.id === "installAppBtn") {
    if (!deferredInstallPrompt) {
      alert("On iPhone: tap Share, then Add to Home Screen. On Android: open browser menu and tap Install App.");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBox.remove();
  }
});

setTimeout(() => {
  if (!deferredInstallPrompt && shouldShowInstallPrompt()) {
    showInstallPrompt();
  }
}, 2500);
