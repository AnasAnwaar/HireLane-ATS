import { BrandMark } from "@/components/brand-mark";
import { createAdminClient } from "@/lib/supabase/server";
import { resolvePortalSession } from "@/server/candidates/portal-access";
import type { AsyncQuestion, Interview } from "@/types/database";

import { AsyncInterview } from "./async-interview";

export const metadata = { title: "Video interview" };

export default async function AsyncInterviewPage({
  params,
}: {
  params: Promise<{ token: string; interviewId: string }>;
}) {
  const { token, interviewId } = await params;
  const session = await resolvePortalSession(token);

  if (!session) return <Invalid message="This interview link is invalid or has expired." />;

  const admin = createAdminClient();
  const { data: iv } = await admin.from("interviews").select("*").eq("id", interviewId).maybeSingle();
  const interview = iv as Interview | null;
  if (
    !interview ||
    interview.candidate_id !== session.candidateId ||
    interview.organization_id !== session.organizationId ||
    !interview.is_async
  ) {
    return <Invalid message="This interview link is invalid or has expired." />;
  }

  const { data: answers } = await admin
    .from("interview_answers")
    .select("question_index")
    .eq("interview_id", interviewId);
  const done = new Set((answers ?? []).map((a) => a.question_index));

  const questions = (interview.async_questions ?? []) as AsyncQuestion[];

  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{interview.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.organizationName} · record a short video answer to each question. You can re-record
          before submitting.
        </p>
        <AsyncInterview
          token={token}
          interviewId={interviewId}
          questions={questions}
          doneIndexes={[...done]}
        />
      </main>
    </div>
  );
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="text-center">
        <BrandMark />
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
