"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Fade-and-rise on scroll into view. Adds `.is-visible` once (Intersection
 * Observer), then disconnects. Reduced-motion viewers get the content instantly
 * (handled in CSS).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = React.useRef<HTMLElement>(null);
  const [seen, setSeen] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <Tag
      // @ts-expect-error — ref typing across the union of tag names is fine here.
      ref={ref}
      className={cn("reveal", seen && "is-visible", className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
