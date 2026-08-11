"use client";

import { CalendarClock, CheckCircle2, Loader2, UserX, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InterviewStatus } from "@/types/database";
import { rescheduleInterviewAction, setInterviewStatusAction } from "@/server/interviews/actions";

export function LifecycleActions({
  interviewId,
  status,
  scheduledAtLocal,
}: {
  interviewId: string;
  status: InterviewStatus;
  scheduledAtLocal: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [when, setWhen] = React.useState(scheduledAtLocal);

  async function setStatus(next: InterviewStatus, label: string) {
    setBusy(label);
    const r = await setInterviewStatusAction(interviewId, next);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Updated.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function reschedule() {
    if (!when) {
      toast.error("Pick a new date and time.");
      return;
    }
    setBusy("reschedule");
    const r = await rescheduleInterviewAction(interviewId, new Date(when).toISOString());
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Rescheduled.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">Manage</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {status === "scheduled" ? "Reschedule to" : "Reopen at"}
          </label>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-auto" />
        </div>
        <Button variant="outline" size="sm" onClick={reschedule} disabled={busy !== null}>
          {busy === "reschedule" ? <Loader2 className="animate-spin" /> : <CalendarClock />}
          {status === "scheduled" ? "Reschedule" : "Reopen"}
        </Button>
      </div>

      {status === "scheduled" && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => setStatus("completed", "completed")} disabled={busy !== null}>
            {busy === "completed" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Mark completed
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStatus("no_show", "no_show")} disabled={busy !== null}>
            {busy === "no_show" ? <Loader2 className="animate-spin" /> : <UserX />}
            No-show
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStatus("cancelled", "cancelled")} disabled={busy !== null}>
            {busy === "cancelled" ? <Loader2 className="animate-spin" /> : <XCircle />}
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
