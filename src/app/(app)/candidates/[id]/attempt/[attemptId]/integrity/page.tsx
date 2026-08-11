import { ArrowLeft, Clock, Eye, Lock, Shield, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import {
  EVIDENCE_RETENTION_DAYS,
  INTEGRITY_DECISION_META,
  INTEGRITY_LEVEL_META,
  PROCTORING_EVENT_META,
  PROCTORING_SEVERITY_META,
} from "@/lib/assessments-display";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { can } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { ProctoringAnalysis, ProctoringEvent, TestAttempt } from "@/types/database";

import { IntegrityDecisionPanel } from "./integrity-decision-panel";

export const metadata = { title: "Integrity report" };

const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

export default async function IntegrityReportPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const session = await getSessionContext();
  if (!session) notFound();
  const { id, attemptId } = await params;

  if (!(await can("proctoring.view_summary"))) {
    return (
      <NoAccess
        title="You don't have access to integrity reports"
        message="Viewing integrity signals requires the proctoring permission."
      />
    );
  }

  const supabase = await createClient();
  const { data: attemptRow } = await supabase
    .from("test_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attemptRow) notFound();
  const attempt = attemptRow as TestAttempt;

  const [{ data: assignment }, canViewEvidence, canDecide, canViewAnswers] = await Promise.all([
    supabase
      .from("test_assignments")
      .select("candidate_id, tests(title)")
      .eq("id", attempt.assignment_id)
      .maybeSingle(),
    can("proctoring.view_evidence"),
    can("proctoring.invalidate"),
    can("assessments.view_answers"),
  ]);
  if (!assignment || assignment.candidate_id !== id) notFound();
  const testTitle = (assignment.tests as { title?: string } | null)?.title ?? "Assessment";

  const [{ data: candidate }, { data: eventRows }, { data: analysisRow }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase
      .from("proctoring_events")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("occurred_at", { ascending: true }),
    supabase.from("proctoring_analyses").select("*").eq("attempt_id", attemptId).maybeSingle(),
  ]);
  const events = (eventRows ?? []) as ProctoringEvent[];
  const analysis = (analysisRow as ProctoringAnalysis | null) ?? null;

  // Question correlation (best-effort) — which question the candidate had last
  // touched when each event fired. Needs answer timings (view_answers).
  const questionAt = new Map<string, number>();
  if (canViewAnswers) {
    const { data: answers } = await supabase
      .from("test_answers")
      .select("question_id, updated_at")
      .eq("attempt_id", attemptId);
    const order = new Map((attempt.question_order ?? []).map((qid, i) => [qid, i + 1]));
    const saves = (answers ?? [])
      .map((a) => ({ q: order.get(a.question_id) ?? null, at: new Date(a.updated_at).getTime() }))
      .filter((s) => s.q !== null)
      .sort((a, b) => a.at - b.at);
    for (const e of events) {
      const t = new Date(e.occurred_at).getTime();
      let q: number | null = null;
      for (const s of saves) {
        if (s.at <= t) q = s.q;
        else break;
      }
      if (q !== null) questionAt.set(e.id, q);
    }
  }

  // Decision author name.
  let decidedByName: string | null = null;
  if (attempt.integrity_decided_by) {
    const { data: m } = await supabase
      .from("memberships")
      .select("profiles(full_name)")
      .eq("id", attempt.integrity_decided_by)
      .maybeSingle();
    decidedByName = (m?.profiles as { full_name?: string } | null)?.full_name || null;
  }

  // Evidence: signed URL, gated on view_evidence.
  let evidenceUrl: string | null = null;
  if (canViewEvidence && attempt.check_in_photo_path) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("candidate-documents")
      .createSignedUrl(attempt.check_in_photo_path, 300);
    evidenceUrl = signed?.signedUrl ?? null;
  }

  const startedAt = new Date(attempt.started_at).getTime();
  const endBasis = attempt.submitted_at ?? attempt.expires_at;
  const retentionDate = new Date(
    new Date(endBasis).getTime() + EVIDENCE_RETENTION_DAYS * 86_400_000,
  ).toISOString();
  const level = analysis ? INTEGRITY_LEVEL_META[analysis.integrity_level] : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/candidates/${id}/attempt/${attemptId}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Test results
          </Link>
        }
        title="Integrity report"
        description={`${candidate?.full_name ?? "Candidate"} · ${testTitle}`}
      />

      <PageBody className="max-w-3xl space-y-5">
        {/* Verdict + decision status */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Overall</h2>
            {level ? (
              <Badge variant={level.variant} dot>
                {level.label}
              </Badge>
            ) : (
              <Badge variant="secondary">Not analysed</Badge>
            )}
            <Badge variant={INTEGRITY_DECISION_META[attempt.integrity_decision].variant} className="ml-auto">
              {INTEGRITY_DECISION_META[attempt.integrity_decision].label}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Stat label="Integrity events" value={events.length} />
            <Stat label="High-severity breaches" value={attempt.breach_count} />
            <Stat label="Auto-flagged" value={attempt.flagged ? "Yes" : "No"} />
          </div>

          {analysis ? (
            <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                {analysis.summary}{" "}
                <span className="text-muted-foreground">({pct(analysis.confidence)} confidence)</span>
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No AI verdict yet — generate one from the test results page.
            </p>
          )}
        </section>

        {/* Findings */}
        {analysis && analysis.findings.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-sm font-semibold">AI findings</h2>
            <ul className="mt-3 space-y-2">
              {analysis.findings.map((f, i) => {
                const sev = PROCTORING_SEVERITY_META[f.severity];
                return (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant={sev.variant} className="mt-0.5 shrink-0 text-[0.625rem]">
                      {sev.label}
                    </Badge>
                    <span>
                      <span className="font-medium">{f.label}</span>{" "}
                      <span className="text-muted-foreground">— {f.detail} ({pct(f.confidence)})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Event timeline */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4 text-muted-foreground" /> Event timeline
          </h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No integrity events were captured.</p>
          ) : (
            <ol className="mt-3 space-y-0">
              {events.map((e, i) => {
                const meta = PROCTORING_EVENT_META[e.type];
                const sev = PROCTORING_SEVERITY_META[e.severity];
                const secs = Math.max(0, Math.round((new Date(e.occurred_at).getTime() - startedAt) / 1000));
                const q = questionAt.get(e.id);
                return (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                          e.severity === "high"
                            ? "bg-destructive"
                            : e.severity === "medium"
                              ? "bg-warning"
                              : "bg-muted-foreground"
                        }`}
                      />
                      {i < events.length - 1 && <span className="my-0.5 w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{meta?.label ?? e.type}</span>
                        <Badge variant={sev.variant} className="text-[0.625rem]">
                          {sev.label}
                        </Badge>
                        {q && <span className="text-xs text-muted-foreground">on Q{q}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        +{fmtDuration(secs)} · {formatDate(e.occurred_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!canViewAnswers && events.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Question alignment needs the view-answers permission.
            </p>
          )}
        </section>

        {/* Evidence — access-controlled, watermarked, retention-limited */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4 text-muted-foreground" /> Check-in evidence
          </h2>
          {!attempt.check_in_photo_path ? (
            <p className="mt-3 text-sm text-muted-foreground">No check-in photo was captured.</p>
          ) : !canViewEvidence ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" />
              A check-in photo exists but viewing evidence requires the{" "}
              <span className="font-medium">view-evidence</span> permission.
            </div>
          ) : evidenceUrl ? (
            <>
              <div className="relative mt-3 w-fit overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={evidenceUrl} alt="Candidate check-in" className="block max-h-72" />
                <Watermark text={`${session.email} · ${formatDate(new Date().toISOString())}`} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Confidential. Access is logged. Auto-deletes on {formatDate(retentionDate)} (
                {EVIDENCE_RETENTION_DAYS}-day retention).
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Evidence is unavailable.</p>
          )}
        </section>

        {/* Decision */}
        <IntegrityDecisionPanel
          attemptId={attemptId}
          decision={attempt.integrity_decision}
          reason={attempt.integrity_reason}
          decidedAt={attempt.integrity_decided_at}
          decidedByName={decidedByName}
          canDecide={canDecide}
        />
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Display-time watermark: tiles the viewer's identity across the evidence to
 *  deter screenshots leaking without attribution. */
function Watermark({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-around overflow-hidden opacity-[0.18]">
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-widest text-white"
          style={{ transform: "rotate(-20deg)" }}
        >
          {`${text}    `.repeat(6)}
        </span>
      ))}
    </div>
  );
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
