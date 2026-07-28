"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { STAGE_META } from "@/lib/applicants-display";
import { cn } from "@/lib/utils";
import type { ApplicationStage } from "@/types/database";
import { changeApplicationStageAction } from "@/server/applicants/actions";

const STAGES: ApplicationStage[] = [
  "applied",
  "screened",
  "shortlisted",
  "test_assigned",
  "test_completed",
  "interview_scheduled",
  "interviewed",
  "offer",
  "hired",
  "on_hold",
  "rejected",
  "withdrawn",
];

/** Inline stage selector — changes the application's pipeline stage. */
export function StageControl({
  applicationId,
  stage,
}: {
  applicationId: string;
  stage: ApplicationStage;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(stage);
  const [pending, setPending] = React.useState(false);

  async function change(next: ApplicationStage) {
    const prev = value;
    setValue(next);
    setPending(true);
    const result = await changeApplicationStageAction(applicationId, next);
    setPending(false);
    if (result.ok) {
      toast.success(`Moved to ${STAGE_META[next].label}.`);
      router.refresh();
    } else {
      setValue(prev);
      toast.error(result.error);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {pending && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as ApplicationStage)}
        className={cn(
          "h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label="Application stage"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_META[s].label}
          </option>
        ))}
      </select>
    </span>
  );
}
