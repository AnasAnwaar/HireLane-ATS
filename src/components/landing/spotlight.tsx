"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Pointer-following red spotlight. A soft radial glow tracks the cursor inside
 * the wrapped area, giving the dark sections an interactive, lit feel without
 * any heavy 3D cost. Pure CSS-var updates on mousemove — no re-renders.
 */
export function Spotlight({
  id,
  className,
  children,
  size = "34rem",
  color = "oklch(0.55 0.24 27 / 0.13)",
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  size?: string;
  color?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  return (
    <div ref={ref} id={id} onMouseMove={onMove} className={cn("group/spot relative", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(${size} ${size} at var(--mx, 50%) var(--my, 30%), ${color}, transparent 68%)`,
        }}
      />
      {children}
    </div>
  );
}

/**
 * A card that lifts on hover and shows a red glow tracking the cursor within it
 * — the classic "spotlight card". Professional, subtle, GPU-cheap.
 */
export function SpotlightCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--cx", `${e.clientX - r.left}px`);
    el.style.setProperty("--cy", `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        "group/card relative overflow-hidden transition-transform duration-300 hover:-translate-y-1.5",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
        style={{
          background:
            "radial-gradient(15rem 15rem at var(--cx, 50%) var(--cy, 0%), oklch(0.6 0.24 27 / 0.18), transparent 62%)",
        }}
      />
      {children}
    </div>
  );
}
