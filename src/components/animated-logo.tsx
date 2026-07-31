import { cn } from "@/lib/utils";

/**
 * Hirelane logo mark — a modern "app-icon" tile.
 *
 * A softly-rounded tile with a diagonal red gradient carries a geometric glyph:
 * three descending bars narrowing to a single point — the hiring pipeline
 * resolving to one hire. An inner top highlight gives it dimension and a slow,
 * infrequent sheen sweep gives it life without being distracting. Pure CSS, so
 * it renders crisply and cheaply everywhere the brand appears.
 */
export function AnimatedLogo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  const radius = Math.round(size * 0.3);

  return (
    <span
      className={cn("logo-mark relative inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage:
          "linear-gradient(145deg, oklch(0.66 0.19 33), var(--primary) 48%, oklch(0.5 0.2 25))",
        boxShadow:
          "0 1px 1px oklch(1 0 0 / 0.4) inset, 0 -2px 6px oklch(0 0 0 / 0.18) inset, 0 3px 8px oklch(0.5 0.2 27 / 0.35)",
      }}
      aria-hidden
    >
      {/* Top-light highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0) 52%)",
        }}
      />

      {/* Glyph: pipeline narrowing to a hire */}
      <svg
        viewBox="0 0 32 32"
        width={size * 0.62}
        height={size * 0.62}
        className="relative"
        fill="none"
      >
        <g fill="#fff">
          <rect x="6.5" y="7" width="19" height="3.3" rx="1.65" opacity="0.95" />
          <rect x="9.5" y="13.6" width="13" height="3.3" rx="1.65" opacity="0.88" />
          <rect x="12.6" y="20.2" width="6.8" height="3.3" rx="1.65" opacity="0.8" />
          <circle cx="16" cy="27.4" r="1.7" />
        </g>
      </svg>

      {/* Elegant sheen sweep */}
      <span aria-hidden className="logo-sheen pointer-events-none absolute inset-0" />
    </span>
  );
}
