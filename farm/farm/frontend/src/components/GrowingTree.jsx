/**
 * A tree that grows one leaf for every detail filled in on the
 * "Create Super Admin Account" form.
 *
 * It is a progress indicator disguised as scenery: `grown` leaves out of
 * `total` are shown, the canopy fills in as the form is completed, and the
 * tree blossoms once every required field is answered. Used only by the
 * sign-up card — nothing else in the app renders it.
 *
 * All motion is suppressed under `prefers-reduced-motion`.
 */

// Leaf anchor points around the canopy, ordered so the tree fills bottom-up
// and roughly alternates sides — growth reads as organic rather than a list.
const LEAVES = [
  { x: 62, y: 96, r: -38, s: 1.00 },
  { x: 138, y: 92, r: 40, s: 1.00 },
  { x: 48, y: 72, r: -55, s: 0.90 },
  { x: 152, y: 68, r: 55, s: 0.90 },
  { x: 78, y: 58, r: -20, s: 1.05 },
  { x: 124, y: 54, r: 22, s: 1.05 },
  { x: 100, y: 40, r: 0, s: 1.15 },
  { x: 100, y: 68, r: 0, s: 0.95 },
];

// Blossoms appear only when the form is complete.
const BLOSSOMS = [
  { x: 70, y: 80 },
  { x: 130, y: 76 },
  { x: 100, y: 52 },
  { x: 86, y: 100 },
  { x: 116, y: 98 },
];

// Ambient leaves drifting behind the card.
const DRIFTERS = [
  { left: "8%", delay: "0s", dur: "13s", size: 13, tint: "#86efac" },
  { left: "27%", delay: "3.5s", dur: "16s", size: 10, tint: "#4ade80" },
  { left: "58%", delay: "1.6s", dur: "14s", size: 15, tint: "#bbf7d0" },
  { left: "78%", delay: "6s", dur: "18s", size: 11, tint: "#86efac" },
  { left: "92%", delay: "8.5s", dur: "15s", size: 9, tint: "#4ade80" },
];

const LEAF_PATH =
  "M0,-11 C7,-8 11,-2 9,5 C7,11 1,13 -3,11 C-9,8 -11,1 -9,-5 C-7,-9 -3,-11 0,-11 Z";

