/**
 * Android APK download configuration.
 *
 * To update the APK download details, edit ONLY this file.
 * All components read from here — no hardcoded URLs elsewhere.
 */

export const APK_CONFIG = {
  // Direct download URL for the Android APK file.
  // Change this when a new build is uploaded.
  downloadUrl:
    import.meta.env.VITE_APK_DOWNLOAD_URL ||
    "https://farmerp-backend-production.up.railway.app/media/farmerp-app.apk",

  // Latest version information
  version: import.meta.env.VITE_APK_VERSION || "1.0.0",

  // APK file size in MB
  size: import.meta.env.VITE_APK_SIZE || "28.5 MB",

  // Last update date (ISO format)
  lastUpdated: import.meta.env.VITE_APK_LAST_UPDATED || "2026-07-02",

  // Human-readable last updated string
  lastUpdatedDisplay: "July 2, 2026",

  // App name
  appName: "FarmERP Pro",
};
