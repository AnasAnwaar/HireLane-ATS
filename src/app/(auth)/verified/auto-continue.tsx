"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

/** Gently auto-advances after the success screen so the user isn't stranded. */
export function AutoContinue({ href, seconds }: { href: string; seconds: number }) {
  const router = useRouter();
  const [left, setLeft] = React.useState(seconds);

  React.useEffect(() => {
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    const go = setTimeout(() => router.replace(href), seconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [href, seconds, router]);

  return (
    <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
      Taking you there in {left}s…
    </p>
  );
}
