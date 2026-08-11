import type {
  InterviewMode,
  InterviewStatus,
  ScorecardRecommendation,
} from "@/types/database";

export const INTERVIEW_STATUS_META: Record<
  InterviewStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  no_show: { label: "No-show", variant: "destructive" },
};

export const INTERVIEW_MODE_META: Record<InterviewMode, { label: string }> = {
  video: { label: "Video" },
  phone: { label: "Phone" },
  onsite: { label: "On-site" },
};

export const RECOMMENDATION_META: Record<
  ScorecardRecommendation,
  { label: string; variant: "success" | "warning" | "destructive"; score: number }
> = {
  strong_yes: { label: "Strong yes", variant: "success", score: 2 },
  yes: { label: "Yes", variant: "success", score: 1 },
  no: { label: "No", variant: "destructive", score: -1 },
  strong_no: { label: "Strong no", variant: "destructive", score: -2 },
};

export const RECOMMENDATION_ORDER: ScorecardRecommendation[] = [
  "strong_yes",
  "yes",
  "no",
  "strong_no",
];
