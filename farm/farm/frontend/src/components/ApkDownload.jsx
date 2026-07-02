import { Smartphone, Download } from "lucide-react";
import { APK_CONFIG } from "../config/apk";

/**
 * Small floating Android APK download button.
 * Renders a green circular button at the bottom-right of the page.
 * Only renders when VITE_APK_URL is configured.
 */
export default function ApkDownload() {
  if (!APK_CONFIG.isAvailable) return null;

  const handleDownload = () => {
    // Immediate download without navigating away
    const anchor = document.createElement("a");
    anchor.href = APK_CONFIG.downloadUrl;
    anchor.download = "farmerp-app.apk";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={handleDownload}
        title="Download Android App"
        className="group flex items-center gap-2 rounded-full bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-green-700 hover:shadow-xl active:scale-95 md:px-5 md:py-3.5"
      >
        <Smartphone size={18} className="shrink-0" />
        <span className="hidden sm:inline">Download APK</span>
        <Download size={16} className="shrink-0 transition-transform duration-300 group-hover:translate-y-0.5" />
      </button>
    </div>
  );
}
