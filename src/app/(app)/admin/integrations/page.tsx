import { Clock, Plug } from "lucide-react";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

export const metadata = { title: "Integrations" };

// Integrations (job-board / channel connections) are not live yet — the whole
// surface is disabled behind a "coming soon" state and is not part of any plan.
export default async function IntegrationsPage() {
  await requireSession("/admin/integrations");

  if (!(await can("integrations.view"))) {
    return (
      <NoAccess
        title="You don't have access to integrations"
        message="Connecting job boards requires the Integrations permission."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Integrations"
        description="Connect the job boards and social platforms you post openings to."
      />
      <PageBody>
        <Card className="mx-auto max-w-2xl overflow-hidden">
          <div className="relative bg-gradient-to-br from-primary-soft/60 via-background to-background p-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Plug className="size-7" />
            </span>
            <div className="mt-4 flex items-center justify-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">Integrations</h2>
              <Badge variant="warning">
                <Clock className="size-3" /> Coming soon
              </Badge>
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              One-click posting to LinkedIn, Indeed and other job boards — plus automatic candidate
              sync — is on the way. This feature is being finalized and isn&apos;t available yet.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              For now, use AI-generated posts on each opening and publish them in assisted mode.
            </p>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
