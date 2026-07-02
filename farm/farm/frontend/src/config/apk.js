/**
 * Android APK download configuration.
 *
 * Set VITE_APK_URL in your .env or Vercel dashboard.
 * Example: VITE_APK_URL=https://your-domain.com/app-release.apk
 */

export const APK_CONFIG = {
  // Direct download URL for the Android APK file.
  // Set VITE_APK_URL in your environment variables.
  // If unset, the download button will not appear.
  downloadUrl: import.meta.env.VITE_APK_URL || "",

  // App name
  appName: "FarmERP Pro",

  // Whether the APK URL is configured and available
  get isAvailable() {
    return Boolean(this.downloadUrl);
  },
};
