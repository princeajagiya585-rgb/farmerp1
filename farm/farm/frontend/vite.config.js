import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const SW_VERSION = "v4.0"; // Increment to force service worker cache refresh

// When the Django dev server isn't running, the proxy fails with ECONNREFUSED and
// Vite answers every API call with a bare 500. That reads like a backend bug and
// makes *every page* look broken, so spell out the real cause instead.
const BACKEND_TARGET = "http://127.0.0.1:8000";

function explainProxyFailure(proxy) {
  proxy.on("error", (err, _req, res) => {
    const offline = err.code === "ECONNREFUSED" || err.code === "ECONNRESET";
    const detail = offline
      ? `Backend not reachable at ${BACKEND_TARGET}. Start it with: cd backend && venv/Scripts/python manage.py runserver 8000`
      : `Proxy error talking to ${BACKEND_TARGET}: ${err.message}`;

    console.error(`\n[vite-proxy] ${detail}\n`);

    // res is a plain ServerResponse for HTTP, but a raw Socket for websocket
    // upgrades — only the former can carry a status line.
    if (!res || typeof res.writeHead !== "function" || res.headersSent) return;
    res.writeHead(offline ? 503 : 502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail, code: err.code }));
  });
}

const pwaManifest = {
  name: "FarmERP Pro — Smart Farm Management",
  short_name: "FarmERP",
  description: "Enterprise Farm ERP platform for agricultural and plantation management — manage farms, workforce, finances, inventory, and GPS tracking.",
  theme_color: "#15803d",
  background_color: "#f0fdf4",
  display: "standalone",
  display_override: ["window-controls-overlay", "standalone"],
  orientation: "any",
  start_url: "/",
  scope: "/",
  lang: "en",
  categories: ["agriculture", "business", "productivity", "farming"],
  id: "/",
  permissions: [
    "geolocation",
    "camera",
    "notifications",
  ],
  shortcuts: [
    {
      name: "Dashboard",
      short_name: "Dashboard",
      description: "View your farm dashboard",
      url: "/",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Tasks",
      short_name: "Tasks",
      description: "View your tasks",
      url: "/tasks",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Attendance",
      short_name: "Attendance",
      description: "Mark attendance",
      url: "/attendance",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Profile",
      short_name: "Profile",
      description: "View your profile",
      url: "/profile",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
  ],
  icons: [
    { src: "/icons/icon-32.png", sizes: "32x32", type: "image/png", purpose: "any" },
    { src: "/icons/icon-64.png", sizes: "64x64", type: "image/png", purpose: "any" },
    { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any" },
    { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
    { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
    { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
    { src: "/icons/icon-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
    { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
    { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  screenshots: [],
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The service worker caused stale versions and reload loops in the
      // field. selfDestroying ships a SW that unregisters itself and wipes
      // all caches on every user's device — the app then always loads fresh
      // from the network (hashed assets are still cached by normal HTTP
      // caching). Home-screen install via the manifest keeps working.
      selfDestroying: true,
      registerType: "autoUpdate",

      includeAssets: [
        "icons/*.png",
        "logo.png",
        "favicon.png",
        "favicon.ico",
        "apple-touch-icon-152.png",
        "apple-touch-icon-180.png",
      ],
      manifest: pwaManifest,
      workbox: {
        cacheId: `farmerp-${SW_VERSION}`,
        globPatterns: ["**/*.{js,css,html,png,ico,woff,woff2,ttf,eot}"],
        // Activate the new SW and take over open tabs immediately so every
        // deploy reaches users on their next load.
        skipWaiting: true,
        clientsClaim: true,
        // Runtime caching rules
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/v1\/auth\/.*/i,
            handler: "NetworkOnly",
            options: {
              cacheName: "api-auth-cache",
            },
          },
          {
            urlPattern: /\/api\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/media\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "media-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: explainProxyFailure,
      },
      "/media": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: explainProxyFailure,
      },
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          // icons load with the shell; recharts only with pages that chart.
          // xlsx is dynamically imported (lib/export.js) so rollup gives it
          // its own lazy chunk — do NOT list it here or it turns eager.
          icons: ["lucide-react"],
          charts: ["recharts"],
          maps: ["leaflet", "react-leaflet", "@react-google-maps/api"],
          i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
