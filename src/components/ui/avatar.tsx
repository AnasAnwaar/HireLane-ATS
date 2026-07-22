import * as React from "react";

import { cn, initials } from "@/lib/utils";

/**
 * Initials avatar with a deterministic tint.
 *
 * The colour is derived from the name so the same person is always the same
 * colour across the app — helpful when scanning long candidate lists.
 */
const TINTS = [
  "bg-chart-1/12 text-chart-1",
  "bg-chart-2/14 text-chart-2",
  "bg-chart-3/16 text-chart-3",
  "bg-chart-4/12 text-chart-4",
  "bg-chart-5/12 text-chart-5",
];

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

const SIZES = {
  sm: "size-7 text-[0.65rem]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
};

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/5",
        SIZES[size],
        tintFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
