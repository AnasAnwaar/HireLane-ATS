import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PermissionProvider } from "@/components/permissions/permission-provider";
import { brandThemeCss } from "@/lib/brand-theme";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/server/auth/authorize";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requireSession } from "@/server/auth/session";

/** Layout for all authenticated in-app routes. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Signed in with a password but the account's second factor is outstanding.
  // Without this gate an aal1 session could browse the whole product.
  const mfa = await getMfaStatus();
  if (mfa.needsChallenge) redirect("/mfa");

  // Resolve the viewer's permissions once, here, and hand them to the client
  // provider as a serialisable array. Every in-app component can then gate UI
  // without its own round trip.
  const permissionMap = await getMyPermissions();
  const permissions = Array.from(permissionMap, ([key, scope]) => ({ key, scope }));

  // Per-tenant theme from the company's brand colour.
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("brand_color")
    .eq("id", session.organizationId)
    .maybeSingle();
  const themeCss = brandThemeCss(org?.brand_color);

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
      >
        {children}
      </AppShell>
    </PermissionProvider>
  );
}
