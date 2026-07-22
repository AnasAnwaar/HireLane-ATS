"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

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

      <div className="px-4 pb-4 pt-4">
        <Button className="w-full justify-start gap-2" size="sm" asChild>
          <Link href="/openings/new">
            <Plus />
            New job opening
          </Link>
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
        {NAV_SECTIONS.map((section) => (
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

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/admin/company"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent/50"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-sand text-xs font-bold text-sand-foreground">
            AT
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Acme Tech</span>
            <span className="block truncate text-xs text-sidebar-muted">
              Free plan · 6 seats
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-sidebar-muted" />
        </Link>
      </div>
    </aside>
  );
}
