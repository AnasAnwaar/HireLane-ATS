import { AnimatedLogo } from "@/components/animated-logo";
import { cn } from "@/lib/utils";

/**
 * Hirelane wordmark + logo lockup.
 *
 * The mark is the animated 3D funnel (see AnimatedLogo) — the pipeline narrowing
 * from applicants to a hire. Used on every surface, so the logo is consistent
 * everywhere. `onDark` only affects the wordmark colour.
 */
export function BrandMark({
  className,
  showWordmark = true,
  onDark = false,
}: {
  className?: string;
  showWordmark?: boolean;
  onDark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AnimatedLogo size={36} />

      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.0625rem] font-bold tracking-tight">
            <span className={onDark ? "text-white" : "text-foreground"}>Hire</span>
            <span className="text-primary">Lane</span>
          </span>
          <span
            className={cn(
              "mt-1 text-[0.625rem] font-medium uppercase tracking-[0.13em]",
              onDark ? "text-sidebar-muted" : "text-muted-foreground",
            )}
          >
            ATS Portal
          </span>
        </span>
      )}
    </span>
  );
}
