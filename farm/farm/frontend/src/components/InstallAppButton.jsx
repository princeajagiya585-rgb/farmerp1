import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { isInstallable, showInstallPrompt } from "../lib/pwa";

/**
 * Small floating circular "Install App" button at the bottom-right corner.
 *
 * - Hidden when running in standalone (installed) mode
 * - Hidden after the app has been installed
 * - On click: triggers the PWA beforeinstallprompt if available
 * - No tooltip, no instructions modal — just a simple circle
 */
export default function InstallAppButton() {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  const checkInstallable = useCallback(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) {
      setVisible(false);
      return;
    }
    setVisible(isInstallable());
  }, []);

  useEffect(() => {
    checkInstallable();

    const onInstalled = () => setVisible(false);
    const onReady = () => checkInstallable();
    window.addEventListener("pwa-install-ready", onReady);
    window.addEventListener("pwa-installed", onInstalled);

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const displayHandler = () => setVisible(false);
    mediaQuery.addEventListener("change", displayHandler);

    const poll = setInterval(checkInstallable, 3000);

    return () => {
      window.removeEventListener("pwa-install-ready", onReady);
      window.removeEventListener("pwa-installed", onInstalled);
      mediaQuery.removeEventListener("change", displayHandler);
      clearInterval(poll);
    };
  }, [checkInstallable]);

  const handleClick = async () => {
    if (installing) return;
    setInstalling(true);
    const accepted = await showInstallPrompt();
    if (accepted) {
      setVisible(false);
    }
    setInstalling(false);
  };

  if (!visible) return null;

  return (
    <button
      onClick={handleClick}
      disabled={installing}
      aria-label="Install FarmERP"
      className="fixed bottom-6 right-6 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-70"
    >
      {installing ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <Download size={16} className="transition-transform duration-300 group-hover:translate-y-0.5" />
      )}
    </button>
  );
}
