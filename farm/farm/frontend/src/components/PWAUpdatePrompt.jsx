import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────

const UPDATE_STORAGE_KEY = "farmerp:pwa-update-dismissed";

/**
 * Returns true if the user previously dismissed this specific SW version.
 * Prevents the popup from re-appearing on every navigation/re-render.
 */
function isDismissed(swVersion) {
  try {
    return localStorage.getItem(UPDATE_STORAGE_KEY) === swVersion;
  } catch {
    return false;
  }
}

function markDismissed(swVersion) {
  try {
    localStorage.setItem(UPDATE_STORAGE_KEY, swVersion);
  } catch {
    // localStorage unavailable (private browsing, storage full) — ignore
  }
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * PWAUpdatePrompt – production-ready service worker update dialog.
 *
 * Usage (in main.jsx or App.jsx):
 *   const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({ ... });
 *   <PWAUpdatePrompt needRefresh={needRefresh} updateServiceWorker={updateServiceWorker} />
 *
 * Props:
 *   needRefresh          – boolean from useRegisterSW, true when a new SW is waiting
 *   updateServiceWorker  – () => void, activates the waiting SW (posts SKIP_WAITING)
 */
export default function PWAUpdatePrompt({ needRefresh, updateServiceWorker }) {
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const versionRef = useRef(null);

  // Read the SW version from the build's cacheId for dismiss tracking.
  // Falls back to a timestamp if unavailable.
  useEffect(() => {
    try {
      const swScript = document.querySelector('script[src*="registerSW"]');
      versionRef.current =
        swScript?.getAttribute("src") || `v-${Date.now()}`;
    } catch {
      versionRef.current = `v-${Date.now()}`;
    }
  }, []);

  // Auto-dismiss if the user already dismissed this version
  useEffect(() => {
    if (versionRef.current && isDismissed(versionRef.current)) {
      setDismissed(true);
    }
  }, [versionRef.current]);

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setError(null);

    try {
      // Guard: serviceWorker not available in this context
      if (!("serviceWorker" in navigator)) {
        setError("Service Worker not supported in this browser.");
        setUpdating(false);
        return;
      }

      // Short delay so the user sees the updating state before reload
      await new Promise((r) => setTimeout(r, 500));

      // Activate the waiting service worker.
      // updateServiceWorker posts { type: "SKIP_WAITING" } to the waiting SW,
      // which triggers the activate event. Workbox's activate handler
      // automatically cleans up stale precache entries.
      updateServiceWorker();

      // The page will reload once the new SW takes control.
      // If the reload doesn't happen within 10s, force it as a fallback
      // (large cache cleanups on activate can take several seconds).
      const forceReloadTimer = setTimeout(() => {
        window.location.reload();
      }, 10000);

      // Listen for the controller change event that fires when the new SW
      // takes control. Clear the timer and reload immediately.
      const onControllerChange = () => {
        clearTimeout(forceReloadTimer);
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
        { once: true },
      );
    } catch (err) {
      console.error("[PWA] Update failed:", err);
      setError("Update failed. Please try again or reload the page.");
      setUpdating(false);
    }
  }, [updateServiceWorker]);

  const handleDismiss = useCallback(() => {
    if (versionRef.current) {
      markDismissed(versionRef.current);
    }
    setDismissed(true);
  }, []);

  // Don't render if there's no update or user dismissed
  if (!needRefresh || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ animation: "pwa-fade-in 0.3s ease-out" }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl"
        style={{
          animation: "pwa-scale-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Dismiss (X) button */}
        <button
          onClick={handleDismiss}
          disabled={updating}
          className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        <div className="p-6 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm">
            <RefreshCw
              size={28}
              className="text-white"
              style={{
                animation: updating
                  ? "pwa-spin 0.8s linear infinite"
                  : "pwa-float 2s ease-in-out infinite",
              }}
            />
          </div>

          <h2 className="text-xl font-extrabold text-gray-900">
            New Update Available
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            A new version of FarmERP Pro is available.
          </p>

          {/* Error message */}
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800 hover:shadow-md active:scale-[0.98] disabled:opacity-60"
          >
            {updating ? (
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={16} className="animate-spin" />
                Updating…
              </span>
            ) : (
              "Update Now"
            )}
          </button>

          <button
            onClick={handleDismiss}
            disabled={updating}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            Later
          </button>
        </div>
      </div>

      {/* Keyframe <style> injected once */}
      <style>{`
        @keyframes pwa-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pwa-scale-in {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes pwa-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pwa-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
