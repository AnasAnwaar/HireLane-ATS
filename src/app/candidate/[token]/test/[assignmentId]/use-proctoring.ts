"use client";

import * as React from "react";

import { PROCTORING_EVENT_META, proctoringNeedsMic } from "@/lib/assessments-display";
import type { ProctoringLevel } from "@/types/database";
import {
  recordProctoringEventAction,
  submitAudioSampleAction,
} from "@/server/assessments/proctoring-actions";

/**
 * Browser-side proctoring capture (spec §UC-5.3, CP-19). Attaches integrity
 * listeners while the test runs, reports each event to the server (which stamps
 * severity and escalates), and surfaces the in-test warning + breach state. No
 * capture at all when the level is "off".
 */
export function useProctoring({
  token,
  attemptId,
  level,
}: {
  token: string;
  attemptId: string;
  level: ProctoringLevel;
}) {
  const enabled = level !== "off";
  const [warning, setWarning] = React.useState<string | null>(null);
  const [breaches, setBreaches] = React.useState(0);
  const [flagged, setFlagged] = React.useState(false);
  const lastAt = React.useRef<Record<string, number>>({});

  const record = React.useCallback(
    async (type: string) => {
      const now = Date.now();
      // Throttle repeated same-type events (a tab-switch fires visibility + blur).
      if (now - (lastAt.current[type] ?? 0) < 1500) return;
      lastAt.current[type] = now;
      setWarning(`${PROCTORING_EVENT_META[type]?.label ?? "Activity"} — this has been recorded.`);
      const r = await recordProctoringEventAction(token, attemptId, type);
      if (r.ok) {
        setBreaches(r.breachCount);
        setFlagged(r.flagged);
      }
    },
    [token, attemptId],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.hidden) void record("tab_switch");
    };
    const onBlur = () => {
      if (!document.hidden) void record("window_blur");
    };
    const onFs = () => {
      if (!document.fullscreenElement) void record("fullscreen_exit");
    };
    const onCopy = () => void record("copy");
    const onPaste = () => void record("paste");
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      void record("right_click");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onCtx);

    // Dev-tools heuristic — a large viewport/chrome delta often means an open
    // inspector. High threshold to keep false positives down (probabilistic, R4).
    const devtools = setInterval(() => {
      if (window.outerWidth - window.innerWidth > 240 || window.outerHeight - window.innerHeight > 240) {
        void record("devtools");
      }
    }, 3000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onCtx);
      clearInterval(devtools);
    };
  }, [enabled, record]);

  // Auto-dismiss the warning banner.
  React.useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 4500);
    return () => clearTimeout(t);
  }, [warning]);

  // Periodic exam-audio sampling for additional-voice analysis (Standard/Strict).
  React.useEffect(() => {
    if (!enabled || !proctoringNeedsMic(level)) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let count = 0;
    let loop: ReturnType<typeof setTimeout> | null = null;

    function captureOne() {
      if (stopped || !stream) return;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, { mimeType: audioMime() });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: rec.mimeType });
        const dataUrl = await blobToDataUrl(blob);
        await submitAudioSampleAction(token, attemptId, dataUrl, count % 3).catch(() => {});
        count += 1;
      };
      rec.start();
      setTimeout(() => rec.state !== "inactive" && rec.stop(), 5000); // 5s clip
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return; // mic denied — already recorded at check-in
      }
      const schedule = () => {
        if (stopped || count >= 6) return; // cap total captures
        captureOne();
        loop = setTimeout(schedule, 90_000);
      };
      loop = setTimeout(schedule, 20_000);
    })();

    return () => {
      stopped = true;
      if (loop) clearTimeout(loop);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, level, token, attemptId]);

  return { enabled, warning, breaches, flagged, dismiss: () => setWarning(null) };
}

function audioMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}
