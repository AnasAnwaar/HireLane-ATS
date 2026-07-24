import type {
  EmploymentType,
  OpeningStatus,
  RequirementKind,
  WorkMode,
} from "@/types/database";

/** Display metadata for opening enums — one place, used by list and detail. */

export const STATUS_META: Record<
  OpeningStatus,
  { label: string; variant: "default" | "success" | "warning" | "secondary" | "destructive" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_approval: { label: "Pending approval", variant: "warning" },
  open: { label: "Open", variant: "success" },
  on_hold: { label: "On hold", variant: "warning" },
  closed: { label: "Closed", variant: "secondary" },
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  on_site: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

export const REQUIREMENT_LABELS: Record<RequirementKind, string> = {
  must_have: "Must have",
  nice_to_have: "Nice to have",
  qualification: "Qualification",
  certification: "Certification",
};

/** "3–5 yrs" / "5+ yrs" / "Up to 3 yrs" / null. */
export function experienceLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

/** Formatted salary band, or null when hidden/absent. */
export function salaryLabel(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min === null && max === null) return null;
  const cur = currency ?? "";
  const fmt = (n: number) => n.toLocaleString();
  if (min !== null && max !== null) return `${cur} ${fmt(min)}–${fmt(max)}`.trim();
  if (min !== null) return `${cur} ${fmt(min)}+`.trim();
  return `${cur} up to ${fmt(max as number)}`.trim();
}
