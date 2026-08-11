import { NextResponse } from "next/server";

import { buildIcs } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/auth/session";
import type { Interview } from "@/types/database";

/** Download an .ics calendar invite for an interview. RLS scopes the read. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionContext();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;

  const db = await createClient();
  const { data: interviewRow } = await db
    .from("interviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!interviewRow) return new NextResponse("Not found", { status: 404 });
  const iv = interviewRow as Interview;

  const { data: candidate } = await db
    .from("candidates")
    .select("full_name, email")
    .eq("id", iv.candidate_id)
    .maybeSingle();

  const descParts = [
    iv.round ? `Round: ${iv.round}` : "",
    iv.video_link ? `Join: ${iv.video_link}` : "",
    `Organised via HireLane by ${session.organizationName}.`,
  ].filter(Boolean);

  const ics = buildIcs(
    {
      uid: `${iv.id}@hirelane`,
      start: new Date(iv.scheduled_at),
      durationMinutes: iv.duration_minutes,
      title: `${iv.title}${candidate?.full_name ? ` — ${candidate.full_name}` : ""}`,
      description: descParts.join("\n"),
      location: iv.location ?? iv.video_link ?? undefined,
      url: iv.video_link ?? undefined,
      organizer: { name: session.fullName || session.organizationName, email: session.email },
      attendees: candidate?.email
        ? [{ name: candidate.full_name ?? "Candidate", email: candidate.email }]
        : [],
    },
    new Date(),
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${iv.id.slice(0, 8)}.ics"`,
    },
  });
}
