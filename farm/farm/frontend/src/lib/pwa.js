/**
 * PWA utility module.
 *
 * Handles:
 * - beforeinstallprompt event for Install App button
 * - Push notification subscription (ready for future use)
 *
 * Service worker update handling is done via useRegisterSW
 * from virtual:pwa-register/react in main.jsx.
 */

let installPromptEvent = null;

// ── Install Prompt ────────────────────────────────────────────────────

/**
 * Listen for the beforeinstallprompt event. Saved for later use by the
 * Install App button component. The event is captured once and stored.
 */
export function captureInstallPrompt() {
  const onBeforeInstall = (e) => {
    e.preventDefault();
    installPromptEvent = e;
    window.dispatchEvent(new CustomEvent("pwa-install-ready", { detail: true }));
  };

  const onInstalled = () => {
    installPromptEvent = null;
    window.dispatchEvent(new CustomEvent("pwa-installed"));
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);

  // Return cleanup function
  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/**
 * Returns true if the browser supports the beforeinstallprompt event
 * AND the event has been fired (i.e., the app is not yet installed).
 */
export function isInstallable() {
  return installPromptEvent !== null;
}

/**
 * Trigger the saved install prompt. Returns true if the prompt was shown.
 */
export async function showInstallPrompt() {
  if (!installPromptEvent) return false;
  installPromptEvent.prompt();
  const result = await installPromptEvent.userChoice;
  installPromptEvent = null;
  return result.outcome === "accepted";
}

// ── Push Notification Preparation (future use) ────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * Subscribe to push notifications. Call when user enables notifications.
 * @param {string} vapidPublicKey - VAPID public key from the server
 * @returns {Promise<PushSubscription|null>}
 */
export async function subscribeToPush(vapidPublicKey) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return subscription;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return null;
  }
}

/**
 * Get the current push subscription (if any).
 */
export async function getPushSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// ── PWA Init ──────────────────────────────────────────────────────────

/**
 * Full PWA setup — call once from main.jsx.
 * Captures install prompt.
 */
export function initPWA() {
  captureInstallPrompt();
}
