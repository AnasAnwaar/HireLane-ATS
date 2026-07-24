import { z } from "zod";

/** Public application form (spec §UC-3). Shared by the form and the action. */
export const applySchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(160),
  email: z.email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  headline: z.string().trim().max(160).optional().or(z.literal("")),
  yearsExperience: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(80, Math.trunc(n))) : null;
    }),
  linkedinUrl: z.string().trim().max(300).optional().or(z.literal("")),
  portfolioUrl: z.string().trim().max(300).optional().or(z.literal("")),
  coverNote: z.string().trim().max(5000).optional().or(z.literal("")),
});

export type ApplyInput = z.infer<typeof applySchema>;

/** Manual-add form used by HR inside the app (no cover note / lighter). */
export const manualCandidateSchema = z.object({
  fullName: z.string().trim().min(2, "Enter their name").max(160),
  email: z.email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  headline: z.string().trim().max(160).optional().or(z.literal("")),
  yearsExperience: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(80, Math.trunc(n))) : null;
    }),
  source: z.string().trim().max(60).optional().or(z.literal("")),
});

export const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB
