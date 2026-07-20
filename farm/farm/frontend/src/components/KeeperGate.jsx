/**
 * "The Keeper's Gate" — the header scene for the Super Administrator sign-in.
 *
 * The everyday sign-in gets a small sapling crest; the owner's door gets a
 * whole scene: a grand tree standing inside a golden archway, roots spread
 * across the threshold, fireflies rising through the canopy, and a keyhole set
 * into the trunk. It reads as a gate you are admitted through rather than a
 * second copy of the same form.
 *
 * Everything is deterministic (no Math.random) and every animation stops under
 * `prefers-reduced-motion`.
 */

const LEAF =
  "M0,-11 C7,-8 11,-2 9,5 C7,11 1,13 -3,11 C-9,8 -11,1 -9,-5 C-7,-9 -3,-11 0,-11 Z";

// Canopy inside the arch: x, y, rotation, scale.
const CANOPY = [
  [120, 44, 0, 1.25],
  [98, 52, -28, 1.15],
  [142, 50, 28, 1.15],
  [80, 66, -52, 1.0],
  [160, 64, 52, 1.0],
  [104, 70, -14, 1.05],
  [136, 68, 14, 1.05],
  [88, 86, -40, 0.85],
  [152, 84, 40, 0.85],
  [120, 62, 0, 0.95],
];

// Fireflies drifting up through the gate: x, y, delay, duration.
const MOTES = [
  [86, 104, "0s", "7s"],
  [104, 118, "1.6s", "8.5s"],
  [120, 96, "3.2s", "6.5s"],
  [138, 116, "0.8s", "9s"],
  [156, 102, "2.4s", "7.5s"],
  [96, 130, "4.4s", "8s"],
  [148, 132, "5.6s", "6.8s"],
];

