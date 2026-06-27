// Brand logo for FarmERP Pro — a leaf mark on a green gradient badge.

export function LogoMark({ size = 40, rounded = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="FarmERP Pro">
      <defs>
        <linearGradient id="farmerpLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={rounded} fill="url(#farmerpLogoGrad)" />
      <g
        transform="translate(10,9) scale(1.15)"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
          fill="#ffffff"
        />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 36, light = false, tagline = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className="flex items-center gap-1">
          <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-gray-800"}`}>
            FarmERP
          </span>
          <span className="rounded-md bg-brand-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Pro
          </span>
        </div>
        {tagline && (
          <span className={`text-[11px] ${light ? "text-brand-100/80" : "text-gray-400"}`}>
            Smart Farm Management
          </span>
        )}
      </div>
    </div>
  );
}
