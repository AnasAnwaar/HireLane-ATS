import { cn } from "@/lib/utils";

/**
 * Circular relevance-score indicator (spec UC-4: 0–100 match score).
 *
 * Colour encodes the recommendation band, but the number is always shown —
 * colour alone would fail for colour-blind reviewers.
 */
export function ScoreRing({
  score,
  size = 44,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const stroke = size >= 44 ? 4 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);

  // Three bands matching the spec's recommendation levels (UC-4): Strong /
  // Possible / Weak fit. Brand red is the action colour app-wide, so it is
  // deliberately NOT used here — a red score dial would read as "rejected".
  const tone =
    clamped >= 75
      ? "text-success"
      : clamped >= 50
        ? "text-warning"
        : "text-destructive";

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Match score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("stroke-current transition-[stroke-dashoffset]", tone)}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
          size >= 44 ? "text-xs" : "text-[0.625rem]",
          tone,
        )}
      >
        {clamped}
      </span>
    </span>
  );
}
