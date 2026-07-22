import { z } from "zod";

/**
 * Shared between the client form and the server action, so validation can never
 * differ between the two. The server always re-validates — client-side checks
 * are a convenience, never a control.
 */

const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Too long — 72 characters maximum")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), "Include an upper and lower case letter")
  .refine((v) => /[0-9]/.test(v), "Include a number");

export const signUpSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Company name is required")
    .max(120, "Company name is too long"),
  fullName: z.string().trim().min(2, "Your name is required").max(120, "Name is too long"),
  email: z.email("Enter a valid email address").max(255),
  password,
  preset: z.enum(["standard", "strict"]).default("standard"),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  fullName: z.string().trim().min(2, "Your name is required").max(120),
  password,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Uniform shape returned by every auth server action. */
export type ActionResult =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Turn a zod error into the field-error map the forms render. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
