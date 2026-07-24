import { MailX } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Accept invitation" };

async function hashToken(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Invitation landing page.
 *
 * Uses the admin client deliberately: the invitee has no session and no
 * membership, so RLS would (correctly) hide the invitation from them. The lookup
 * is keyed on the token hash, which only the holder of the emailed link knows,
 * and nothing is returned beyond what the page needs to render.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A lookup failure here (database unreachable, misconfigured keys) must not
  // crash the page — an invitee has no way to interpret a 500.
  //
  // NOTE: this is the legacy custom-token invite path from CP-3. CP-3b replaced
  // team invitations with Supabase's native inviteUserByEmail, which lands on
  // /set-password instead. This page and the `invitations` table are kept only
  // until the two paths are consolidated (tracked for CP-5). Two plain queries
  // rather than a join — clear enough, and this code is on its way out.
  let invite: {
    id: string;
    email: string;
    status: string;
    expires_at: string;
    organization_id: string;
  } | null = null;
  let orgName: string | null = null;
  let lookupFailed = false;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitations")
      .select("id, email, status, expires_at, organization_id")
      .eq("token_hash", await hashToken(token))
      .maybeSingle();

    if (error) throw error;
    invite = data;

    if (invite) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", invite.organization_id)
        .maybeSingle();
      orgName = org?.name ?? null;
    }
  } catch {
    lookupFailed = true;
  }

  if (lookupFailed) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-muted">
          <MailX className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <Alert variant="destructive" className="mt-5 text-left">
          We couldn&rsquo;t check that invitation just now. Please try again in a moment.
        </Alert>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  const expired = invite ? new Date(invite.expires_at) < new Date() : false;

  if (!invite || invite.status !== "pending" || expired) {
    const reason = !invite
      ? "We couldn't find that invitation. The link may be incorrect."
      : invite.status === "accepted"
        ? "This invitation has already been used. Try signing in instead."
        : invite.status === "revoked"
          ? "This invitation was withdrawn by an administrator."
          : "This invitation has expired.";

    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-muted">
          <MailX className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation unavailable</h1>
        <Alert variant="warning" className="mt-5 text-left">
          {reason}
        </Alert>
        <p className="mt-5 text-sm text-muted-foreground">
          Ask your administrator to send a new invitation.
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        You&rsquo;ve been invited to {orgName ?? "a Hirelane workspace"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Invitation sent to <strong className="text-foreground">{invite.email}</strong>.
      </p>

      <Alert variant="info" className="mt-6">
        Account creation from an invitation link lands in the next checkpoint (CP-4), once
        the permission engine can assign the invited role safely.
      </Alert>

      <Button className="mt-6 w-full" size="lg" asChild>
        <Link href="/login">Sign in instead</Link>
      </Button>
    </div>
  );
}
