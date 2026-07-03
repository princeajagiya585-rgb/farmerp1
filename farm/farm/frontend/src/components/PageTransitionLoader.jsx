import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "./LoadingSpinner";

const MIN_DISPLAY_MS = 500; // minimum time the spinner is visible
const FADE_DURATION_MS = 300;

/**
 * Wraps page content and shows a loading spinner animation whenever the route
 * changes. The spinner is displayed for at least `MIN_DISPLAY_MS` to prevent
 * flashing on fast transitions, then fades out to reveal the new page.
 *
 * Uses a two-phase approach:
 * 1. On route change → immediately show the spinner
 * 2. After `MIN_DISPLAY_MS` → fade spinner out and show content
 *    (spinner stays visible until the fade completes)
 * 3. Then mark "done" — content is fully visible
 */
export default function PageTransitionLoader({ children }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [phase, setPhase] = useState("done"); // "loading" | "entering" | "done"
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const prevKeyRef = useRef(location.key);

  // Track mount state for safe state updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const currentKey = location.key;

    // Skip the first render — only animate on actual navigations
    if (prevKeyRef.current === currentKey) {
      prevKeyRef.current = currentKey;
      return;
    }

    prevKeyRef.current = currentKey;

    // Clear any pending timer from previous navigation
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Route changed — show spinner immediately
    setPhase("loading");

    // Schedule the full transition sequence in a single chain,
    // with both callbacks tracked by timerRef so cleanup catches all.
    const scheduleTransition = () => {
      // Phase 1 → 2: After minimum display time, start fade-in
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setPhase("entering");

        // Phase 2 → 3: After fade animation completes, mark as done
        timerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setPhase("done");
          timerRef.current = null;
        }, FADE_DURATION_MS);
      }, MIN_DISPLAY_MS);
    };

    scheduleTransition();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [location.key]);

  const isLoading = phase === "loading";

  return (
    <div className="relative min-h-[200px]">
      {/* Loading overlay */}
      <div
        className={`absolute inset-0 z-10 transition-all duration-300 ${
          isLoading
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <LoadingSpinner
          fullScreen={false}
          size="md"
          message={t("common.loading")}
        />
      </div>

      {/* Page content */}
      <div
        className={`transition-opacity duration-300 ${
          phase === "loading" ? "opacity-0" : "opacity-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
