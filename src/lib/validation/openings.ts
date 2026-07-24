import { z } from "zod";

/** Shared between the requisition form and the server action. */

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "temporary", label: "Temporary" },
] as const;

export const WORK_MODES = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

export const OPENING_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
] as const;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const openingSchema = z
  .object({
    title: z.string().trim().min(2, "Give the role a title").max(160),
    departmentId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    employmentType: z.enum(["full_time", "part_time", "contract", "internship", "temporary"]),
    workMode: z.enum(["on_site", "hybrid", "remote"]),
    location: optionalTrimmed(160),
    experienceMin: optionalInt,
    experienceMax: optionalInt,
    salaryMin: optionalNumber,
    salaryMax: optionalNumber,
    salaryCurrency: optionalTrimmed(3),
    salaryVisible: z.coerce.boolean().default(false),
    description: z.string().trim().max(20000).default(""),
    positions: z.coerce.number().int().min(1).max(999).default(1),
    applicationDeadline: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    // Newline-separated in the form; split into rows server-side.
    mustHaves: z.string().optional().default(""),
    niceToHaves: z.string().optional().default(""),
    qualifications: z.string().optional().default(""),
    screeningQuestions: z.string().optional().default(""),
  })
  .refine(
    (d) => d.experienceMax === null || d.experienceMin === null || d.experienceMax >= d.experienceMin,
    { message: "Maximum experience can't be less than minimum", path: ["experienceMax"] },
  )
  .refine(
    (d) => d.salaryMax === null || d.salaryMin === null || d.salaryMax >= d.salaryMin,
    { message: "Maximum salary can't be less than minimum", path: ["salaryMax"] },
  );

export type OpeningInput = z.infer<typeof openingSchema>;

/** Split a textarea of newline-separated items into trimmed, non-empty lines. */
export function linesToItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}
