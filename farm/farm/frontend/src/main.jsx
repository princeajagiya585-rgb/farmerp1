import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import App from "./App";
import { applyStoredTheme } from "./components/ThemeToggle";
import { initPWA } from "./lib/pwa";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./i18n";
import "./index.css";

// Initialize PWA: capture install prompt, prepare for SW updates
initPWA();

applyStoredTheme();

/** PWA update notification banner */
function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (process.env.NODE_ENV !== "production") {
        console.log("SW registered");
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 z-[99999] -translate-x-1/2 animate-slide-in">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-white px-5 py-3 shadow-soft">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">New version available</p>
          <p className="text-xs text-gray-500">Update to get the latest features and fixes.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => updateServiceWorker()}
            className="rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
          >
            Update Now
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

/** App root with PWA update banner */
function Root() {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <PwaUpdateBanner />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
