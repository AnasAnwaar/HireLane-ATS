import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/server/auth/session";

/** Layout for all authenticated in-app routes. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // Nobody reaches the product before finishing setup — otherwise they land on
  // a dashboard with no departments, roles or channels configured.
  if (!session.onboardingCompleted) redirect("/onboarding");

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
