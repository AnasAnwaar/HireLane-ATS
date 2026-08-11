"use client";

import * as React from "react";

import { PROCTORING_EVENT_META } from "@/lib/assessments-display";
import type { ProctoringLevel } from "@/types/database";
import { recordProctoringEventAction } from "@/server/assessments/proctoring-actions";

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

  return { enabled, warning, breaches, flagged, dismiss: () => setWarning(null) };
}
