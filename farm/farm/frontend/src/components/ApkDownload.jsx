import { Smartphone, Download, Info, Calendar, Hash, HardDrive, CheckCircle } from "lucide-react";
import { APK_CONFIG } from "../config/apk";

/**
 * Detect if the user is on an Android device via user-agent sniffing.
 */
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

/**
 * Detect if the user is on iOS (iPhone / iPad / iPod).
 */
function isIOS() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

export default function ApkDownload() {
  const isAndroidUser = isAndroid();
  const isIOSUser = isIOS();

  const heading = isAndroidUser
    ? `📱 Install ${APK_CONFIG.appName}`
    : `📱 Download ${APK_CONFIG.appName} Android App`;

  const buttonLabel = isAndroidUser
    ? "Install FarmerP App"
    : isIOSUser
      ? "Download Android APK"
      : "Download Android APK";

  const subtitle = isAndroidUser
    ? "Install the native app for a better experience with GPS tracking, offline support, and faster performance."
    : "Get the Android APK for GPS tracking, attendance check-in, and offline field operations.";

  const handleDownload = () => {
    // Create an invisible anchor and click it for an immediate download.
    const anchor = document.createElement("a");
    anchor.href = APK_CONFIG.downloadUrl;
    anchor.download = `farmerp-app-v${APK_CONFIG.version}.apk`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div className="border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mb-8 text-center">
          <h3 className="text-xl font-bold text-gray-800 sm:text-2xl">
            {heading}
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500">
            {subtitle}
          </p>
        </div>

        {/* Main content card */}
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
          <div className="flex flex-col md:flex-row">
            {/* Left: app info */}
            <div className="flex-1 space-y-4 p-6">
              <div className="flex items-start gap-4">
                {/* Android icon placeholder */}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm">
                  <Smartphone size={28} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-800">
                    {APK_CONFIG.appName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                    <CheckCircle size={14} className="text-green-500" />
                    <span>Signed APK · No root required</span>
                  </p>
                </div>
              </div>

              {/* Version info grid */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <Hash size={15} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Version
                    </p>
                    <p className="text-sm font-bold text-gray-800">
                      {APK_CONFIG.version}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <HardDrive size={15} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Size
                    </p>
                    <p className="text-sm font-bold text-gray-800">
                      {APK_CONFIG.size}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <Calendar size={15} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Last Updated
                    </p>
                    <p className="text-sm font-bold text-gray-800">
                      {APK_CONFIG.lastUpdatedDisplay}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <Info size={15} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Platform
                    </p>
                    <p className="text-sm font-bold text-gray-800">Android</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: CTA */}
            <div className="flex flex-col items-center justify-center gap-4 border-t border-gray-100 bg-gradient-to-b from-gray-50/50 to-white p-6 md:border-l md:border-t-0 md:px-8">
              <div className="hidden rounded-full bg-brand-50 p-3 md:block">
                <Smartphone size={32} className="text-brand-600" />
              </div>
              <button
                onClick={handleDownload}
                className="inline-flex w-full max-w-[220px] items-center justify-center gap-2.5 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 hover:shadow-md active:scale-[0.98]"
              >
                <Download size={18} />
                {buttonLabel}
              </button>
              <p className="text-center text-[11px] text-gray-400">
                APK v{APK_CONFIG.version} · {APK_CONFIG.size} · Direct download
              </p>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            Virus scanned
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            Google Play compliant
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" />
            Regular updates
          </span>
        </div>
      </div>
    </div>
  );
}
