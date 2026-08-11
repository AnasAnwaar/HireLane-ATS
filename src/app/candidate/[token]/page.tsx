import { CheckCircle2, ClipboardList, Clock, Video } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { ApplicationStage, AsyncQuestion } from "@/types/database";
import { getPortalAssignments } from "@/server/assessments/delivery";
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
  const assignments = await getPortalAssignments(token);

  // Async video interviews this candidate can record.
  const admin = createAdminClient();
  const { data: asyncRows } = await admin
    .from("interviews")
    .select("id, title, async_questions")
    .eq("candidate_id", portal.candidateId)
    .eq("is_async", true)
    .neq("status", "cancelled");
  const asyncInterviews = await Promise.all(
    (asyncRows ?? []).map(async (iv) => {
      const { count } = await admin
        .from("interview_answers")
        .select("id", { count: "exact", head: true })
        .eq("interview_id", iv.id);
      const total = ((iv.async_questions ?? []) as AsyncQuestion[]).length;
      return { id: iv.id, title: iv.title, total, answered: count ?? 0 };
    }),
  );

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

        {/* Assessments to complete (spec §UC-5.2) */}
        {assignments.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold">Assessments</h2>
            {assignments.map((a) => {
              const done = a.status === "submitted";
              const expired = a.status === "expired";
              const overdue = a.overdue;
              const canTake = !done && !expired && !overdue && (a.activeAttemptId || a.attemptsUsed < a.attemptsAllowed);
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <ClipboardList className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.testTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.questionCount} {a.questionCount === 1 ? "question" : "questions"}
                      {a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}
                      {a.deadline ? ` · due ${formatDate(a.deadline)}` : ""}
                    </p>
                  </div>
                  {done ? (
                    <Badge variant="success" dot>
                      Submitted
                    </Badge>
                  ) : expired || overdue ? (
                    <Badge variant="secondary" dot>
                      {expired ? "Expired" : "Missed"}
                    </Badge>
                  ) : canTake ? (
                    <Button size="sm" asChild>
                      <Link href={`/candidate/${token}/test/${a.id}`}>
                        {a.activeAttemptId ? "Resume" : "Start test"}
                      </Link>
                    </Button>
                  ) : (
                    <Badge variant="secondary" dot>
                      No attempts left
                    </Badge>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Async video interviews (spec §UC-7) */}
        {asyncInterviews.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold">Video interviews</h2>
            {asyncInterviews.map((iv) => {
              const done = iv.total > 0 && iv.answered >= iv.total;
              return (
                <div key={iv.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Video className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{iv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {iv.answered}/{iv.total} answered · record on your own time
                    </p>
                  </div>
                  {done ? (
                    <Badge variant="success" dot>
                      Submitted
                    </Badge>
                  ) : (
                    <Button size="sm" asChild>
                      <Link href={`/candidate/${token}/interview/${iv.id}`}>
                        {iv.answered > 0 ? "Continue" : "Record answers"}
                      </Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        )}

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
