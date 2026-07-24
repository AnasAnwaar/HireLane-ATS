"use client";

import { Loader2, Pause, Play, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { changeOpeningStatusAction } from "@/server/openings/actions";
import type { OpeningStatus } from "@/types/database";

/**
 * Status controls on the opening detail page. Which buttons show depends on the
 * current status and the viewer's permissions (passed from the server).
 */
export function StatusActions({
  openingId,
  status,
  canEdit,
  canClose,
}: {
  openingId: string;
  status: OpeningStatus;
  canEdit: boolean;
  canClose: boolean;
}) {
  const [pending, setPending] = React.useState<OpeningStatus | null>(null);

  async function change(to: OpeningStatus) {
    setPending(to);
    const result = await changeOpeningStatusAction(openingId, to);
    setPending(null);
    if (result.ok) toast.success(result.message ?? "Updated.");
    else toast.error(result.error);
  }

  const busy = (to: OpeningStatus) => pending === to;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (status === "draft" || status === "on_hold" || status === "closed") && (
        <Button size="sm" onClick={() => change("open")} disabled={pending !== null}>
          {busy("open") ? <Loader2 className="animate-spin" /> : <Play />}
          {status === "draft" ? "Open" : "Reopen"}
        </Button>
      )}

      {canEdit && status === "open" && (
        <Button size="sm" variant="outline" onClick={() => change("on_hold")} disabled={pending !== null}>
          {busy("on_hold") ? <Loader2 className="animate-spin" /> : <Pause />}
          Put on hold
        </Button>
      )}

      {canClose && status !== "closed" && (
        <Button size="sm" variant="outline" onClick={() => change("closed")} disabled={pending !== null}>
          {busy("closed") ? <Loader2 className="animate-spin" /> : <X />}
          Close
        </Button>
      )}
    </div>
  );
}
