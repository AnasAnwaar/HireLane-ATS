import { CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getAssignmentView, getRunnerData } from "@/server/assessments/delivery";

import { ConsentScreen } from "./consent-screen";
import { TestRunner } from "./test-runner";

export const metadata = { title: "Assessment" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
    </div>
  );
}

function Notice({
  icon: Icon,
  tone,
  title,
  body,
  token,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "muted";
  title: string;
  body: string;
  token: string;
}) {
  return (
    <Shell>
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-card">
        <span
          className={
            tone === "success"
              ? "mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
              : "mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          }
        >
          <Icon className="size-6" />
        </span>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href={`/candidate/${token}`}>Back to your portal</Link>
        </Button>
      </div>
    </Shell>
  );
}

export default async function TestAssignmentPage({
  params,
}: {
  params: Promise<{ token: string; assignmentId: string }>;
}) {
  const { token, assignmentId } = await params;
  const view = await getAssignmentView(token, assignmentId);

  if (!view) {
    return (
      <Notice
        icon={ShieldAlert}
        tone="muted"
        title="This assessment isn't available"
        body="The link may be invalid or expired. Please contact whoever invited you."
        token={token}
      />
    );
  }

  // Resume an in-progress attempt (or show the result if it just finalised).
  if (view.activeAttemptId) {
    const runner = await getRunnerData(token, view.activeAttemptId);
    if (runner?.state === "active") {
      return <TestRunner token={token} data={runner} />;
    }
    return (
      <Notice
        icon={CheckCircle2}
        tone="success"
        title="Your assessment is in"
        body="Thanks — your answers were submitted. The hiring team will review your results."
        token={token}
      />
    );
  }

  if (view.status === "submitted") {
    return (
      <Notice
        icon={CheckCircle2}
        tone="success"
        title="Already submitted"
        body="You've completed this assessment. The hiring team will be in touch."
        token={token}
      />
    );
  }

  if (view.blockedReason) {
    return <Notice icon={Clock} tone="muted" title="Can't start this assessment" body={view.blockedReason} token={token} />;
  }

  return <ConsentScreen token={token} view={view} />;
}
