"use client";

import {
  Camera,
  CheckCircle2,
  Clock,
  FileQuestion,
  Loader2,
  Monitor,
  ShieldCheck,
  Video,
  Wifi,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  PROCTORING_META,
  PROCTORING_SIGNALS,
  proctoringNeedsCamera,
  proctoringNeedsMic,
} from "@/lib/assessments-display";
import { formatDate } from "@/lib/utils";
import type { ProctoringLevel } from "@/types/database";
import { startAttemptAction } from "@/server/assessments/attempt-actions";
import { submitCheckInAction } from "@/server/assessments/proctoring-actions";
import type { AssignmentView } from "@/server/assessments/delivery";

export function ConsentScreen({ token, view }: { token: string; view: AssignmentView }) {
  const router = useRouter();
  const level = view.proctoringLevel as ProctoringLevel;
  const proctored = level !== "off";
  const needsCamera = proctoringNeedsCamera(level);
  const needsMic = proctoringNeedsMic(level);

  const [consent, setConsent] = React.useState(false);
  const [phase, setPhase] = React.useState<"intro" | "check">("intro");
  const [busy, setBusy] = React.useState(false);
  const [camState, setCamState] = React.useState<"idle" | "live" | "denied" | "captured">("idle");
  const photoRef = React.useRef<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  React.useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: needsMic });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamState("live");
    } catch {
      setCamState("denied");
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d")?.drawImage(v, 0, 0, 320, 240);
    photoRef.current = canvas.toDataURL("image/jpeg", 0.7);
    setCamState("captured");
  }

  async function begin() {
    setBusy(true);
    const r = await startAttemptAction(token, view.id, consent);
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error);
      return;
    }
    if (needsCamera) {
      // Best-effort check-in; a denied camera is recorded, never blocking.
      await submitCheckInAction(token, r.attemptId, photoRef.current ?? "");
    }
    stopCamera();
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-6">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{view.testTitle}</h1>
        {view.instructions && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {view.instructions}
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact icon={FileQuestion} label="Questions" value={String(view.questionCount)} />
          <Fact icon={Clock} label="Time limit" value={view.durationMinutes ? `${view.durationMinutes} min` : "Untimed"} />
          <Fact icon={Video} label="Proctoring" value={PROCTORING_META[level]?.label ?? "Standard"} />
        </div>

        {view.deadline && (
          <p className="mt-4 text-sm text-muted-foreground">
            Complete by <span className="font-medium text-foreground">{formatDate(view.deadline)}</span>.
          </p>
        )}

        {phase === "intro" ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" /> Before you begin
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>• The timer starts as soon as you begin and keeps running if you disconnect.</li>
              <li>• Your answers save automatically — you can safely resume within the time limit.</li>
              {view.durationMinutes && <li>• The test submits itself when the time is up.</li>}
            </ul>

            {proctored && (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft/50 p-3.5">
                <p className="text-xs font-semibold text-foreground">
                  This assessment is monitored — {PROCTORING_META[level].label}. We record:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {PROCTORING_SIGNALS[level].map((s) => (
                    <li key={s} className="flex items-start gap-1.5">
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-warning" /> {s}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                  We only flag activity for a human to review — the system never rejects you.
                </p>
              </div>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                I understand the rules{proctored ? " and consent to the monitoring listed above" : ""}.
              </span>
            </label>

            <Button
              className="mt-5 w-full"
              disabled={busy || !consent}
              onClick={() => {
                if (needsCamera) {
                  setPhase("check");
                  void startCamera();
                } else {
                  void begin();
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {needsCamera ? "Continue to system check" : "Begin assessment"}
            </Button>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Monitor className="size-4 text-primary" /> System check
            </h2>

            <div className="mt-3 space-y-2 text-sm">
              <CheckRow ok icon={Wifi} label="Network connection" note="Online" />
              <CheckRow ok icon={Monitor} label="Browser" note="Full-screen supported" />
              <CheckRow
                ok={camState === "live" || camState === "captured"}
                icon={Camera}
                label={needsMic ? "Camera & microphone" : "Camera"}
                note={camState === "denied" ? "Not available — you can still proceed" : camState === "captured" ? "Check-in captured" : "Requesting…"}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-black/90">
              <video ref={videoRef} muted playsInline className="mx-auto aspect-[4/3] w-full max-w-xs object-cover" />
            </div>

            <div className="mt-3 flex items-center gap-2">
              {camState === "live" && (
                <Button variant="outline" size="sm" onClick={capture}>
                  <Camera /> Capture check-in photo
                </Button>
              )}
              {camState === "captured" && (
                <span className="inline-flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="size-4" /> Check-in captured
                </span>
              )}
              {camState === "denied" && (
                <span className="text-sm text-muted-foreground">
                  Camera access was denied — this is recorded; you can still take the test.
                </span>
              )}
            </div>

            <Button
              className="mt-5 w-full"
              disabled={busy || (camState !== "captured" && camState !== "denied")}
              onClick={() => void begin()}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Begin assessment
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function CheckRow({
  ok,
  icon: Icon,
  label,
  note,
}: {
  ok: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <span className={ok ? "text-xs text-success" : "text-xs text-muted-foreground"}>{note}</span>
      {ok && <CheckCircle2 className="size-4 text-success" />}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center shadow-card">
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
