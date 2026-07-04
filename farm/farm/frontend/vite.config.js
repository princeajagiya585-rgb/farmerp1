import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const SW_VERSION = "v2.0"; // increment to force service-worker cache refresh

const pwaManifest = {
  name: "FarmERP Pro — Smart Farm Management",
  short_name: "FarmERP",
  description: "Enterprise Farm ERP platform for agricultural and plantation management — manage farms, workforce, finances, inventory, and GPS tracking.",
  theme_color: "#15803d",
  background_color: "#f0fdf4",
  display: "standalone",
  display_override: ["window-controls-overlay", "standalone"],
  orientation: "portrait-primary",
  start_url: "/",
  scope: "/",
  lang: "en",
  categories: ["agriculture", "business", "productivity", "farming"],
  id: "/",
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
    { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any" },
    { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
    { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
    { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
    { src: "/icons/icon-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
    { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
  ],
  screenshots: [],
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/*.png",
        "icons/*.svg",
        "logo.png",
        "favicon.png",
        "favicon.ico",
        "logo-mark-*.png",
      ],
      manifest: pwaManifest,
      workbox: {
        cacheId: `farmerp-${SW_VERSION}`,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,eot}"],
        // Cache the app shell and static assets on install (precache)
        // Network-first for API calls
        // Stale-while-revalidate for fonts and images
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
            // Cache media files (uploaded photos) for offline access
            urlPattern: /^https:\/\/farmerp-backend-production\.up\.railway\.app\/media\/.*/i,
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
      selfDestroying: false,
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/media": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["lucide-react", "recharts", "xlsx"],
          maps: ["leaflet", "react-leaflet", "@react-google-maps/api"],
          i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
