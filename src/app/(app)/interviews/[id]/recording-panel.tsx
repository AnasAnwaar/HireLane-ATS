"use client";

import { Download, FileAudio, Loader2, Mic, ScrollText, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  saveRecordingAction,
  setRecordingConsentAction,
  transcribeRecordingAction,
} from "@/server/interviews/actions";

const BUCKET = "interview-recordings";
const ACCEPT = "audio/*,video/mp4,video/webm";

export function RecordingPanel({
  interviewId,
  orgId,
  consent,
  hasRecording,
  transcript,
  signedUrl,
  canRecord,
  canViewRecording,
  canTranscript,
}: {
  interviewId: string;
  orgId: string;
  consent: boolean;
  hasRecording: boolean;
  transcript: string | null;
  signedUrl: string | null;
  canRecord: boolean;
  canViewRecording: boolean;
  canTranscript: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggleConsent(next: boolean) {
    setBusy("consent");
    const r = await setRecordingConsentAction(interviewId, next);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else toast.error(r.error);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const path = `${orgId}/${interviewId}/recording-${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) {
      setBusy(null);
      toast.error(error.message || "Upload failed.");
      return;
    }
    const r = await saveRecordingAction(interviewId, path);
    setBusy(null);
    if (r.ok) {
      toast.success("Recording saved.");
      router.refresh();
    } else toast.error(r.error);
  }

  async function transcribe() {
    setBusy("transcribe");
    const r = await transcribeRecordingAction(interviewId);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Transcript ready.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Mic className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Recording &amp; transcript</p>
        {hasRecording && (
          <Badge variant="secondary" className="ml-auto">
            Recording on file
          </Badge>
        )}
      </div>

      {/* Consent gate */}
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={!canRecord || busy !== null}
          onChange={(e) => toggleConsent(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          The candidate has consented to this interview being recorded.
          <span className="block text-xs text-muted-foreground">
            Required before a recording can be stored or transcribed.
          </span>
        </span>
      </label>

      {/* Upload (from the external call tool) */}
      {canRecord && (
        <div className="mt-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={!consent || busy !== null}
            title={consent ? undefined : "Record consent first"}
          >
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />}
            {hasRecording ? "Replace recording" : "Upload recording"}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Upload the file your call tool produced (audio or MP4).
          </p>
        </div>
      )}

      {/* Playback */}
      {hasRecording && canViewRecording && signedUrl && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileAudio className="size-4 text-muted-foreground" />
            <span className="font-medium">Recording</span>
            <a
              href={signedUrl}
              download
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="size-3.5" /> Download
            </a>
          </div>
          <audio controls src={signedUrl} className="w-full" />
        </div>
      )}
      {hasRecording && !canViewRecording && (
        <p className="mt-4 text-sm text-muted-foreground">
          A recording is on file — viewing it requires the view-recording permission.
        </p>
      )}

      {/* Transcript */}
      {hasRecording && canTranscript && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Transcript</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={transcribe} disabled={busy !== null}>
              {busy === "transcribe" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {transcript ? "Re-transcribe" : "Transcribe with AI"}
            </Button>
          </div>
          {transcript ? (
            <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {transcript}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Generate a searchable transcript from the recording.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
