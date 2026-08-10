"use client";

import * as React from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar, type TopbarUser } from "@/components/layout/app-topbar";
import { cn } from "@/lib/utils";

export function AppShell({
  user,
  children,
}: {
  user: TopbarUser;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar className="hidden lg:flex" organization={user.organization} />

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <AppSidebar className="relative z-10" organization={user.organization} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar user={user} onToggleSidebar={() => setMobileNavOpen((open) => !open)} />
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-6 pb-2 pt-7 sm:px-8", className)}>
      <div className="mx-auto flex max-w-[84rem] flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="px-6 py-6 sm:px-8">
      {/* className merges onto the div that DIRECTLY wraps children, so a page's
          `grid`/`space-y`/`max-w` classes actually apply to the content — not to
          an outer shell with a single inner child (which silently no-ops them). */}
      <div className={cn("mx-auto w-full max-w-[84rem]", className)}>{children}</div>
    </div>
  );
}
