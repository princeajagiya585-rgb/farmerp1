import { Leaf } from "lucide-react";

/**
 * A polished full-screen loading animation themed for the farm app.
 * Shows a pulsing Leaf icon with animated dots and a "Loading…" message.
 *
 * Props:
 * - message: custom loading text (default: "Loading…")
 * - fullScreen: whether to center in the viewport (default: true)
 * - size: size of the icon (default: "lg" — "sm" | "md" | "lg")
 */
export default function LoadingSpinner({
  message = "Loading…",
  fullScreen = true,
  size = "lg",
}) {
  const iconSize = size === "sm" ? 24 : size === "md" ? 36 : 48;
  const containerClass = fullScreen
    ? "fixed inset-0 z-50 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm dark:bg-slate-900/80"
    : "flex items-center justify-center py-12";

  return (
    <div className={containerClass}>
      <div className="flex flex-col items-center gap-4">
        {/* Animated icon */}
        <div className="relative">
          {/* Pulsing ring */}
          <div className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
          {/* Icon container */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/20">
            <Leaf
              size={iconSize}
              className="animate-pulse text-white"
              strokeWidth={2}
            />
          </div>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full bg-brand-500"
                style={{
                  animation: `loading-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Message */}
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
          {message}
        </p>
      </div>
    </div>
  );
}

/**
 * An inline loading skeleton with shimmer for page content areas.
 * Shows a set of placeholder bars that shimmer.
 *
 * Props:
 * - count: number of skeleton lines (default: 4)
 * - className: additional classes
 */
export function ContentSkeleton({ count = 4, className = "" }) {
  return (
    <div className={`space-y-3 p-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded-md"
          style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * A card skeleton for dashboard-style layouts.
 */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-3 w-20 rounded-md" />
          <div className="skeleton h-7 w-28 rounded-md" />
        </div>
        <div className="skeleton h-12 w-12 rounded-xl" />
      </div>
    </div>
  );
}
