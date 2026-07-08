import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import App from "./App";
import { applyStoredTheme } from "./components/ThemeToggle";
import { initPWA } from "./lib/pwa";
import { useRegisterSW } from "virtual:pwa-register/react";

import "./i18n";
import "./index.css";

// Initialize PWA: capture install prompt
initPWA();

applyStoredTheme();

/** PWA root — registers the auto-updating Service Worker */
function PwaUpdateRoot() {
  useRegisterSW({
    onRegistered() {
      if (process.env.NODE_ENV !== "production") {
        console.log("ServiceWorker registered");
      }
    },
    onRegisterError(error) {
      console.error("ServiceWorker registration error:", error);
    },
  });

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PwaUpdateRoot />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
