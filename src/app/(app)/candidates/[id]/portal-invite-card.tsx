"use client";

import { Check, Copy, Link2, Loader2, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  issuePortalInviteAction,
  revokePortalInviteAction,
} from "@/server/candidates/portal-actions";

/**
 * "Connect with applicant" (spec §UC-3): issue / revoke the candidate portal
 * link. The generated URL is shown once for copying — the raw token is never
 * stored, so it can't be re-shown later; reissue for a fresh link.
 */
export function PortalInviteCard({
  candidateId,
  hasLiveInvite,
  expiresAt,
}: {
  candidateId: string;
  hasLiveInvite: boolean;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function issue() {
    setPending(true);
    const result = await issuePortalInviteAction(candidateId);
    setPending(false);
    if (result.ok) {
      setUrl(result.url);
      toast.success("Portal link created.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this candidate's portal link? It will stop working immediately.")) return;
    setPending(true);
    const result = await revokePortalInviteAction(candidateId);
    setPending(false);
    setUrl(null);
    if (result.ok) {
      toast.success("Link revoked.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidate portal</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Give the candidate a private link to complete their profile and track progress.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* The freshly-generated URL, shown once for copying. */}
        {url && (
          <div className="space-y-2 rounded-lg border border-primary/25 bg-primary-soft/40 p-3">
            <p className="text-xs font-medium text-accent-foreground">
              Share this link with the candidate — it won&rsquo;t be shown again:
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">
                {url}
              </code>
              <Button type="button" size="icon" variant="outline" onClick={copy}>
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </div>
        )}

        {hasLiveInvite ? (
          <>
            <p className="flex items-center gap-2 text-sm text-success">
              <Link2 className="size-4" /> An active portal link exists
              {expiresAt && (
                <span className="text-muted-foreground">· expires {formatDate(expiresAt)}</span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={issue} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                <Send /> Reissue link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={revoke}
                disabled={pending}
                className="text-destructive hover:text-destructive"
              >
                <X /> Revoke
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={issue} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            <Send /> Create portal link
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Automated email delivery of this link is a go-live task (needs the email integration).
          For now, copy and send it.
        </p>
      </CardContent>
    </Card>
  );
}
