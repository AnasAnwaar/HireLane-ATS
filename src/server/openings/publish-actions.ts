"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

/**
 * Publishing (spec §UC-2 step 8, A3; §UC-1 R3).
 *
 * A job posting is a small state machine over the job_postings columns:
 *
 *   draft ──publish──▶ published ──takedown/close──▶ closed
 *     │  ╲                 ▲
 *     │   ╲schedule        │ retry
 *     ▼    ▼               │
 *  scheduled ──(due)──▶ published / failed
 *
 * Most channels are ASSISTED (spec §UC-1): "publishing" means the AI wrote the
 * post, HR pasted it across, and we record it as posted (optionally with the
 * live URL). API channels (careers_page today) publish directly. Both go through
 * the same action; only the wording differs. When a real per-platform OAuth flow
 * is approved, `publishOne` gains an API-call branch and nothing else changes.
 */

type Guard =
  | { ok: true; organizationId: string; membershipId: string }
  | { ok: false; error: string };

async function guard(): Promise<Guard> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("job_openings.publish");
  if (!auth.ok) return auth;
  return { ok: true, organizationId: session.organizationId, membershipId: session.membershipId };
}

type PostingRow = {
  id: string;
  channel_key: string;
  job_opening_id: string;
  title: string | null;
  body: string | null;
  status: string;
};

/**
 * Attempt to publish one posting. Validates that the post has content and its
 * channel is still connected, then marks it published (or failed with a reason).
 * Shared by publish / retry / publish-all so the rules live in one place.
 */
async function publishOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  g: { organizationId: string; membershipId: string },
  posting: PostingRow,
  channelName: string,
  connectionStatus: string | null,
  externalUrl?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  // Guard against empty or trivially-short content reaching a live board.
  const MIN_BODY = 30;
  if (!posting.title?.trim() || (posting.body?.trim().length ?? 0) < MIN_BODY) {
    const error = !posting.title?.trim()
      ? `Add a headline for the ${channelName} post before publishing.`
      : `The ${channelName} post is too short to publish — generate or write a fuller post first.`;
    await supabase.from("job_postings").update({ status: "failed", error }).eq("id", posting.id);
    return { ok: false, error };
  }

  if (connectionStatus !== "connected") {
    const error =
      connectionStatus === "expired"
        ? `${channelName} authorisation expired — reconnect it in Integrations.`
        : `${channelName} isn't connected — connect it in Integrations first.`;
    await supabase.from("job_postings").update({ status: "failed", error }).eq("id", posting.id);
    return { ok: false, error };
  }

  const { error: dbError } = await supabase
    .from("job_postings")
    .update({
      status: "published",
      published_at: now,
      published_by: g.membershipId,
      scheduled_for: null,
      error: null,
      external_url: externalUrl?.trim() || null,
    })
    .eq("id", posting.id);

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  g: { organizationId: string; membershipId: string },
  action: string,
  postingId: string,
  summary: string,
) {
  await supabase.from("audit_log").insert({
    organization_id: g.organizationId,
    actor_membership_id: g.membershipId,
    action,
    entity_type: "job_posting",
    entity_id: postingId,
    summary,
  });
}

/** Load a posting with its opening status, channel name and connection status. */
async function loadContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postingId: string,
) {
  const { data: posting } = await supabase
    .from("job_postings")
    .select("id, channel_key, job_opening_id, title, body, status")
    .eq("id", postingId)
    .maybeSingle();
  if (!posting) return null;

  const [{ data: opening }, { data: channel }, { data: conn }] = await Promise.all([
    supabase.from("job_openings").select("status").eq("id", posting.job_opening_id).maybeSingle(),
    supabase.from("channels").select("name").eq("key", posting.channel_key).maybeSingle(),
    supabase
      .from("channel_connections")
      .select("status")
      .eq("channel_key", posting.channel_key)
      .maybeSingle(),
  ]);

  return {
    posting: posting as PostingRow,
    openingStatus: opening?.status ?? null,
    channelName: channel?.name ?? posting.channel_key,
    connectionStatus: conn?.status ?? null,
  };
}

/** Publish (or mark posted, for assisted channels) a single posting now. */
export async function publishPostAction(
  postingId: string,
  externalUrl?: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const ctx = await loadContext(supabase, postingId);
  if (!ctx) return { ok: false, error: "Post not found." };

  if (ctx.openingStatus !== "open") {
    return { ok: false, error: "Open the job opening before publishing its posts." };
  }

  const result = await publishOne(
    supabase,
    g,
    ctx.posting,
    ctx.channelName,
    ctx.connectionStatus,
    externalUrl,
  );
  if (!result.ok) {
    revalidatePath(`/openings/${ctx.posting.job_opening_id}/posts`);
    return result;
  }

  await audit(supabase, g, "posting.published", postingId, `Published to ${ctx.channelName}`);
  revalidatePath(`/openings/${ctx.posting.job_opening_id}/posts`);
  return { ok: true, message: `Published to ${ctx.channelName}.` };
}

/** Retry a failed posting — identical to publishing it again. */
export async function retryPostAction(postingId: string): Promise<ActionResult> {
  return publishPostAction(postingId);
}

