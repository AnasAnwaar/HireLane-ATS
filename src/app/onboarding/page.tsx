import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/server/auth/session";

import { OnboardingWizard } from "./onboarding-wizard";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const session = await requireSession("/onboarding");

  // Already finished — no reason to walk it again.
  if (session.onboardingCompleted) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: org }, { data: roles }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, industry, website, timezone, currency")
      .eq("id", session.organizationId)
      .single(),
    supabase
      .from("roles")
      .select("id, name, key")
      .eq("organization_id", session.organizationId)
      .order("sort_order"),
  ]);

  if (!org) redirect("/setup");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-6 sm:px-10">
        <BrandMark />
        <span className="text-sm text-muted-foreground">{session.email}</span>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 py-8 sm:py-14">
        <OnboardingWizard org={org} roles={roles ?? []} />
      </main>
    </div>
  );
}
