import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requireSession } from "@/server/auth/session";

/** Layout for all authenticated in-app routes. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Signed in with a password but the account's second factor is outstanding.
  // Without this gate an aal1 session could browse the whole product.
  const mfa = await getMfaStatus();
  if (mfa.needsChallenge) redirect("/mfa");

  return (
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
  );
}
