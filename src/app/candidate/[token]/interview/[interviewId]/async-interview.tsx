"use client";

import { CheckCircle2, Circle, Loader2, RotateCcw, Send, Square, Video } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AsyncQuestion } from "@/types/database";
import {
  registerAsyncAnswerAction,
  startAsyncAnswerUploadAction,
} from "@/server/interviews/async-actions";

const BUCKET = "interview-recordings";

export function AsyncInterview({
  token,
  interviewId,
  questions,
  doneIndexes,
}: {
  token: string;
  interviewId: string;
  questions: AsyncQuestion[];
  doneIndexes: number[];
}) {
  const [done, setDone] = React.useState<Set<number>>(new Set(doneIndexes));
  const [current, setCurrent] = React.useState(() => {
    const first = questions.findIndex((_, i) => !new Set(doneIndexes).has(i));
    return first === -1 ? 0 : first;
  });

  if (questions.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">No questions were set for this interview.</p>;
  }

  const allDone = done.size >= questions.length;

  return (
    <div className="mt-6">
      {/* Progress */}
      <div className="mb-4 flex flex-wrap gap-2">
        {questions.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              i === current ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground",
            )}
          >
            {done.has(i) ? <CheckCircle2 className="size-3.5 text-success" /> : <Circle className="size-3.5" />}
            Q{i + 1}
          </button>
        ))}
      </div>

      {allDone ? (
        <div className="rounded-xl border border-success/30 bg-success-soft/50 p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-2 font-medium">All answers submitted</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks — the hiring team will review your responses. You can close this page.
          </p>
        </div>
      ) : (
        <QuestionRecorder
          key={current}
          token={token}
          interviewId={interviewId}
          index={current}
          question={questions[current]}
          alreadyDone={done.has(current)}
          onSubmitted={() => {
            setDone((d) => new Set(d).add(current));
            const next = questions.findIndex((_, i) => i > current && !done.has(i));
            if (next !== -1) setCurrent(next);
          }}
        />
      )}
    </div>
  );
}

type Phase = "idle" | "recording" | "recorded" | "uploading";

function QuestionRecorder({
  token,
  interviewId,
  index,
  question,
  alreadyDone,
  onSubmitted,
}: {
  token: string;
  interviewId: string;
  index: number;
  question: AsyncQuestion;
  alreadyDone: boolean;
  onSubmitted: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const blobRef = React.useRef<Blob | null>(null);
  const startedAtRef = React.useRef<number>(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [ready, setReady] = React.useState(false);

  const stopStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        toast.error("Camera and microphone access is required to record.");
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      stopStream();
    };
  }, [stopStream]);

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    blobRef.current = null;
    const recorder = new MediaRecorder(stream, { mimeType: pickMime() });
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.muted = false;
        videoRef.current.src = URL.createObjectURL(blobRef.current);
      }
      setPhase("recorded");
    };
    recorder.start();
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(s);
      if (s >= question.max_seconds) stop();
    }, 250);
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function reRecord() {
    // Re-acquire the live preview.
    setPhase("idle");
    blobRef.current = null;
    const stream = streamRef.current;
    if (stream && videoRef.current) {
      videoRef.current.src = "";
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play().catch(() => {});
    }
  }

  async function submit() {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("uploading");
    const start = await startAsyncAnswerUploadAction(token, interviewId, index);
    if (!start.ok) {
      setPhase("recorded");
      toast.error(start.error);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(start.path, start.token, blob, { contentType: blob.type });
    if (error) {
      setPhase("recorded");
      toast.error(error.message || "Upload failed.");
      return;
    }
    const reg = await registerAsyncAnswerAction(token, interviewId, index, start.path, elapsed);
    if (!reg.ok) {
      setPhase("recorded");
      toast.error(reg.error ?? "Couldn't save your answer.");
      return;
    }
    stopStream();
    toast.success("Answer submitted.");
    onSubmitted();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Question {index + 1}
          {alreadyDone && <span className="ml-2 text-success">· answered (re-recording replaces it)</span>}
        </p>
        <p className="text-xs text-muted-foreground">Up to {question.max_seconds}s</p>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-lg font-medium leading-snug">{question.prompt}</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoRef}
          playsInline
          controls={phase === "recorded"}
          className="mx-auto aspect-video w-full max-w-lg object-cover"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {phase === "idle" && (
          <Button onClick={start} disabled={!ready}>
            <Video /> {ready ? "Start recording" : "Preparing camera…"}
          </Button>
        )}
        {phase === "recording" && (
          <Button variant="destructive" onClick={stop}>
            <Square /> Stop ({question.max_seconds - elapsed}s)
          </Button>
        )}
        {phase === "recorded" && (
          <>
            <Button onClick={submit}>
              <Send /> Submit answer
            </Button>
            <Button variant="outline" onClick={reRecord}>
              <RotateCcw /> Re-record
            </Button>
          </>
        )}
        {phase === "uploading" && (
          <Button disabled>
            <Loader2 className="animate-spin" /> Uploading…
          </Button>
        )}
      </div>
    </div>
  );
}

function pickMime(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}