/** Publish every ready posting for an opening. Partial failures are reported. */
export async function publishAllPostsAction(openingId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("job_openings")
    .select("status")
    .eq("id", openingId)
    .maybeSingle();
  if (!opening) return { ok: false, error: "Opening not found." };
  if (opening.status !== "open") {
    return { ok: false, error: "Open the job opening before publishing its posts." };
  }

  const [{ data: postings }, { data: channels }, { data: connections }] = await Promise.all([
    supabase
      .from("job_postings")
      .select("id, channel_key, job_opening_id, title, body, status")
      .eq("job_opening_id", openingId)
      .in("status", ["draft", "failed", "scheduled"]),
    supabase.from("channels").select("key, name"),
    supabase.from("channel_connections").select("channel_key, status"),
  ]);

  const todo = (postings ?? []) as PostingRow[];
  if (todo.length === 0) {
    return { ok: false, error: "Nothing to publish — every post is already live or closed." };
  }

  const nameByKey = new Map((channels ?? []).map((c) => [c.key, c.name]));
  const statusByKey = new Map((connections ?? []).map((c) => [c.channel_key, c.status]));

  let published = 0;
  const failures: string[] = [];
  for (const posting of todo) {
    const channelName = nameByKey.get(posting.channel_key) ?? posting.channel_key;
    const result = await publishOne(
      supabase,
      g,
      posting,
      channelName,
      statusByKey.get(posting.channel_key) ?? null,
    );
    if (result.ok) published++;
    else failures.push(channelName);
  }

  await audit(
    supabase,
    g,
    "posting.published",
    openingId,
    `Published ${published} post${published === 1 ? "" : "s"}`,
  );
  revalidatePath(`/openings/${openingId}/posts`);

  if (published === 0) {
    return { ok: false, error: `Couldn't publish: ${failures.join(", ")}.` };
  }
  if (failures.length > 0) {
    return {
      ok: true,
      message: `Published ${published}. Couldn't publish ${failures.length} (${failures.join(", ")}) — see the failed cards.`,
    };
  }
  return { ok: true, message: `Published all ${published} posts.` };
}

/** Schedule a posting to go live at a future time. */
export async function schedulePostAction(
  postingId: string,
  scheduledForIso: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const when = new Date(scheduledForIso);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date and time." };
  if (when.getTime() <= Date.now()) {
    return { ok: false, error: "Choose a time in the future." };
  }

  const supabase = await createClient();
  const ctx = await loadContext(supabase, postingId);
  if (!ctx) return { ok: false, error: "Post not found." };
  if (!ctx.posting.title?.trim() || !ctx.posting.body?.trim()) {
    return { ok: false, error: `Generate the ${ctx.channelName} post before scheduling.` };
  }

  const { error } = await supabase
    .from("job_postings")
    .update({ status: "scheduled", scheduled_for: when.toISOString(), error: null })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  await audit(
    supabase,
    g,
    "posting.scheduled",
    postingId,
    `Scheduled ${ctx.channelName} for ${when.toISOString()}`,
  );
  revalidatePath(`/openings/${ctx.posting.job_opening_id}/posts`);
  return { ok: true, message: `${ctx.channelName} scheduled.` };
}

/** Cancel a schedule, returning the post to draft. */
export async function unschedulePostAction(postingId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const ctx = await loadContext(supabase, postingId);
  if (!ctx) return { ok: false, error: "Post not found." };

  const { error } = await supabase
    .from("job_postings")
    .update({ status: "draft", scheduled_for: null })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/openings/${ctx.posting.job_opening_id}/posts`);
  return { ok: true, message: "Schedule cancelled." };
}

/** Take a published post down — keeps the record, marks it closed/unmanaged. */
export async function takedownPostAction(postingId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;

  const supabase = await createClient();
  const ctx = await loadContext(supabase, postingId);
  if (!ctx) return { ok: false, error: "Post not found." };

  const { error } = await supabase
    .from("job_postings")
    .update({ status: "closed", error: null })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  await audit(supabase, g, "posting.takedown", postingId, `Took down ${ctx.channelName} post`);
  revalidatePath(`/openings/${ctx.posting.job_opening_id}/posts`);
  return { ok: true, message: `${ctx.channelName} post taken down.` };
}

/**
 * Publish any scheduled posts whose time has arrived. This stands in for a cron
 * worker: the posts page calls it on load so scheduled posts flip to published
 * without external infra. At go-live a real scheduler runs the same logic.
 */
export async function publishDuePostsAction(openingId: string): Promise<{ published: number }> {
  const g = await guard();
  if (!g.ok) return { published: 0 };

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("job_openings")
    .select("status")
    .eq("id", openingId)
    .maybeSingle();
  if (!opening || opening.status !== "open") return { published: 0 };

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("job_postings")
    .select("id, channel_key, job_opening_id, title, body, status")
    .eq("job_opening_id", openingId)
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso);

  const rows = (due ?? []) as PostingRow[];
  if (rows.length === 0) return { published: 0 };

  const [{ data: channels }, { data: connections }] = await Promise.all([
    supabase.from("channels").select("key, name"),
    supabase.from("channel_connections").select("channel_key, status"),
  ]);
  const nameByKey = new Map((channels ?? []).map((c) => [c.key, c.name]));
  const statusByKey = new Map((connections ?? []).map((c) => [c.channel_key, c.status]));

  let published = 0;
  for (const posting of rows) {
    const result = await publishOne(
      supabase,
      g,
      posting,
      nameByKey.get(posting.channel_key) ?? posting.channel_key,
      statusByKey.get(posting.channel_key) ?? null,
    );
    if (result.ok) published++;
  }
  if (published > 0) {
    await audit(supabase, g, "posting.published", openingId, `Auto-published ${published} scheduled post(s)`);
    revalidatePath(`/openings/${openingId}/posts`);
  }
  return { published };
}
