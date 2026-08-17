import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { requirePlatformAccess } from "@/server/platform/auth";

import { PlatformNav } from "./platform-nav";

export const metadata = { title: "HireLane Platform" };

// The portal is cross-tenant and privileged — never cache or statically render it.
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/plans", label: "Plans" },
  { href: "/platform/orgs", label: "Organizations" },
  { href: "/platform/audit", label: "Audit" },
];

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const admin = await requirePlatformAccess();

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[84rem] items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <Badge variant="secondary">Platform</Badge>
          </div>
          <div className="hidden sm:block">
            <PlatformNav items={NAV} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground md:inline">{admin.email}</span>
            <SignOutButton
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              label="Sign out"
            />
          </div>
        </div>
        <div className="mx-auto max-w-[84rem] px-4 pb-2 sm:hidden">
          <PlatformNav items={NAV} />
        </div>
      </header>
      <main className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
