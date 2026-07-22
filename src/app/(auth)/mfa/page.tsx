import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { getMfaStatus } from "@/server/auth/mfa-status";

import { MfaChallengeForm } from "./mfa-challenge-form";

export const metadata = { title: "Two-factor authentication" };

export default async function MfaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const status = await getMfaStatus();

  // Session is already fully authenticated, or the account has no second
  // factor — either way there is nothing to challenge.
  if (!status.needsChallenge) redirect("/dashboard");

  return <MfaChallengeForm />;
}
