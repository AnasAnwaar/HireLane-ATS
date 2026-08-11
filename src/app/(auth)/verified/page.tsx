import { CheckCircle2, MailWarning } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { AutoContinue } from "./auto-continue";

export const metadata = { title: "Email verified" };

/**
 * Branded landing after an emailed auth link is processed by /auth/callback.
 * Shows a clear "you're verified" moment on success (with an auto-continue), or a
 * friendly recovery path when a link has expired.
 */
export default async function VerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; next?: string }>;
}) {
  const { status, next } = await searchParams;
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/setup";

  if (status === "error") {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning-soft">
          <MailWarning className="size-7 text-warning" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Verification links are single-use and time-limited for your security. Sign in to request a
          fresh one.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/signup">Create a new workspace</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success-soft">
        <CheckCircle2 className="size-7 text-success" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">You&rsquo;re verified</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your email is confirmed and your workspace is ready. Let&rsquo;s finish setting things up.
      </p>
      <div className="mt-6">
        <Button asChild className="w-full">
          <Link href={dest}>Continue</Link>
        </Button>
      </div>
      <AutoContinue href={dest} seconds={4} />
    </div>
  );
}
