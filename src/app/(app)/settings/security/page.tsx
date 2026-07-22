import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMfaStatus } from "@/server/auth/mfa-status";
import { requireSession } from "@/server/auth/session";

import { TwoFactorCard } from "./two-factor-card";

export const metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const session = await requireSession("/settings/security");
  const mfa = await getMfaStatus();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Security"
        description="Protect your account and control how you sign in."
      />

      <PageBody className="max-w-3xl space-y-6">
        <TwoFactorCard enabled={mfa.enabled} friendlyName={mfa.friendlyName} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Password</CardTitle>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Signed in as {session.email}.
            </p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <a href="/forgot-password">Change password</a>
            </Button>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
