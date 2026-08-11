"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InterviewMode } from "@/types/database";
import { scheduleInterviewAction } from "@/server/interviews/actions";

export type ApplicationOption = { id: string; candidateName: string; openingTitle: string | null };
export type MemberOption = { id: string; name: string; email: string };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MODES: { value: InterviewMode; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "onsite", label: "On-site" },
];

export function ScheduleDialog({
  applications,
  members,
}: {
  applications: ApplicationOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [applicationId, setApplicationId] = React.useState("");
  const [title, setTitle] = React.useState("Interview");
  const [round, setRound] = React.useState("");
  const [mode, setMode] = React.useState<InterviewMode>("video");
  const [when, setWhen] = React.useState("");
  const [duration, setDuration] = React.useState(45);
  const [videoLink, setVideoLink] = React.useState("");
  const [panelists, setPanelists] = React.useState<string[]>([]);

  function togglePanelist(id: string) {
    setPanelists((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function submit() {
    if (!applicationId) {
      toast.error("Choose a candidate.");
      return;
    }
    if (!when) {
      toast.error("Pick a date and time.");
      return;
    }
    setBusy(true);
    const scheduledAt = new Date(when).toISOString(); // datetime-local → UTC
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const r = await scheduleInterviewAction({
      applicationId,
      title,
      round,
      mode,
      scheduledAt,
      durationMinutes: duration,
      timezone,
      videoLink,
      panelistIds: panelists,
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Interview scheduled.");
      setOpen(false);
      router.push(`/interviews/${r.interviewId}`);
    } else {
      toast.error(r.error);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus /> Schedule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule an interview</DialogTitle>
            <DialogDescription>
              Sets up the room and a downloadable calendar invite.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            <Field id="application" label="Candidate" required>
              <select
                className={selectClass}
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
              >
                <option value="">Select a candidate…</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.candidateName}
                    {a.openingTitle ? ` — ${a.openingTitle}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field id="title" label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interview" />
              </Field>
              <Field id="round" label="Round (optional)">
                <Input value={round} onChange={(e) => setRound(e.target.value)} placeholder="Technical" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field id="when" label="Date & time" required>
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </Field>
              <Field id="duration" label="Duration (min)">
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(5, Math.min(480, Number(e.target.value) || 45)))}
                />
              </Field>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Mode</label>
              <div className="flex flex-wrap gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      mode === m.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === "video" && (
              <Field id="videoLink" label="Video link" hint="Paste a Zoom / Meet / Teams link">
                <Input
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value)}
                  placeholder="https://meet.google.com/…"
                />
              </Field>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Panel (you&rsquo;re added automatically)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => togglePanelist(m.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      panelists.includes(m.id)
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.name}
                  </button>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-muted-foreground">No other team members yet.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
