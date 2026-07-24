/**
 * Permission keys — the vendor-defined capability catalogue (spec §9.1).
 *
 * These mirror the rows seeded in `supabase/migrations/0007_...`. The database
 * is the source of truth at runtime; this file exists so application code
 * references keys with autocomplete and compile-time checking instead of raw
 * strings that typo silently.
 *
 * Keep in sync with 0007. `scripts/check-permission-keys.cjs` fails CI if this
 * list and the database catalogue diverge.
 */

export const PERMISSION_KEYS = [
  // Administration
  "administration.manage_company_profile",
  "administration.manage_users",
  "administration.manage_roles",
  "administration.manage_departments",
  "administration.configure_workflow",
  "administration.configure_ai_policy",
  "administration.configure_security",
  "administration.manage_billing",
  "administration.view_audit_log",
  "administration.transfer_ownership",
  // Integrations
  "integrations.view",
  "integrations.connect",
  "integrations.disconnect",
  "integrations.reauthorise",
  // Job openings
  "job_openings.view",
  "job_openings.create",
  "job_openings.edit",
  "job_openings.delete",
  "job_openings.approve",
  "job_openings.publish",
  "job_openings.schedule",
  "job_openings.close",
  "job_openings.edit_live_post",
  "job_openings.manage_approvals",
  // Post generation
  "post_generation.generate",
  "post_generation.edit",
  "post_generation.regenerate",
  "post_generation.override_seo",
  // Applicants
  "applicants.view_list",
  "applicants.view_profile",
  "applicants.import",
  "applicants.connect",
  "applicants.send_invitation",
  "applicants.merge",
  "applicants.transfer",
  "applicants.export",
  // Screening
  "screening.view_score",
  "screening.view_report",
  "screening.adjust_weights",
  "screening.rerank",
  "screening.override",
  // Assessments
  "assessments.view",
  "assessments.create_manual",
  "assessments.generate_ai",
  "assessments.edit",
  "assessments.manage_bank",
  "assessments.assign",
  "assessments.extend_deadline",
  "assessments.grant_retake",
  "assessments.view_answers",
  "assessments.confirm_grades",
  // Proctoring
  "proctoring.set_level",
  "proctoring.view_summary",
  "proctoring.view_evidence",
  "proctoring.invalidate",
  "proctoring.disable",
  // Interviews
  "interviews.view_schedule",
  "interviews.schedule",
  "interviews.join",
  "interviews.enable_recording",
  "interviews.view_recording",
  "interviews.view_transcript",
  "interviews.submit_scorecard",
  "interviews.view_others_scorecards",
  // Profile & collaboration
  "profile.add_note",
  "profile.edit_own_note",
  "profile.view_team_notes",
  "profile.view_management_notes",
  "profile.mention_users",
  "profile.upload_documents",
  "profile.view_documents",
  // Pipeline decisions
  "pipeline.advance",
  "pipeline.move_backward",
  "pipeline.hold",
  "pipeline.reject",
  "pipeline.approve_rejection",
  "pipeline.mark_hired",
  "pipeline.add_to_talent_pool",
  // Reporting
  "reporting.view_own",
  "reporting.view_department",
  "reporting.view_company",
  "reporting.view_diversity",
  "reporting.export",
  // Sensitive fields (field-level visibility)
  "fields.view_salary",
  "fields.view_candidate_contact",
  "fields.view_candidate_documents",
  "fields.view_private_notes",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * The field-visibility permissions (spec §UC-0 step 5). Distinguished from
 * action permissions because they gate *columns*, applied through the masking
 * helpers in `fields.ts` rather than blocking an action outright.
 */
export const FIELD_PERMISSION_KEYS = [
  "fields.view_salary",
  "fields.view_candidate_contact",
  "fields.view_candidate_documents",
  "fields.view_private_notes",
] as const satisfies readonly PermissionKey[];

export type FieldPermissionKey = (typeof FIELD_PERMISSION_KEYS)[number];

/** The four data scopes, widest to narrowest (spec §UC-0). */
export type PermissionScope = "all" | "department" | "assigned" | "own";