function Leaf({ x, y, r, s, on, index }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
      className={`gt-leaf ${on ? "gt-leaf-on" : ""}`}
      style={{ transitionDelay: on ? `${index * 55}ms` : "0ms" }}
    >
      <path d={LEAF_PATH} fill="url(#gt-leafFill)" />
      {/* midrib + two veins */}
      <path
        d="M0,-9 C1,-3 1,3 -1,9"
        stroke="#14532d"
        strokeOpacity="0.35"
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M0.4,-4 L5,-2 M0,1 L-4.5,2.5"
        stroke="#14532d"
        strokeOpacity="0.22"
        strokeWidth="0.7"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

export default function GrowingTree({ grown = 0, total = LEAVES.length, complete = false }) {
  const filled = Math.max(0, Math.min(grown, LEAVES.length));

  return (
    <div className="gt-wrap" aria-hidden="true">
      <style>{`
        /* Leaves pop in with a slight overshoot, then settle. */
        .gt-leaf {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: none;
          transition: opacity .45s ease-out;
        }
        .gt-leaf > path { transform: scale(.2); transform-origin: center; transform-box: fill-box;
          transition: transform .5s cubic-bezier(.34,1.56,.64,1); }
        .gt-leaf-on { opacity: 1; }
        .gt-leaf-on > path { transform: scale(1); }

        /* Trunk and branches draw themselves once, on mount. */
        .gt-draw {
          stroke-dasharray: 260;
          stroke-dashoffset: 260;
          animation: gt-draw 1.5s ease-out forwards;
        }
        @keyframes gt-draw { to { stroke-dashoffset: 0; } }

        .gt-blossom {
          opacity: 0;
          transform: scale(0);
          transform-box: fill-box;
          transform-origin: center;
          transition: opacity .5s ease-out, transform .6s cubic-bezier(.34,1.56,.64,1);
        }
        .gt-blossom-on { opacity: 1; transform: scale(1); }

        .gt-sway { animation: gt-sway 6s ease-in-out infinite; transform-origin: 100px 190px; }
        @keyframes gt-sway {
          0%, 100% { transform: rotate(-0.9deg); }
          50%      { transform: rotate(0.9deg); }
        }

        /* Ambient leaves falling behind the card. */
        .gt-drift {
          position: absolute;
          top: -24px;
          opacity: 0;
          animation-name: gt-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes gt-fall {
          0%   { opacity: 0;   transform: translateY(0) rotate(0deg); }
          10%  { opacity: .55; }
          90%  { opacity: .35; }
          100% { opacity: 0;   transform: translateY(460px) rotate(320deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .gt-leaf, .gt-leaf > path, .gt-blossom { transition: none !important; }
          .gt-draw { animation: none !important; stroke-dashoffset: 0 !important; }
          .gt-sway, .gt-drift { animation: none !important; }
          .gt-drift { opacity: .25 !important; }
        }
      `}</style>

      {/* drifting leaves — purely decorative, sit behind the form */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        {DRIFTERS.map((d, i) => (
          <svg
            key={i}
            className="gt-drift"
            style={{
              left: d.left,
              width: d.size,
              height: d.size,
              animationDelay: d.delay,
              animationDuration: d.dur,
            }}
            viewBox="-12 -12 24 24"
          >
            <path d={LEAF_PATH} fill={d.tint} />
          </svg>
        ))}
      </div>

      <svg viewBox="0 0 200 200" className="relative mx-auto block h-40 w-40">
        <defs>
          <linearGradient id="gt-leafFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <linearGradient id="gt-barkFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#78350f" />
            <stop offset="55%" stopColor="#a16207" />
            <stop offset="100%" stopColor="#5b2c0a" />
          </linearGradient>
          <radialGradient id="gt-glow" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#bbf7d0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* halo once the form is complete */}
        <circle
          cx="100"
          cy="85"
          r="78"
          fill="url(#gt-glow)"
          style={{
            opacity: complete ? 1 : 0,
            transition: "opacity .8s ease-out",
          }}
        />

        {/* soil mound */}
        <ellipse cx="100" cy="186" rx="56" ry="9" fill="#84532b" opacity="0.18" />
        <path
          d="M46 186 Q100 172 154 186 Z"
          fill="#8b5a2b"
          opacity="0.30"
        />

        <g className="gt-sway">
          {/* trunk */}
          <path
            d="M100 186 C97 160 96 142 97 124 C98 110 99 100 100 88"
            stroke="url(#gt-barkFill)"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
          />
          {/* branches */}
          <g
            className="gt-draw"
            stroke="url(#gt-barkFill)"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M98 128 C86 120 74 110 66 100" />
            <path d="M99 122 C112 116 126 106 134 96" />
            <path d="M98 108 C88 100 80 90 76 80" />
            <path d="M100 104 C110 96 118 86 122 76" />
            <path d="M100 96 C100 86 100 78 100 66" />
          </g>

          {/* leaves — one per completed field */}
          {LEAVES.map((l, i) => (
            <Leaf key={i} {...l} index={i} on={i < filled} />
          ))}

          {/* blossoms — only when the whole form is answered */}
          {BLOSSOMS.map((b, i) => (
            <g
              key={i}
              className={`gt-blossom ${complete ? "gt-blossom-on" : ""}`}
              style={{ transitionDelay: complete ? `${300 + i * 90}ms` : "0ms" }}
              transform={`translate(${b.x} ${b.y})`}
            >
              <circle r="3.4" fill="#fde68a" />
              <circle r="1.5" fill="#f59e0b" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export const TREE_LEAF_SLOTS = LEAVES.length;
