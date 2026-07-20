/**
 * Crests for the sign-in cards, and the ambient leaf drift behind them.
 *
 * The everyday sign-in gets a sapling crest — young growth, brand green. The
 * super administrator's door is a whole scene instead; see KeeperGate.jsx.
 *
 * Used only by the login page. Motion is suppressed under
 * `prefers-reduced-motion`.
 */

const LEAF_PATH =
  "M0,-11 C7,-8 11,-2 9,5 C7,11 1,13 -3,11 C-9,8 -11,1 -9,-5 C-7,-9 -3,-11 0,-11 Z";

const STYLES = `
  .lc-rise { animation: lc-rise .7s cubic-bezier(.34,1.3,.64,1) both; }
  @keyframes lc-rise {
    from { opacity: 0; transform: translateY(6px) scale(.9); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lc-sway { animation: lc-sway 7s ease-in-out infinite; transform-origin: 60px 96px; }
  @keyframes lc-sway {
    0%, 100% { transform: rotate(-1.4deg); }
    50%      { transform: rotate(1.4deg); }
  }
  .lc-twinkle { animation: lc-twinkle 3.4s ease-in-out infinite; }
  @keyframes lc-twinkle { 0%,100% { opacity:.35 } 50% { opacity:1 } }

  /* Two nested elements: the outer falls, the inner sways sideways. A single
     transform can't do both without the rotation dragging the drift with it. */
  .lc-drift {
    position: absolute; top: -40px; opacity: 0;
    animation-name: lc-fall; animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: transform;
  }
  .lc-drift > svg {
    display: block;
    animation: lc-wobble 9s ease-in-out infinite alternate;
  }
  @keyframes lc-fall {
    0%   { opacity: 0;   transform: translateY(0) rotate(0deg); }
    10%  { opacity: var(--lc-o, .4); }
    90%  { opacity: var(--lc-o, .4); }
    100% { opacity: 0;   transform: translateY(112vh) rotate(200deg); }
  }
  @keyframes lc-wobble {
    from { transform: translateX(-16px) rotate(-12deg); }
    to   { transform: translateX(16px) rotate(12deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .lc-rise, .lc-sway, .lc-twinkle, .lc-drift, .lc-drift > svg { animation: none !important; }
    .lc-rise { opacity: 1; transform: none; }
    .lc-drift { opacity: .16 !important; }
  }
`;

const TINTS = ["#86efac", "#4ade80", "#bbf7d0", "#22c55e", "#a7f3d0", "#65a30d"];

/**
 * A dense, slow-falling canopy of leaves. Durations run 34–70s so the motion
 * reads as ambient weather rather than something to watch; three depth bands
 * (far leaves smaller, fainter and blurred) keep it from looking like one flat
 * sheet of confetti. Deterministic — no Math.random, so it can't flicker
 * differently between renders.
 */
const DRIFTERS = Array.from({ length: 26 }, (_, i) => {
  const band = i % 3; // 0 = far, 1 = mid, 2 = near
  const spread = (i * 37) % 100; // scatter across the width without clustering
  return {
    left: `${spread}%`,
    // Long, staggered lifetimes: nothing marches in step.
    dur: `${34 + ((i * 13) % 37)}s`,
    delay: `-${(i * 7) % 40}s`, // negative: the sky starts already full
    size: band === 0 ? 7 + (i % 3) : band === 1 ? 11 + (i % 4) : 15 + (i % 5),
    tint: TINTS[i % TINTS.length],
    opacity: band === 0 ? 0.22 : band === 1 ? 0.36 : 0.5,
    blur: band === 0 ? "1.1px" : band === 1 ? "0.4px" : "0",
    wobble: `${7 + (i % 6)}s`,
  };
});

/** Leaves drifting down behind the sign-in cards. */
export function LeafDrift() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{STYLES}</style>
      {DRIFTERS.map((d, i) => (
        <span
          key={i}
          className="lc-drift"
          style={{
            left: d.left,
            animationDelay: d.delay,
            animationDuration: d.dur,
            filter: d.blur === "0" ? undefined : `blur(${d.blur})`,
            "--lc-o": d.opacity,
          }}
        >
          <svg
            viewBox="-12 -12 24 24"
            style={{ width: d.size, height: d.size, animationDuration: d.wobble }}
          >
            <path d={LEAF_PATH} fill={d.tint} />
          </svg>
        </span>
      ))}
    </div>
  );
}

export default function LoginCrest({ size = 84 }) {
  return (
    <div className="lc-rise" aria-hidden="true">
      <style>{STYLES}</style>
      <svg viewBox="0 0 120 120" style={{ width: size, height: size }} className="block">
        <defs>
          <linearGradient id="lc-leaf-sapling" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <linearGradient id="lc-bark-sapling" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#78350f" />
            <stop offset="55%" stopColor="#a16207" />
            <stop offset="100%" stopColor="#5b2c0a" />
          </linearGradient>
        </defs>

        {/* medallion */}
        <circle cx="60" cy="60" r="54" fill="#f0fdf4" />
        <circle cx="60" cy="60" r="54" fill="none" stroke="#86efac" strokeWidth="2" strokeOpacity=".7" />
        {/* a broken outer ring reads as hand-drawn rather than a plain badge */}
        <circle
          cx="60"
          cy="60"
          r="58"
          fill="none"
          stroke="#86efac"
          strokeWidth="1.2"
          strokeOpacity=".45"
          strokeDasharray="3 7"
          strokeLinecap="round"
        />

        <g className="lc-sway">
          {/* soil */}
          <path d="M36 97 Q60 90 84 97" stroke="#8b5a2b" strokeOpacity=".45" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          {/* stem */}
          <path
            d="M60 97 C59 84 59 74 60 62"
            stroke="url(#lc-bark-sapling)"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* two opening leaves + a bud: a sapling, not a full tree */}
          {[
            [44, 66, -58, 1.15],
            [76, 62, 58, 1.15],
            [60, 50, 0, 0.95],
          ].map(([x, y, r, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
              <path d={LEAF_PATH} fill="url(#lc-leaf-sapling)" />
              <path
                d="M0,-8 C1,-2 1,3 -1,8"
                stroke="#14532d"
                strokeOpacity=".33"
                strokeWidth=".95"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          ))}
          <circle className="lc-twinkle" cx="60" cy="38" r="2.6" fill="#bbf7d0" />
        </g>
      </svg>
    </div>
  );
}
