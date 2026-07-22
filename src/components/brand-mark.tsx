import { cn } from "@/lib/utils";

/**
 * Hirelane wordmark + logo.
 *
 * The mark is a stylised funnel — the pipeline narrowing from applicants to a
 * hire — set in brand red, with the palette's khaki band running beneath it.
 *
 * `onDark` swaps the lockup for placement on the black sidebar.
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
      <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-[0.65rem] bg-primary shadow-card">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
          <path
            d="M4 5h16L14.5 12v6.4L9.5 21v-9L4 5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
            className="text-primary-foreground"
          />
        </svg>
        {/* Khaki band, echoing the brand swatch. */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-sand" />
      </span>

      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "text-[1.0625rem] font-bold tracking-tight",
              onDark ? "text-sidebar-foreground" : "text-foreground",
            )}
          >
            Hirelane
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
