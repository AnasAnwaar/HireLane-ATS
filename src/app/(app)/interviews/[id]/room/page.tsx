import { notFound } from "next/navigation";

import { NoAccess } from "@/components/permissions/no-access";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import type { Interview } from "@/types/database";

import { InterviewRoom } from "./room";

export const metadata = { title: "Interview room" };

export default async function InterviewRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) notFound();
  const { id } = await params;

  if (!(await can("interviews.join"))) {
    return <NoAccess title="You don't have access to interview rooms" />;
  }

  const supabase = await createClient();
  const { data: interviewRow } = await supabase.from("interviews").select("*").eq("id", id).maybeSingle();
  if (!interviewRow) notFound();
  const interview = interviewRow as Interview;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", interview.candidate_id)
    .maybeSingle();

  return (
    <InterviewRoom
      interviewId={id}
      title={interview.title}
      candidateName={candidate?.full_name ?? "Candidate"}
      videoLink={interview.video_link}
      initialNotes={interview.shared_notes ?? ""}
      me={session.fullName || session.email || "Interviewer"}
    />
  );
}
