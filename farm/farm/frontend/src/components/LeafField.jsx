/**
 * Text field for the "Create Super Admin Account" card.
 *
 * Deliberately NOT the shared `Input` from components/ui — that one is used by
 * every other page and must stay neutral. This variant carries the sign-up
 * card's tree theme: a leaf-asymmetric corner radius, and a leaf marker that
 * fills in once the field has a value, echoing the leaf that field grows on
 * the tree above.
 */
import { useId, useState } from "react";

// Outline when empty, solid when answered — the same silhouette as the tree's
// leaves so the connection between a field and its leaf is legible.
function LeafMark({ filled, invalid }) {
  const stroke = invalid ? "#d97706" : filled ? "#15803d" : "#9ca3af";
  return (
    <svg
      viewBox="-12 -12 24 24"
      className="h-3.5 w-3.5 shrink-0 transition-transform duration-300"
      style={{ transform: filled ? "rotate(0deg) scale(1)" : "rotate(-18deg) scale(.86)" }}
      aria-hidden="true"
    >
      <path
        d="M0,-11 C7,-8 11,-2 9,5 C7,11 1,13 -3,11 C-9,8 -11,1 -9,-5 C-7,-9 -3,-11 0,-11 Z"
        fill={filled ? "url(#lf-fill)" : "none"}
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M0,-8 C1,-2 1,3 -1,8"
        stroke={filled ? "#dcfce7" : stroke}
        strokeOpacity={filled ? 0.8 : 0.5}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="lf-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function LeafField({
  label,
  value = "",
  hint,
  invalid = false,
  className = "",
  ...props
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const filled = Boolean(String(value).trim());

  const ring = invalid
    ? "border-amber-400 bg-amber-50/40"
    : focused
      ? "border-brand-500 bg-white shadow-[0_0_0_3px_rgba(34,197,94,0.16)]"
      : filled
        ? "border-brand-300 bg-brand-50/40"
        : "border-gray-200 bg-white";

  return (
    <div className="group">
      <label
        htmlFor={id}
        className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold tracking-wide text-gray-600"
      >
        <LeafMark filled={filled} invalid={invalid} />
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          // Asymmetric radius — soft on one diagonal, tight on the other, so the
          // field reads as a leaf silhouette rather than a plain rounded box.
          className={`w-full rounded-bl-2xl rounded-tr-2xl rounded-br-md rounded-tl-md border px-3.5 py-2.5 text-sm text-gray-800 outline-none transition-all duration-200 placeholder:text-gray-400 ${ring} ${className}`}
          {...props}
        />
        {/* growth underline: fills from the left as soon as the field has a value */}
        <span
          className={`pointer-events-none absolute bottom-0 left-3 h-[2px] rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500 ease-out ${
            filled && !invalid ? "w-[calc(100%-1.5rem)] opacity-100" : "w-0 opacity-0"
          }`}
        />
      </div>

      {hint && (
        <p className={`mt-1 text-[0.7rem] ${invalid ? "text-amber-700" : "text-gray-400"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