export default function KeeperGate() {
  return (
    <div className="relative w-full" aria-hidden="true">
      <style>{`
        .kg-sway   { animation: kg-sway 9s ease-in-out infinite; transform-origin: 120px 140px; }
        @keyframes kg-sway { 0%,100% { transform: rotate(-1.1deg) } 50% { transform: rotate(1.1deg) } }

        .kg-mote   { animation: kg-mote linear infinite; }
        @keyframes kg-mote {
          0%   { opacity: 0;  transform: translate(0, 0) scale(.6); }
          15%  { opacity: .95; }
          70%  { opacity: .7; }
          100% { opacity: 0;  transform: translate(6px, -62px) scale(1.15); }
        }

        /* A slow band of light crossing the arch — the gate "wakes up". */
        .kg-shimmer { animation: kg-shimmer 6.5s ease-in-out infinite; }
        @keyframes kg-shimmer {
          0%, 100% { opacity: 0; transform: translateX(-70px); }
          45%      { opacity: .55; }
          60%      { opacity: .3; }
          100%     { transform: translateX(70px); }
        }

        .kg-draw {
          stroke-dasharray: 520; stroke-dashoffset: 520;
          animation: kg-draw 2s ease-out .1s forwards;
        }
        @keyframes kg-draw { to { stroke-dashoffset: 0 } }

        .kg-grow { animation: kg-grow .8s cubic-bezier(.34,1.4,.64,1) both; }
        @keyframes kg-grow {
          from { opacity: 0; transform: scale(.72); }
          to   { opacity: 1; transform: scale(1); }
        }

        .kg-glow { animation: kg-glow 5s ease-in-out infinite; }
        @keyframes kg-glow { 0%,100% { opacity:.5 } 50% { opacity:.95 } }

        @media (prefers-reduced-motion: reduce) {
          .kg-sway, .kg-mote, .kg-shimmer, .kg-draw, .kg-grow, .kg-glow {
            animation: none !important;
          }
          .kg-draw { stroke-dashoffset: 0 !important; }
          .kg-grow { opacity: 1; transform: none; }
        }
      `}</style>

      <svg viewBox="0 0 240 168" className="block h-auto w-full">
        <defs>
          <linearGradient id="kg-leaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#3f6212" />
          </linearGradient>
          <linearGradient id="kg-bark" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#78350f" />
            <stop offset="52%" stopColor="#a16207" />
            <stop offset="100%" stopColor="#5b2c0a" />
          </linearGradient>
          <linearGradient id="kg-arch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id="kg-halo" cx="50%" cy="42%" r="52%">
            <stop offset="0%" stopColor="#fde68a" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="kg-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fffbeb" stopOpacity="0" />
            <stop offset="50%" stopColor="#fffbeb" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fffbeb" stopOpacity="0" />
          </linearGradient>
          {/* Clip so the shimmer only lights the arch opening */}
          <clipPath id="kg-clip">
            <path d="M56 150 L56 78 A64 64 0 0 1 184 78 L184 150 Z" />
          </clipPath>
        </defs>

        {/* warm light inside the gate */}
        <ellipse className="kg-glow" cx="120" cy="80" rx="74" ry="66" fill="url(#kg-halo)" />

        {/* the archway */}
        <path
          className="kg-draw"
          d="M56 152 L56 78 A64 64 0 0 1 184 78 L184 152"
          fill="none"
          stroke="url(#kg-arch)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* inner hairline, offset — gives the arch thickness without a second heavy stroke */}
        <path
          d="M63 152 L63 79 A57 57 0 0 1 177 79 L177 152"
          fill="none"
          stroke="#f59e0b"
          strokeOpacity=".35"
          strokeWidth="1.1"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />

        {/* light sweeping across the opening */}
        <g clipPath="url(#kg-clip)">
          <rect className="kg-shimmer" x="90" y="10" width="26" height="150" fill="url(#kg-shine)" />
        </g>

        <g className="kg-sway">
          {/* roots across the threshold */}
          <g stroke="url(#kg-bark)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".8">
            <path d="M120 140 C104 148 88 152 70 152" />
            <path d="M120 140 C136 148 152 152 170 152" />
            <path d="M120 140 C112 150 104 155 94 158" />
            <path d="M120 140 C128 150 136 155 146 158" />
          </g>

          {/* trunk */}
          <path
            d="M120 142 C117 124 117 112 118 96"
            stroke="url(#kg-bark)"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />

          {/* keyhole set into the trunk — this is the owner's door */}
          <g className="kg-grow">
            <circle cx="118" cy="120" r="4.6" fill="#3b1d06" />
            <path d="M116 122 L115.2 130 L120.8 130 L120 122 Z" fill="#3b1d06" />
            <circle cx="118" cy="120" r="4.6" fill="none" stroke="#fbbf24" strokeWidth="1.1" strokeOpacity=".85" />
          </g>

          {/* branches */}
          <g stroke="url(#kg-bark)" strokeWidth="4.4" strokeLinecap="round" fill="none">
            <path d="M118 104 C104 96 92 86 86 74" />
            <path d="M119 98 C134 92 148 82 154 70" />
            <path d="M119 92 C119 80 119 70 120 58" />
            <path d="M118 110 C106 106 96 100 90 92" />
            <path d="M119 108 C132 104 142 98 148 90" />
          </g>

          {/* canopy */}
          {CANOPY.map(([x, y, r, s], i) => (
            <g
              key={i}
              className="kg-grow"
              style={{ animationDelay: `${120 + i * 55}ms` }}
              transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
            >
              <path d={LEAF} fill="url(#kg-leaf)" />
              <path
                d="M0,-8 C1,-2 1,3 -1,8"
                stroke="#1a2e05"
                strokeOpacity=".32"
                strokeWidth=".9"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          ))}

          {/* crown resting at the apex of the arch */}
          <g className="kg-grow" style={{ animationDelay: "620ms" }} transform="translate(120 26)">
            <path
              d="M-13 6 L-13 -4 L-7 1 L0 -8 L7 1 L13 -4 L13 6 Z"
              fill="#f59e0b"
              stroke="#b45309"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <circle cx="0" cy="-10.5" r="2" fill="#fde68a" />
            <circle cx="-7" cy="3" r="1.1" fill="#fffbeb" />
            <circle cx="0" cy="2" r="1.1" fill="#fffbeb" />
            <circle cx="7" cy="3" r="1.1" fill="#fffbeb" />
          </g>
        </g>

        {/* fireflies rising through the gate */}
        {MOTES.map(([x, y, delay, dur], i) => (
          <circle
            key={i}
            className="kg-mote"
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 1.9 : 1.3}
            fill="#fde68a"
            style={{ animationDelay: delay, animationDuration: dur }}
          />
        ))}

        {/* ground line */}
        <path d="M44 152 Q120 144 196 152" stroke="#78350f" strokeOpacity=".28" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
