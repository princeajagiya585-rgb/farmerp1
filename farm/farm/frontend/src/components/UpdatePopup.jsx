import { useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Production-ready update notification popup.
 *
 * Shown when `useRegisterSW` detects a waiting service worker.
 * - "Update Now" → activates the new SW, clears old caches, reloads.
 * - "Later" → hides until the next full page refresh.
 *
 * The popup persists in-memory only, so on every fresh page load the
 * SW registration check runs and the popup re-appears if an update is
 * still available — exactly what the user requested.
 *
 * Works in every browser (Chrome / Edge / Android / installed PWA).
 * Does NOT touch localStorage, sessionStorage, or any user data.
 * Does NOT log the user out.
 */
export default function UpdatePopup({ needRefresh, updateServiceWorker }) {
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (!needRefresh || dismissed) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    // Brief pause so the user can see the updating state before the reload
    await new Promise((r) => setTimeout(r, 400));
    // updateServiceWorker posts SKIP_WAITING to the waiting SW, which
    // activates it. Workbox's activate handler automatically cleans up
    // stale precache entries — no manual cache clearing needed.
    updateServiceWorker();
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ animation: "update-fade-in 0.3s ease-out" }}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl"
        style={{ animation: "update-scale-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        {/* Dismiss (X) button — also acts as "Later" */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        <div className="p-6 text-center">
          {/* Animated refresh icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm">
            <RefreshCw
              size={28}
              className="text-white"
              style={{
                animation: updating
                  ? "update-spin 0.8s linear infinite"
                  : "update-float 2s ease-in-out infinite",
              }}
            />
          </div>

          <h2 className="text-xl font-extrabold text-gray-900">
            New Update Available
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            A new version of FarmERP is available. Update now to get the latest
            features and improvements.
          </p>
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
            onClick={() => setDismissed(true)}
            disabled={updating}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
