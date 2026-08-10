import type { ConnectionStatus, PostingStatus } from "@/types/database";

export const CATEGORY_LABELS: Record<string, string> = {
  job_board: "Job board",
  social: "Social",
  internal: "Careers page",
};

export const CONNECTION_STATUS_META: Record<
  ConnectionStatus,
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  connected: { label: "Connected", variant: "success" },
  expired: { label: "Re-authorise", variant: "warning" },
  disconnected: { label: "Disconnected", variant: "secondary" },
};

export const POSTING_STATUS_META: Record<
  PostingStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "warning" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  closed: { label: "Closed", variant: "secondary" },
};

/** Initials for a channel with no logo asset. */
export function channelInitials(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
