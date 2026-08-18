import { LifeBuoy, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PermissionProvider } from "@/components/permissions/permission-provider";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { brandThemeCss } from "@/lib/brand-theme";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/server/auth/authorize";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requireSession } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";

/** Layout for all authenticated in-app routes. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Signed in with a password but the account's second factor is outstanding.
  // Without this gate an aal1 session could browse the whole product.
  const mfa = await getMfaStatus();
  if (mfa.needsChallenge) redirect("/mfa");

  // Suspended tenant — block the whole app shell (CP-28 platform admin).
  if (session.orgSuspended) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-card">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">This workspace is suspended</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access to <strong>{session.organizationName}</strong> is currently paused. Please contact
            support to restore it.
          </p>
          <a
            href="mailto:support@hirelane.app"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <LifeBuoy className="size-4" /> Contact support
          </a>
          <div className="mt-3">
            <SignOutButton className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Resolve the viewer's permissions once, here, and hand them to the client
  // provider as a serialisable array. Every in-app component can then gate UI
  // without its own round trip.
  const permissionMap = await getMyPermissions();
  const permissions = Array.from(permissionMap, ([key, scope]) => ({ key, scope }));

  // Self-service deactivation (company settings): an admin signing in
  // reactivates the workspace; non-admin members see a paused notice until then.
  if (session.orgDeactivated) {
    const isAdmin = session.isOwner || permissionMap.has("administration.manage_company_profile");
    if (isAdmin) {
      await createAdminClient()
        .from("organizations")
        .update({ deactivated_at: null })
        .eq("id", session.organizationId);
    } else {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-card">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-foreground">
              <ShieldAlert className="size-6" />
            </span>
            <h1 className="mt-4 text-lg font-semibold">Workspace paused</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An administrator has paused <strong>{session.organizationName}</strong>. Access returns
              once an admin signs back in.
            </p>
            <div className="mt-5">
              <SignOutButton className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" />
            </div>
          </div>
        </div>
      );
    }
  }

  // Per-tenant theme from the company's brand colour.
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("brand_color")
    .eq("id", session.organizationId)
    .maybeSingle();
  const themeCss = brandThemeCss(org?.brand_color);

  const ent = await getEntitlements(session.organizationId);

  return (
    <PermissionProvider permissions={permissions}>
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <AppShell
        user={{
          name: session.fullName || session.email,
          email: session.email,
          role: session.roleName,
          organization: session.organizationName,
        }}
        plan={ent.planName}
      >
        {children}
      </AppShell>
    </PermissionProvider>
  );
}
