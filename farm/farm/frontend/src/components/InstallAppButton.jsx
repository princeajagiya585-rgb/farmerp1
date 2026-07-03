import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, MonitorSmartphone, X } from "lucide-react";
import { isInstallable, showInstallPrompt } from "../lib/pwa";

/**
 * "Install App" button — shown only when the app is not installed and
 * the browser supports installation.
 */
export default function InstallAppButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);

  const checkInstallable = useCallback(() => {
    if (dismissed) return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || window.navigator.standalone === true;
    if (isStandalone) {
      setVisible(false);
      return;
    }
    setVisible(isInstallable());
  }, [dismissed]);

  useEffect(() => {
    checkInstallable();

    const onInstalled = () => setVisible(false);
    window.addEventListener("pwa-install-ready", checkInstallable);
    window.addEventListener("pwa-installed", onInstalled);

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const displayHandler = () => setVisible(false);
    mediaQuery.addEventListener("change", displayHandler);

    return () => {
      window.removeEventListener("pwa-install-ready", checkInstallable);
      window.removeEventListener("pwa-installed", onInstalled);
      mediaQuery.removeEventListener("change", displayHandler);
    };
  }, [checkInstallable]);

  const handleInstall = async () => {
    setInstalling(true);
    const accepted = await showInstallPrompt();
    if (accepted) setVisible(false);
    setInstalling(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  if (!visible && !showInstructions) return null;

  return (
    <>
      {visible && !showInstructions && (
        <div className="fixed bottom-4 left-4 right-4 z-[9998] animate-slide-in-up md:left-auto md:right-6 md:bottom-6 md:w-96">
          <div className="relative overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-600 to-brand-700 p-4 shadow-soft">
            <button
              onClick={handleDismiss}
              className="absolute right-2 top-2 rounded-lg p-1 text-white/70 hover:bg-white/20 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Download size={24} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white">Install FarmERP Pro</h4>
                <p className="mt-0.5 text-xs text-brand-100">
                  Install as an app for a better experience with offline access.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 disabled:opacity-60"
                  >
                    <MonitorSmartphone size={14} />
                    {installing ? "Installing..." : "Install App"}
                  </button>
                  <button
                    onClick={() => setShowInstructions(true)}
                    className="rounded-xl px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    How to install
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5" />
            <div className="absolute -bottom-6 -left-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md animate-fade-in rounded-2xl bg-white shadow-lift">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h3 className="font-semibold text-gray-800">Install FarmERP Pro</h3>
              <button onClick={() => setShowInstructions(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-gray-50 p-4">
                <h4 className="text-sm font-bold text-gray-800">Android (Chrome)</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-gray-600">
                  <li>Tap the <strong>⋮</strong> (menu) icon in the top-right</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
                  <li>Tap <strong>"Install"</strong></li>
                </ol>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <h4 className="text-sm font-bold text-gray-800">Desktop (Chrome/Edge)</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-gray-600">
                  <li>Click the <strong>install icon</strong> (➕) in the address bar</li>
                  <li>Or click <strong>⋮</strong> → <strong>"Install FarmERP Pro"</strong></li>
                  <li>Click <strong>"Install"</strong></li>
                </ol>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <h4 className="text-sm font-bold text-gray-800">Samsung Internet</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-gray-600">
                  <li>Tap the <strong>⋮</strong> (menu) icon at the bottom</li>
                  <li>Tap <strong>"Add page to"</strong> → <strong>"Home screen"</strong></li>
                </ol>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <h4 className="text-sm font-bold text-gray-800">iPhone/iPad (Safari)</h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-gray-600">
                  <li>Tap the <strong>Share</strong> icon at the bottom</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Add"</strong></li>
                </ol>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-5 py-3.5">
              <button
                onClick={() => { setShowInstructions(false); setDismissed(false); }}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
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
