"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Horizontal icon-tab bar for the Administration section. Reuses the same items
 * (label / href / icon / permission) as the sidebar from navigation.ts; the
 * server layout passes which hrefs the viewer may see, so tabs respect the same
 * permission gating. Active tab gets an underline.
 */
export function AdminTabs({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const section = NAV_SECTIONS.find((s) => s.label === "Administration");
  const items = (section?.items ?? []).filter((i) => allowed.includes(i.href));

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
