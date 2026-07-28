import { CheckCircle2, Clock } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ApplicationStage } from "@/types/database";
import { resolvePortalSession } from "@/server/candidates/portal-access";

import { PortalClient } from "./portal-client";

export const metadata = { title: "Your application" };

/** How each internal stage reads to the candidate — kept encouraging and non-internal. */
const CANDIDATE_STATUS: Record<ApplicationStage, { label: string; done: boolean }> = {
  applied: { label: "Application received", done: false },
  screened: { label: "Under review", done: false },
  shortlisted: { label: "Shortlisted", done: false },
  test_assigned: { label: "Assessment to complete", done: false },
  test_completed: { label: "Assessment received", done: false },
  interview_scheduled: { label: "Interview scheduled", done: false },
  interviewed: { label: "Interview complete", done: false },
  offer: { label: "Offer stage", done: true },
  hired: { label: "Hired", done: true },
  rejected: { label: "Not moving forward", done: true },
  on_hold: { label: "On hold", done: false },
  withdrawn: { label: "Withdrawn", done: true },
};

export default async function CandidatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const portal = await resolvePortalSession(token, true);

  if (!portal) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div aria-hidden className="brand-rule h-1 w-full" />
        <header className="border-b border-border">
          <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto flex max-w-2xl flex-1 items-center px-6">
          <div className="w-full rounded-xl border border-border bg-card p-10 text-center shadow-card">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Clock className="size-6 text-muted-foreground" />
            </span>
            <h1 className="text-xl font-semibold">This link isn&rsquo;t valid anymore</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have expired or been withdrawn. Please contact whoever invited you for a new
              link.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const firstName = portal.candidate.fullName.split(" ")[0] || "there";

  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <BrandMark />
          <span className="text-sm text-muted-foreground">{portal.organizationName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your application space with {portal.organizationName}. Keep your details up to date here.
        </p>

        {/* Status of each application */}
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">Your applications</h2>
          {portal.applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active applications.</p>
          ) : (
            portal.applications.map((a, i) => {
              const status = CANDIDATE_STATUS[a.stage];
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
                >
                  <span
                    className={
                      status.done
                        ? "flex size-9 items-center justify-center rounded-lg bg-success-soft text-success"
                        : "flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary"
                    }
                  >
                    {status.done ? <CheckCircle2 className="size-5" /> : <Clock className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.jobTitle}</p>
                    <p className="text-xs text-muted-foreground">Applied {formatDate(a.appliedAt)}</p>
                  </div>
                  <Badge variant={status.done ? "success" : "default"} dot>
                    {status.label}
                  </Badge>
                </div>
              );
            })
          )}
        </section>

        <PortalClient
          token={token}
          hasCv={portal.hasCv}
          profile={portal.candidate}
          canWithdraw={portal.applications.some(
            (a) => !["hired", "rejected", "withdrawn"].includes(a.stage),
          )}
        />
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by Hirelane
      </footer>
    </div>
  );
}
