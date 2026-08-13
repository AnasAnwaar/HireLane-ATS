"use server";

import { revalidatePath } from "next/cache";
import { Type, type Schema } from "@google/genai";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { AiError, generateJson, isAiConfigured } from "@/server/ai/gemini";
import { getSessionContext } from "@/server/auth/session";
import { requireFeature } from "@/server/billing/entitlements";

/**
 * AI job-post generation (spec §UC-2).
 *
 * One canonical requisition → a platform-tuned post per connected channel. The
 * prompt is hard-constrained to the requisition (guardrail R4: the AI may
 * rephrase and optimise, never invent requirements). Structured JSON output
 * gives us title, body, an SEO score and improvement hints per channel.
 */

type GeneratedPost = {
  title: string;
  body: string;
  seoScore: number;
  seoHints: string[];
  hashtags: string[];
};

const POST_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Post headline, within the platform's title limit." },
    body: { type: Type.STRING, description: "The post body, formatted for the platform." },
    seoScore: { type: Type.INTEGER, description: "0-100 estimate of search/discovery strength." },
    seoHints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-4 short, concrete suggestions to improve reach.",
    },
    hashtags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Relevant hashtags/skill tags (no # prefix). Empty if the platform doesn't use them.",
    },
  },
  required: ["title", "body", "seoScore", "seoHints", "hashtags"],
};

type OpeningForPrompt = {
  title: string;
  employment_type: string;
  work_mode: string;
  location: string | null;
  description: string;
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_visible: boolean;
};

function buildPrompt(
  opening: OpeningForPrompt,
  requirements: { kind: string; label: string }[],
  channel: { name: string; category: string; maxTitle: number | null; maxBody: number | null; supportsMedia: boolean },
  orgName: string,
  instruction?: string,
) {
  const must = requirements.filter((r) => r.kind === "must_have").map((r) => r.label);
  const nice = requirements.filter((r) => r.kind === "nice_to_have").map((r) => r.label);
  const quals = requirements.filter((r) => r.kind === "qualification").map((r) => r.label);

  const salary =
    opening.salary_visible && (opening.salary_min || opening.salary_max)
      ? `${opening.salary_currency ?? ""} ${opening.salary_min ?? ""}${opening.salary_max ? `–${opening.salary_max}` : "+"}`.trim()
      : null;

  return [
    `You are an expert recruitment copywriter. Write a job post for the platform "${channel.name}" (${channel.category}).`,
    `Company: ${orgName}`,
    ``,
    `ROLE (this is the single source of truth — do NOT invent skills, requirements, benefits, or facts not listed here; you may only rephrase, format and SEO-optimise what is given):`,
    `- Title: ${opening.title}`,
    `- Employment: ${opening.employment_type.replace("_", " ")}, ${opening.work_mode.replace("_", " ")}`,
    opening.location ? `- Location: ${opening.location}` : ``,
    opening.experience_min || opening.experience_max
      ? `- Experience: ${opening.experience_min ?? 0}${opening.experience_max ? `–${opening.experience_max}` : "+"} years`
      : ``,
    salary ? `- Salary: ${salary}` : ``,
    opening.description ? `- Description: ${opening.description}` : ``,
    must.length ? `- Must-have skills: ${must.join(", ")}` : ``,
    nice.length ? `- Nice-to-have skills: ${nice.join(", ")}` : ``,
    quals.length ? `- Qualifications: ${quals.join(", ")}` : ``,
    ``,
    `PLATFORM RULES for ${channel.name}:`,
    channel.maxTitle ? `- Title: max ${channel.maxTitle} characters.` : `- No headline (body only) — leave title short or empty.`,
    channel.maxBody ? `- Body: max ${channel.maxBody} characters. Keep it well within the limit.` : ``,
    `- Match the tone and format conventions of ${channel.name}.`,
    channel.category === "social" ? `- Keep it punchy and engaging; use hashtags.` : `- Professional, scannable, benefit-led.`,
    ``,
    instruction ? `EXTRA INSTRUCTION FROM THE RECRUITER: ${instruction}` : ``,
    ``,
    `Return a strong, ready-to-post variant. Include an honest seoScore and concrete seoHints.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Convert literal escape sequences the model sometimes emits ("\n", "\r\n",
 * "\t") into the real whitespace characters, and normalise line endings. This
 * keeps posts readable instead of showing raw backslash-n in the text.
 */
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function guard() {
  const session = await getSessionContext();
  if (!session) return { ok: false as const, error: "Your session has expired." };
  if (!isAiConfigured()) {
    return { ok: false as const, error: "AI generation isn't set up yet — a Gemini API key is required." };
  }
  const auth = await authorize("post_generation.generate");
  if (!auth.ok) return { ok: false as const, error: auth.error };
  return { ok: true as const, organizationId: session.organizationId, membershipId: session.membershipId };
}

/** Generate (or regenerate) a post for one channel of an opening. */
export async function generatePostAction(
  openingId: string,
  channelKey: string,
  instruction?: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const feat = await requireFeature(g.organizationId, "ai_posts");
  if (!feat.ok) return feat;

  const supabase = await createClient();

  const [{ data: opening }, { data: requirements }, { data: channel }, { data: org }] =
    await Promise.all([
      supabase.from("job_openings").select("*").eq("id", openingId).maybeSingle(),
      supabase.from("job_requirements").select("kind, label").eq("job_opening_id", openingId),
      supabase.from("channels").select("*").eq("key", channelKey).maybeSingle(),
      supabase.from("organizations").select("name").eq("id", g.organizationId).maybeSingle(),
    ]);

  if (!opening) return { ok: false, error: "Opening not found." };
  if (!channel) return { ok: false, error: "Channel not found." };

  const prompt = buildPrompt(
    opening,
    requirements ?? [],
    {
      name: channel.name,
      category: channel.category,
      maxTitle: channel.max_title_length,
      maxBody: channel.max_body_length,
      supportsMedia: channel.supports_media,
    },
    org?.name ?? "the company",
    instruction,
  );

  let post: GeneratedPost;
  try {
    post = await generateJson<GeneratedPost>(prompt, POST_SCHEMA);
  } catch (err) {
    return { ok: false, error: err instanceof AiError ? err.message : "Generation failed." };
  }

  // The model sometimes emits escape sequences ("\n", "\t") as literal text
  // instead of real whitespace. Normalise so posts render with actual line
  // breaks. Titles are single-line, so collapse any breaks there to spaces.
  const cleanTitle = normalizeWhitespace(post.title).replace(/\s*\n\s*/g, " ").trim();
  const cleanBody = normalizeWhitespace(post.body);

  // Trim to the platform limits as a safety net, and clamp the score.
  const title = channel.max_title_length ? cleanTitle.slice(0, channel.max_title_length) : cleanTitle;
  const body = channel.max_body_length ? cleanBody.slice(0, channel.max_body_length) : cleanBody;
  const seoScore = Math.max(0, Math.min(100, Math.round(post.seoScore)));

  const { error } = await supabase.from("job_postings").upsert(
    {
      organization_id: g.organizationId,
      job_opening_id: openingId,
      channel_key: channelKey,
      title,
      body,
      seo_score: seoScore,
      status: "draft",
      created_by: g.membershipId,
    },
    { onConflict: "job_opening_id,channel_key" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/openings/${openingId}/posts`);
  return { ok: true, message: `${channel.name} post generated.` };
}

