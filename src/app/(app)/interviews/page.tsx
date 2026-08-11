import { Video } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageBody } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Interviews" };

export default async function InterviewsPage() {
  await requireSession("/interviews");
  if (!(await can("interviews.view_schedule"))) {
    return <NoAccess title="You don't have access to interviews" />;
  }

  return (
    <PageBody>
      <ComingSoon
        icon={Video}
        title="Interviews"
        milestone="CP-22"
        tagline="Schedule, run and score interviews without leaving the portal — from calendar invite to blind scorecard."
        capabilities={[
          "Scheduling with panel availability and calendar invites",
          "In-browser video room: screen share, chat, private notes, shared code pad",
          "Consent-gated recording and transcription",
          "Blind scorecards that stay hidden until every interviewer submits",
          "Reschedule, no-show handling and async video interviews",
        ]}
      />
    </PageBody>
  );
}
