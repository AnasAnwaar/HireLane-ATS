import { cn } from "@/lib/utils";

/**
 * Loading placeholder. A soft muted block with a light shimmer sweep — used for
 * route-level `loading.tsx` skeletons and inline pending states.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} {...props}>
      <div
        aria-hidden
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent"
      />
    </div>
  );
}

export { Skeleton };
