import { Skeleton } from "@/components/ui/skeleton";

/**
 * App-wide loading skeleton. Shown during navigation to any in-app route while
 * its server component resolves — so every page gets an instant, shimmering
 * placeholder instead of a blank frame. Mirrors the PageHeader + PageBody frame.
 */
export default function AppLoading() {
  return (
    <div className="animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-6 pb-2 pt-7 sm:px-8">
        <div className="mx-auto max-w-[84rem] space-y-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[84rem] px-6 py-4 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
