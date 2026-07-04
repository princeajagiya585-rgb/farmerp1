import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, X, MonitorSmartphone } from "lucide-react";
import { isInstallable, showInstallPrompt } from "../lib/pwa";

/**
 * Floating circular "Install App" button at the bottom-right corner.
 *
 * - Hidden when running in standalone (installed) mode
 * - Hidden after the app has been installed
 * - On click: triggers the PWA beforeinstallprompt if available
 * - Fallback: shows a small modal with manual install instructions
 */
export default function InstallAppButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

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

    // Also re-check every 3s in case the install prompt fires late
    const poll = setInterval(checkInstallable, 3000);

    return () => {
      window.removeEventListener("pwa-install-ready", onReady);
      window.removeEventListener("pwa-installed", onInstalled);
      mediaQuery.removeEventListener("change", displayHandler);
      clearInterval(poll);
    };
  }, [checkInstallable]);

  const handleClick = async () => {
    setInstalling(true);
    const accepted = await showInstallPrompt();
    if (accepted) {
      setVisible(false);
    } else {
      // If the prompt wasn't triggered (e.g. unsupported browser), show instructions
      if (!window.matchMedia("(display-mode: standalone)").matches) {
        setShowModal(true);
      }
    }
    setInstalling(false);
  };

  if (!visible && !showModal) return null;

  return (
    <>
      {/* Floating circular button */}
      {visible && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          {/* Tooltip (desktop only) */}
          <div
            className={`absolute bottom-full right-0 mb-3 hidden whitespace-nowrap rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-medium text-white shadow-lg transition-all duration-200 md:block ${
              tooltipVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-1 opacity-0 pointer-events-none"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <MonitorSmartphone size={13} />
              Install FarmERP
            </div>
            <div className="absolute right-4 top-full h-2 w-2 -translate-y-1 rotate-45 bg-gray-900" />
          </div>

          <button
            onClick={handleClick}
            disabled={installing}
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
            aria-label="Install FarmERP"
            className="group flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 disabled:opacity-70"
          >
            {installing ? (
              <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <Download size={22} className="transition-transform duration-300 group-hover:translate-y-0.5" />
            )}
          </button>
        </div>
      )}

      {/* Instructions modal (fallback when install prompt unavailable) */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm animate-fade-in rounded-2xl bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700">
                  <Download size={15} className="text-white" />
                </div>
                <h3 className="font-semibold text-gray-800">Install FarmERP</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-gray-500">
                Install FarmERP Pro as an app for a better experience with offline access.
              </p>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <h4 className="text-xs font-bold text-gray-800">Android (Chrome)</h4>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 text-[11px] text-gray-600">
                  <li>Tap the <strong>⋮</strong> menu icon in the top-right</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
                  <li>Tap <strong>"Install"</strong></li>
                </ol>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <h4 className="text-xs font-bold text-gray-800">Desktop (Chrome / Edge)</h4>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 text-[11px] text-gray-600">
                  <li>Click the <strong>install icon</strong> (➕) in the address bar</li>
                  <li>Or click <strong>⋮</strong> → <strong>"Install FarmERP Pro"</strong></li>
                  <li>Click <strong>"Install"</strong></li>
                </ol>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                <h4 className="text-xs font-bold text-gray-800">iPhone / iPad (Safari)</h4>
                <ol className="mt-1.5 list-inside list-decimal space-y-1 text-[11px] text-gray-600">
                  <li>Tap the <strong>Share</strong> icon at the bottom</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Add"</strong></li>
                </ol>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-5 py-3.5">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-green-500 hover:to-green-600"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
