import { FileText, Flag, MessageSquare, Send } from "lucide-react";

import { cn, formatDate } from "@/lib/utils";
import type { TimelineEvent } from "@/server/candidates/queries";

const ICONS: Record<TimelineEvent["kind"], React.ComponentType<{ className?: string }>> = {
  applied: Send,
  stage: Flag,
  note: MessageSquare,
  other: FileText,
};

/**
 * Candidate timeline (spec §UC-6). Read-only, assembled from application events,
 * stage-change audit entries and notes — the append-only history the whole team
 * reviews. Server component; no interactivity.
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {events.map((e, i) => {
        const Icon = ICONS[e.kind];
        return (
          <li key={e.id} className="flex gap-3">
            <span className="relative flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  e.kind === "note"
                    ? "bg-primary-soft text-primary"
                    : e.kind === "stage"
                      ? "bg-sand-soft text-sand-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </span>
              {i < events.length - 1 && (
                <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
              )}
            </span>
            <div className="min-w-0 pb-1">
              <p className="text-sm font-medium">{e.label}</p>
              <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.actor ? `${e.actor} · ` : ""}
                {formatDate(e.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
