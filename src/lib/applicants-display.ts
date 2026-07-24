import type { ApplicationStage } from "@/types/database";

/** Display metadata for pipeline stages (spec §UC-6 pipeline). */
export const STAGE_META: Record<
  ApplicationStage,
  { label: string; variant: "default" | "success" | "warning" | "secondary" | "destructive" }
> = {
  applied: { label: "Applied", variant: "secondary" },
  screened: { label: "Screened", variant: "default" },
  shortlisted: { label: "Shortlisted", variant: "default" },
  test_assigned: { label: "Test assigned", variant: "warning" },
  test_completed: { label: "Test completed", variant: "default" },
  interview_scheduled: { label: "Interview scheduled", variant: "warning" },
  interviewed: { label: "Interviewed", variant: "default" },
  offer: { label: "Offer", variant: "success" },
  hired: { label: "Hired", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  on_hold: { label: "On hold", variant: "warning" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
};

/** The forward pipeline order (excludes terminal/side states). */
export const PIPELINE_ORDER: ApplicationStage[] = [
  "applied",
  "screened",
  "shortlisted",
  "test_assigned",
  "test_completed",
  "interview_scheduled",
  "interviewed",
  "offer",
  "hired",
];
