import { cn } from "@/lib/utils";

/**
 * HireLane logo mark — a bespoke vector "H": a glossy black stroke and a glossy
 * red stroke wrapped by an orbiting neon ring, with a small ID-card badge. Fully
 * vector (transparent background), so it drops onto any surface with no box, and
 * it animates: a bright pulse circles the orbit and the whole mark floats in a
 * gentle 3D sway. Stilled for reduced-motion viewers by the global rule.
 */
export function AnimatedLogo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn("logo-float relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, filter: "drop-shadow(0 2px 9px oklch(0.55 0.24 27 / 0.5))" }}
      aria-hidden
    >
      <svg viewBox="0 0 128 128" width={size} height={size} fill="none">
        <defs>
          <linearGradient id="hl-blk" x1="0" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#5a5a60" />
            <stop offset="0.35" stopColor="#232327" />
            <stop offset="1" stopColor="#060608" />
          </linearGradient>
          <linearGradient id="hl-red" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#ff6f62" />
            <stop offset="0.45" stopColor="#e4342e" />
            <stop offset="1" stopColor="#7e100d" />
          </linearGradient>
          <linearGradient id="hl-gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hl-ring" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0" stopColor="#ff4438" stopOpacity="0" />
            <stop offset="0.4" stopColor="#ff3b30" />
            <stop offset="0.78" stopColor="#ff6a5e" />
            <stop offset="1" stopColor="#8f130f" stopOpacity="0.15" />
          </linearGradient>
          <filter id="hl-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="hl-sh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Orbit ring + traveling pulse */}
        <g transform="rotate(-22 64 66)">
          <ellipse cx="64" cy="66" rx="56" ry="27" fill="none" stroke="url(#hl-ring)" strokeWidth="5.5" filter="url(#hl-glow)" opacity="0.95" />
          <ellipse cx="64" cy="66" rx="56" ry="27" fill="none" stroke="#1a1a1c" strokeWidth="2.4" opacity="0.9" strokeDasharray="110 320" strokeDashoffset="24" />
          <ellipse
            className="logo-orbit-flow"
            cx="64"
            cy="66"
            rx="56"
            ry="27"
            fill="none"
            stroke="#ff8a80"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray="5 264"
          />
        </g>

        {/* H */}
        <g filter="url(#hl-sh)">
          <path d="M36 18 L54 18 L47 108 L29 108 Z" fill="url(#hl-blk)" />
          <path d="M80 18 L98 18 L91 108 L73 108 Z" fill="url(#hl-red)" />
          <path d="M45 55 L64 55 L62 72 L43 72 Z" fill="url(#hl-blk)" />
          <path d="M64 55 L84 55 L82 72 L62 72 Z" fill="url(#hl-red)" />
          <path d="M36 18 L54 18 L52.5 27 L35 27 Z" fill="url(#hl-gloss)" opacity="0.85" />
          <path d="M80 18 L98 18 L96.5 27 L79 27 Z" fill="url(#hl-gloss)" opacity="0.7" />
          <path d="M52.6 20 L46 106" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.3" fill="none" />
          <path d="M96.6 20 L90 106" stroke="#ffc4be" strokeOpacity="0.45" strokeWidth="1.3" fill="none" />
        </g>

        {/* ID card badge */}
        <g transform="rotate(9 100 54)" filter="url(#hl-sh)">
          <rect x="86" y="40" width="28" height="34" rx="5" fill="#17171a" stroke="#33333a" strokeWidth="1" />
          <circle cx="94.5" cy="51" r="4.3" fill="#e4342e" />
          <path d="M88.5 61.5 a6 6 0 0 1 12 0 Z" fill="#e4342e" />
          <rect x="103" y="48" width="8" height="2" rx="1" fill="#7a7a80" />
          <rect x="103" y="53" width="8" height="2" rx="1" fill="#7a7a80" />
          <circle cx="107" cy="66" r="5" fill="#e4342e" />
          <path d="M104.6 66 l1.6 1.7 l3-3.4" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </span>
  );
}
