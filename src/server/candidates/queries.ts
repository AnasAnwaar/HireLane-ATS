import "server-only";

import { cache } from "react";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type {
  ApplicationStage,
  Candidate,
  DocumentRow,
  NoteVisibility,
} from "@/types/database";

export type CandidateApplication = {
  id: string;
  jobOpeningId: string;
  jobTitle: string;
  stage: ApplicationStage;
  source: string | null;
  appliedAt: string;
};

export type CandidateNoteView = {
  id: string;
  body: string;
  visibility: NoteVisibility;
  authorName: string;
  authorMembershipId: string | null;
  isOwn: boolean;
  editedAt: string | null;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  at: string;
  label: string;
  detail: string;
  actor: string | null;
  kind: "applied" | "stage" | "note" | "other";
};

export type CandidateProfile = {
  candidate: Candidate;
  applications: CandidateApplication[];
  documents: DocumentRow[];
  notes: CandidateNoteView[];
  timeline: TimelineEvent[];
};

/**
 * Everything for a candidate profile (spec §UC-6). Runs through the RLS client,
 * so a candidate the caller can't access returns null, and notes the caller
 * can't see are absent — enforced by the database, not filtered here.
 */
export const getCandidateProfile = cache(
  async (
    candidateId: string,
    currentMembershipId: string,
  ): Promise<CandidateProfile | null> => {
    const supabase = await createClient();

    const { data: candidate } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();

    if (!candidate) return null;

    const [{ data: apps }, { data: docs }, { data: notes }] = await Promise.all([
      supabase
        .from("applications")
        .select("id, job_opening_id, stage, source, applied_at, job_openings(title)")
        .eq("candidate_id", candidateId)
        .order("applied_at", { ascending: false }),
      supabase
        .from("documents")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false }),
      supabase
        .from("candidate_notes")
        .select("id, body, visibility, author_membership_id, edited_at, created_at")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false }),
    ]);

    // Resolve note author names via the admin client (profiles of colleagues).
    const authorIds = Array.from(
      new Set((notes ?? []).map((n) => n.author_membership_id).filter(Boolean) as string[]),
    );
    const authorNames = new Map<string, string>();
    if (authorIds.length) {
      const admin = createAdminClient();
      const { data: authors } = await admin
        .from("memberships")
        .select("id, profiles(full_name, email)")
        .in("id", authorIds);
      for (const a of authors ?? []) {
        authorNames.set(a.id, a.profiles?.full_name || a.profiles?.email || "Someone");
      }
    }

    const applications: CandidateApplication[] = (apps ?? []).map((a) => ({
      id: a.id,
      jobOpeningId: a.job_opening_id,
      jobTitle: a.job_openings?.title ?? "Opening",
      stage: a.stage as ApplicationStage,
      source: a.source,
      appliedAt: a.applied_at,
    }));

    const noteViews: CandidateNoteView[] = (notes ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility as NoteVisibility,
      authorMembershipId: n.author_membership_id,
      authorName: n.author_membership_id
        ? (authorNames.get(n.author_membership_id) ?? "Someone")
        : "System",
      isOwn: n.author_membership_id === currentMembershipId,
      editedAt: n.edited_at,
      createdAt: n.created_at,
    }));

    // Timeline: applied events + stage-change audit + notes, merged by time.
    const timeline: TimelineEvent[] = [];
    for (const a of applications) {
      timeline.push({
        id: `applied-${a.id}`,
        at: a.appliedAt,
        label: "Applied",
        detail: a.jobTitle,
        actor: a.source,
        kind: "applied",
      });
    }
    for (const n of noteViews) {
      timeline.push({
        id: `note-${n.id}`,
        at: n.createdAt,
        label: "Note added",
        detail: `${n.visibility} · ${n.body.slice(0, 80)}${n.body.length > 80 ? "…" : ""}`,
        actor: n.authorName,
        kind: "note",
      });
    }

    // Stage-change events from the audit log for this candidate's applications.
    const appIds = applications.map((a) => a.id);
    if (appIds.length) {
      const { data: audit } = await supabase
        .from("audit_log")
        .select("id, action, summary, actor_name, created_at, entity_id")
        .eq("action", "application.stage_changed")
        .in("entity_id", appIds)
        .order("created_at", { ascending: false });
      for (const e of audit ?? []) {
        timeline.push({
          id: `audit-${e.id}`,
          at: e.created_at,
          label: "Stage changed",
          detail: e.summary,
          actor: e.actor_name,
          kind: "stage",
        });
      }
    }

    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      candidate: candidate as Candidate,
      applications,
      documents: (docs ?? []) as DocumentRow[],
      notes: noteViews,
      timeline,
    };
  },
);

/** Candidate list (across openings) with their latest stage. */
export const listCandidates = cache(
  async (search?: string): Promise<
    {
      id: string;
      fullName: string;
      email: string;
      headline: string | null;
      location: string | null;
      applicationCount: number;
      latestStage: ApplicationStage | null;
    }[]
  > => {
    const supabase = await createClient();

    let query = supabase
      .from("candidates")
      .select("id, full_name, email, headline, location, applications(stage, applied_at)")
      .order("created_at", { ascending: false });

    if (search?.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
    }

    const { data } = await query;

    return (data ?? []).map((c) => {
      const apps = (c.applications ?? []) as { stage: ApplicationStage; applied_at: string }[];
      const latest = apps
        .slice()
        .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())[0];
      return {
        id: c.id,
        fullName: c.full_name,
        email: c.email,
        headline: c.headline,
        location: c.location,
        applicationCount: apps.length,
        latestStage: latest?.stage ?? null,
      };
    });
  },
);