/** Generate posts for every connected channel that doesn't have one yet. */
export async function generateAllPostsAction(openingId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const feat = await requireFeature(g.organizationId, "ai_posts");
  if (!feat.ok) return feat;

  const supabase = await createClient();
  const [{ data: connections }, { data: existing }] = await Promise.all([
    supabase.from("channel_connections").select("channel_key").eq("status", "connected"),
    supabase.from("job_postings").select("channel_key").eq("job_opening_id", openingId),
  ]);

  const have = new Set((existing ?? []).map((p) => p.channel_key));
  const todo = (connections ?? []).map((c) => c.channel_key).filter((k) => !have.has(k));

  if (todo.length === 0) {
    return { ok: false, error: "Every connected channel already has a post. Regenerate individually if needed." };
  }

  let generated = 0;
  let lastError = "";
  // Sequential to stay within AI rate limits.
  for (const channelKey of todo) {
    const result = await generatePostAction(openingId, channelKey);
    if (result.ok) generated++;
    else lastError = result.error;
  }

  revalidatePath(`/openings/${openingId}/posts`);
  if (generated === 0) return { ok: false, error: lastError || "Generation failed." };
  return { ok: true, message: `Generated ${generated} post${generated === 1 ? "" : "s"}.` };
}

/** Save manual edits to a post's title/body. */
export async function updatePostAction(
  postingId: string,
  fields: { title: string; body: string },
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize("post_generation.edit");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("job_postings")
    .update({ title: fields.title, body: fields.body })
    .eq("id", postingId)
    .select("job_opening_id, channel_key, status")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: true, message: "Saved." };

  revalidatePath(`/openings/${updated.job_opening_id}/posts`);

  // Edit-after-publish (spec §UC-2 A3): a live post edited here needs to reach
  // the board too. API channels re-publish automatically; assisted channels are
  // copy-paste, so we tell HR to update the live copy by hand.
  if (updated.status === "published") {
    const { data: channel } = await supabase
      .from("channels")
      .select("name, supports_api")
      .eq("key", updated.channel_key)
      .maybeSingle();

    if (channel?.supports_api) {
      await supabase
        .from("job_postings")
        .update({ published_at: new Date().toISOString() })
        .eq("id", postingId);
      return { ok: true, message: `Saved and re-published to ${channel.name}.` };
    }
    return {
      ok: true,
      message: `Saved. Update the live post on ${channel?.name ?? "the board"} manually.`,
    };
  }

  return { ok: true, message: "Saved." };
}
