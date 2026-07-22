import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ensureOrganization } from "@/server/auth/actions";
import { getCurrentUser, getSessionContext } from "@/server/auth/session";

export const metadata = { title: "Finishing setup" };

/**
 * Landing point after email confirmation.
 *
 * Provisioning cannot happen during sign-up, because `provision_organization()`
 * requires an authenticated caller and no session exists until the email link
 * is followed. This route is that first authenticated moment.
 *
 * It is idempotent, so a refresh or a re-used link is harmless.
 */
export default async function SetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await getSessionContext();
  if (existing) {
    redirect(existing.onboardingCompleted ? "/dashboard" : "/onboarding");
  }

  const result = await ensureOrganization();
  if (result.ok) redirect("/onboarding");

  // Provisioning genuinely failed — show why rather than looping.
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-6 sm:px-10">
        <BrandMark />
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-destructive-soft">
            <AlertCircle className="size-6 text-destructive" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            We couldn&rsquo;t finish setting up
          </h1>
          <Alert variant="destructive" className="mt-5 text-left">
            {result.error}
          </Alert>
          <p className="mt-5 text-sm text-muted-foreground">
            If you were invited to an existing workspace, ask your admin to resend the
            invitation link.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/login">Back to sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/setup">Try again</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
