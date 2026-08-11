"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { usePermissions } from "@/components/permissions/permission-provider";
import { Button } from "@/components/ui/button";
import { NAV_SECTIONS } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/permissions/keys";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string): string {
  const letters = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return letters || "•";
}

export function AppSidebar({
  className,
  organization,
  onNavigate,
}: {
  className?: string;
  organization: string;
  /** Called when a link is followed — the mobile drawer uses it to close. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const perms = usePermissions();

  // Show a nav item only if the viewer holds its permission. Items with a null
  // permission (e.g. Dashboard) are always visible. A section with no visible
  // items disappears entirely, so a limited role sees a tidy menu, not greyed rows.
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.permission === null || perms.can(item.permission as PermissionKey),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
        className,
      )}
    >
      <div className="flex h-16 items-center px-5">
        <BrandMark onDark />
      </div>
      {/* Brand rule — the four palette stripes as a hairline. */}
      <div aria-hidden className="brand-rule mx-5 h-[3px] rounded-full opacity-90" />

      {perms.can("job_openings.create") && (
        <div className="px-4 pb-4 pt-4">
          <Button className="w-full justify-start gap-2" size="sm" asChild>
            <Link href="/openings/new" onClick={onNavigate}>
              <Plus />
              New job opening
            </Link>
          </Button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
        {sections.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      {/* Active rail — a colour change alone is easy to miss. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-transform",
                          active ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                      <item.icon
                        className={cn(
                          "size-[1.05rem] shrink-0 transition-colors",
                          active ? "text-primary" : "text-sidebar-muted",
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums text-primary-foreground">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <Link
          href="/admin/company"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent/50"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand text-xs font-bold text-sand-foreground">
            {initialsOf(organization)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-foreground">
              {organization}
            </span>
            <span className="block truncate text-xs text-sidebar-muted">Free plan</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-sidebar-muted" />
        </Link>

        <SignOutButton
          label="Sign out"
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground disabled:opacity-60"
        />
      </div>
    </aside>
  );
}
