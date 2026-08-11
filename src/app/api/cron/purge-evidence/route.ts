import { NextResponse } from "next/server";

import { EVIDENCE_RETENTION_DAYS } from "@/lib/assessments-display";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "candidate-documents";

/**
 * Scheduled evidence purge (spec §UC-5.3, CP-21). Deletes check-in photos past
 * the retention window and clears their path. Triggered by Vercel Cron (see
 * vercel.json); Vercel sends `Authorization: Bearer $CRON_SECRET`, which we
 * require so the endpoint can't be hit anonymously.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - EVIDENCE_RETENTION_DAYS * 86_400_000).getTime();

  const { data: rows, error } = await admin
    .from("test_attempts")
    .select("id, check_in_photo_path, submitted_at, expires_at")
    .not("check_in_photo_path", "is", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const expired = (rows ?? []).filter((r) => {
    const basis = new Date(r.submitted_at ?? r.expires_at).getTime();
    return Number.isFinite(basis) && basis < cutoff;
  });

  let purged = 0;
  for (const r of expired) {
    if (!r.check_in_photo_path) continue;
    // Remove the check-in photo and any exam-audio samples for the attempt.
    const dir = r.check_in_photo_path.replace(/check-in\.jpg$/, "");
    const { data: audio } = await admin.storage.from(BUCKET).list(`${dir}audio`);
    const targets = [
      r.check_in_photo_path,
      ...(audio ?? []).map((f) => `${dir}audio/${f.name}`),
    ];
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(targets);
    if (rmErr) continue;
    await admin.from("test_attempts").update({ check_in_photo_path: null }).eq("id", r.id);
    purged += 1;
  }

  return NextResponse.json({ ok: true, scanned: expired.length, purged });
}
