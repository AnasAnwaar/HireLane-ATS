/**
 * Database types.
 *
 * Hand-written to match `supabase/migrations`. Once the schema is applied to a
 * real project these are replaced wholesale by:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Until then this keeps the Supabase clients type-safe and gives the app layer
 * something honest to compile against.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PermissionScope = "all" | "department" | "assigned" | "own";
export type MembershipStatus = "invited" | "active" | "deactivated";
export type PermissionRisk = "low" | "medium" | "high";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "temporary";
export type WorkMode = "on_site" | "hybrid" | "remote";
export type OpeningStatus = "draft" | "pending_approval" | "open" | "on_hold" | "closed";
export type RequirementKind =
  | "must_have"
  | "nice_to_have"
  | "qualification"
  | "certification";
export type ApplicationStage =
  | "applied"
  | "screened"
  | "shortlisted"
  | "test_assigned"
  | "test_completed"
  | "interview_scheduled"
  | "interviewed"
  | "offer"
  | "hired"
  | "rejected"
  | "on_hold"
  | "withdrawn";
export type DocumentKind = "cv" | "portfolio" | "cover_letter" | "other";
export type NoteVisibility = "private" | "team" | "management";
export type ConnectionMode = "assisted" | "oauth";
export type ConnectionStatus = "connected" | "expired" | "disconnected";
export type PostingStatus = "draft" | "scheduled" | "published" | "failed" | "closed";
export type ScreeningStatus = "scored" | "needs_manual_review" | "failed";
export type ScreeningRecommendation = "strong_fit" | "possible_fit" | "weak_fit";
export type CoverageStatus = "matched" | "partial" | "missing";
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "long_answer"
  | "scenario";
export type TestStatus = "draft" | "published" | "archived";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type ProctoringLevel = "off" | "basic" | "standard" | "strict";
export type TestAssignmentStatus =
  | "assigned"
  | "in_progress"
  | "submitted"
  | "expired"
  | "cancelled";
export type TestAttemptStatus = "in_progress" | "submitted" | "expired";

/** A choice option for MCQ/true-false questions. */
export type QuestionOption = { id: string; text: string };

/** Explainability payloads stored on a screening (spec §UC-4 R1). */
export type CoverageItem = { requirement: string; status: CoverageStatus; evidence: string };
export type CriterionScore = {
  key: string;
  label: string;
  score: number;
  note: string;
  /** Percent weight in the overall score, if this dimension is weighted. */
  weight?: number;
};
export type ScreeningHighlight = { text: string; evidence: string };
export type ScreeningConcern = { text: string };

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Organization = Timestamps & {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  industry: string | null;
  website: string | null;
  timezone: string;
  currency: string;
  locale: string;
  onboarding_completed_at: string | null;
  tagline: string | null;
  description: string | null;
  brand_color: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  careers_url: string | null;
};

export type Profile = Timestamps & {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
};

export type Department = Timestamps & {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  head_membership_id: string | null;
};

export type Membership = Timestamps & {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string | null;
  department_id: string | null;
  job_title: string | null;
  status: MembershipStatus;
  is_owner: boolean;
  deactivated_at: string | null;
};

export type Role = Timestamps & {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string;
  is_owner_role: boolean;
  is_system: boolean;
  sort_order: number;
};

export type Permission = {
  key: string;
  module: string;
  label: string;
  description: string;
  supports_scope: boolean;
  is_field_level: boolean;
  risk: PermissionRisk;
  sort_order: number;
};

export type RolePermission = {
  role_id: string;
  permission_key: string;
  allowed: boolean;
  scope: PermissionScope;
  updated_at: string;
};

export type UserPermissionOverride = {
  id: string;
  organization_id: string;
  membership_id: string;
  permission_key: string;
  allowed: boolean;
  scope: PermissionScope | null;
  reason: string | null;
  expires_at: string | null;
  granted_by: string | null;
  created_at: string;
};

export type Invitation = Timestamps & {
  id: string;
  organization_id: string;
  email: string;
  role_id: string | null;
  department_id: string | null;
  token_hash: string;
  status: InvitationStatus;
  expires_at: string;
  invited_by: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type ApprovalRule = Timestamps & {
  id: string;
  organization_id: string;
  action_key: string;
  approvals_required: number;
  approver_role_ids: string[];
  is_active: boolean;
};

export type AuditLogEntry = {
  id: number;
  organization_id: string;
  actor_membership_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  before_state: Json | null;
  after_state: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type PermissionPreset = {
  key: string;
  name: string;
  description: string;
  sort_order: number;
};

export type PermissionPresetGrant = {
  preset_key: string;
  role_key: string;
  permission_key: string;
  allowed: boolean;
  scope: PermissionScope;
};

export type JobOpening = Timestamps & {
  id: string;
  organization_id: string;
  department_id: string | null;
  created_by: string | null;
  title: string;
  employment_type: EmploymentType;
  work_mode: WorkMode;
  location: string | null;
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_visible: boolean;
  description: string;
  positions: number;
  status: OpeningStatus;
  application_deadline: string | null;
  opened_at: string | null;
  closed_at: string | null;
  scoring_weights: ScoringWeights | null;
};

/** Per-opening weighting of the three primary screening dimensions (percent). */
export type ScoringWeights = { skills: number; experience: number; qualification: number };

export type JobRequirement = {
  id: string;
  job_opening_id: string;
  kind: RequirementKind;
  label: string;
  sort_order: number;
  created_at: string;
};

export type ScreeningQuestion = {
  id: string;
  job_opening_id: string;
  question: string;
  required: boolean;
  sort_order: number;
  created_at: string;
};

export type Candidate = Timestamps & {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  headline: string | null;
  years_experience: number | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  skills: string[];
  created_by: string | null;
  reference_photo_path: string | null;
  in_talent_pool: boolean;
  tags: string[];
};

export type Application = {
  id: string;
  organization_id: string;
  candidate_id: string;
  job_opening_id: string;
  stage: ApplicationStage;
  source: string | null;
  cover_note: string | null;
  screening_answers: Json;
  created_by: string | null;
  applied_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  organization_id: string;
  candidate_id: string | null;
  application_id: string | null;
  kind: DocumentKind;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type NoteMention = { membership_id: string; name: string };

export type CandidateNote = Timestamps & {
  id: string;
  organization_id: string;
  candidate_id: string;
  application_id: string | null;
  author_membership_id: string | null;
  body: string;
  visibility: NoteVisibility;
  parent_id: string | null;
  mentions: NoteMention[];
  edited_at: string | null;
};

export type Notification = {
  id: string;
  organization_id: string;
  recipient_membership_id: string;
  actor_membership_id: string | null;
  type: string;
  candidate_id: string | null;
  note_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export type Competency = { name: string; rating: number };

export type CandidateScorecard = Timestamps & {
  id: string;
  organization_id: string;
  candidate_id: string;
  application_id: string | null;
  author_membership_id: string;
  competencies: Competency[];
  overall: number | null;
  recommendation: ScorecardRecommendation | null;
  comment: string | null;
  submitted: boolean;
  submitted_at: string | null;
};

export type ConflictDeclaration = {
  id: string;
  organization_id: string;
  candidate_id: string;
  membership_id: string;
  reason: string | null;
  created_at: string;
};

export type CandidatePortalInvite = Timestamps & {
  id: string;
  organization_id: string;
  candidate_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_by: string | null;
};

export type Channel = {
  key: string;
  name: string;
  category: string;
  supports_api: boolean;
  max_title_length: number | null;
  max_body_length: number | null;
  supports_media: boolean;
  brand_color: string | null;
  website: string | null;
  sort_order: number;
};

export type ChannelConnection = Timestamps & {
  id: string;
  organization_id: string;
  channel_key: string;
  mode: ConnectionMode;
  status: ConnectionStatus;
  display_name: string | null;
  access_token_cipher: string | null;
  refresh_token_cipher: string | null;
  token_expires_at: string | null;
  connected_by: string | null;
  connected_at: string;
  disconnected_at: string | null;
};

export type JobPosting = Timestamps & {
  id: string;
  organization_id: string;
  job_opening_id: string;
  channel_key: string;
  title: string | null;
  body: string | null;
  seo_score: number | null;
  status: PostingStatus;
  external_url: string | null;
  external_id: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  error: string | null;
  created_by: string | null;
  published_by: string | null;
};

export type ApplicationScreening = Timestamps & {
  id: string;
  organization_id: string;
  application_id: string;
  job_opening_id: string;
  status: ScreeningStatus;
  score: number | null;
  recommendation: ScreeningRecommendation | null;
  summary: string | null;
  must_haves: CoverageItem[];
  nice_to_haves: CoverageItem[];
  criteria: CriterionScore[];
  highlights: ScreeningHighlight[];
  concerns: ScreeningConcern[];
  model: string | null;
  inputs: unknown | null;
  error: string | null;
  override_recommendation: ScreeningRecommendation | null;
  override_reason: string | null;
  overridden_by: string | null;
  overridden_at: string | null;
  scored_by: string | null;
  stale: boolean;
};

export type Test = Timestamps & {
  id: string;
  organization_id: string;
  job_opening_id: string | null;
  title: string;
  instructions: string | null;
  status: TestStatus;
  version: number;
  has_unpublished_changes: boolean;
  duration_minutes: number | null;
  passing_threshold: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_backtrack: boolean;
  attempts_allowed: number;
  proctoring_level: ProctoringLevel;
  is_bank_template: boolean;
  created_by: string | null;
  published_at: string | null;
};

export type TestQuestion = Timestamps & {
  id: string;
  organization_id: string;
  test_id: string;
  sort_order: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct_answers: string[];
  rubric: string | null;
  marks: number;
  skill: string | null;
  difficulty: QuestionDifficulty;
};

export type TestVersion = {
  id: string;
  organization_id: string;
  test_id: string;
  version: number;
  snapshot: unknown;
  published_by: string | null;
  created_at: string;
};

export type QuestionBankItem = Timestamps & {
  id: string;
  organization_id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct_answers: string[];
  rubric: string | null;
  marks: number;
  skill: string | null;
  difficulty: QuestionDifficulty;
  tags: string[];
  created_by: string | null;
};

export type TestAssignment = Timestamps & {
  id: string;
  organization_id: string;
  test_id: string;
  application_id: string;
  candidate_id: string;
  status: TestAssignmentStatus;
  deadline: string | null;
  attempts_allowed: number;
  attempts_used: number;
  extra_time_minutes: number;
  screen_reader_mode: boolean;
  assigned_by: string | null;
};

export type TestAttempt = Timestamps & {
  id: string;
  organization_id: string;
  assignment_id: string;
  test_id: string;
  version: number;
  question_order: string[];
  option_orders: Record<string, string[]>;
  status: TestAttemptStatus;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  consent_at: string | null;
  auto_score: number | null;
  max_score: number | null;
  check_in_photo_path: string | null;
  last_ip_hash: string | null;
  breach_count: number;
  flagged: boolean;
  integrity_decision: IntegrityDecision;
  integrity_reason: string | null;
  integrity_decided_by: string | null;
  integrity_decided_at: string | null;
};

export type IntegrityDecision = "pending" | "accepted" | "invalidated" | "rejected";

export type ProctoringSeverity = "low" | "medium" | "high";

export type ProctoringEvent = {
  id: string;
  organization_id: string;
  attempt_id: string;
  type: string;
  severity: ProctoringSeverity;
  detail: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type IntegrityLevel = "clear" | "low" | "medium" | "high";

/** One AI-attributed integrity signal, carrying its own confidence (spec R4). */
export type ProctoringFinding = {
  signal: string;
  label: string;
  severity: ProctoringSeverity;
  confidence: number; // 0..1
  detail: string;
};

/** AI face read of the check-in frame; `analyzed:false` when no photo was captured. */
export type ProctoringFace = {
  analyzed: boolean;
  face_present: boolean;
  face_count: number;
  note: string;
  /** Identity match vs the enrolled reference photo (CP-20). Null when unchecked. */
  identity_checked: boolean;
  identity_match: boolean | null;
  identity_confidence: number;
};

export type ProctoringAnalysis = {
  id: string;
  organization_id: string;
  attempt_id: string;
  integrity_level: IntegrityLevel;
  confidence: number;
  summary: string;
  findings: ProctoringFinding[];
  face: ProctoringFace | null;
  model: string;
  analyzed_by: string | null;
  analyzed_at: string;
  created_at: string;
};

export type AssessmentPolicy = Timestamps & {
  organization_id: string;
  default_proctoring_level: ProctoringLevel;
  default_duration_minutes: number;
  default_passing_threshold: number | null;
  default_attempts: number;
  default_allow_backtrack: boolean;
  default_shuffle_questions: boolean;
  max_attempts: number;
  updated_by: string | null;
};

export type TestAnswerResponse = { selected?: string[]; text?: string };

export type TestAnswer = Timestamps & {
  id: string;
  organization_id: string;
  attempt_id: string;
  question_id: string;
  response: TestAnswerResponse;
  awarded_marks: number | null;
  is_correct: boolean | null;
  ai_suggested_marks: number | null;
  ai_rationale: string | null;
  confirmed: boolean;
  graded_by: string | null;
  graded_at: string | null;
};

/** Insert helper: server-defaulted columns are optional. */
type Insertable<T, TRequired extends keyof T> = Pick<T, TRequired> &
  Partial<Omit<T, TRequired>>;

/**
 * One foreign-key relationship, in the shape `@supabase/supabase-js` reads to
 * type embedded selects like `.select("organizations(name)")`.
 */
type Rel<Col extends string, RefTable extends string, OneToOne extends boolean = false> = {
  foreignKeyName: string;
  columns: [Col];
  isOneToOne: OneToOne;
  referencedRelation: RefTable;
  referencedColumns: ["id"];
};

/**
 * Table shape expected by `@supabase/supabase-js`.
 *
 * `Relationships` is required by its generics even when empty — omit it and
 * every table silently resolves to `never`, which surfaces as baffling
 * "not assignable to parameter of type 'never'" errors at each call site.
 * Populating it is what makes embedded selects type-check.
 */
type Table<Row, Required extends keyof Row, Rels extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: Rels;
};

// -- Interviews (CP-22) --------------------------------------------------------
export type InterviewMode = "video" | "phone" | "onsite";
export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type ScorecardRecommendation = "strong_yes" | "yes" | "no" | "strong_no";

export type Interview = Timestamps & {
  id: string;
  organization_id: string;
  application_id: string;
  candidate_id: string;
  job_opening_id: string | null;
  title: string;
  round: string | null;
  mode: InterviewMode;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  video_link: string | null;
  location: string | null;
  status: InterviewStatus;
  shared_notes: string | null;
  created_by: string | null;
  recording_consent: boolean;
  recording_path: string | null;
  recording_uploaded_at: string | null;
  transcript: string | null;
  is_async: boolean;
  async_questions: AsyncQuestion[];
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  handled: boolean;
  created_at: string;
};

export type AsyncQuestion = { prompt: string; max_seconds: number };

export type InterviewAnswer = {
  id: string;
  organization_id: string;
  interview_id: string;
  question_index: number;
  video_path: string;
  duration_seconds: number | null;
  created_at: string;
};

export type InterviewPanelist = {
  id: string;
  organization_id: string;
  interview_id: string;
  membership_id: string;
  created_at: string;
};

export type InterviewScorecard = Timestamps & {
  id: string;
  organization_id: string;
  interview_id: string;
  membership_id: string;
  recommendation: ScorecardRecommendation | null;
  rating: number | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  submitted: boolean;
  submitted_at: string | null;
};

// -- Plans & subscriptions (CP-26) --------------------------------------------
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type Plan = {
  key: string;
  name: string;
  seat_cap: number | null;
  opening_cap: number | null;
  feat_integrations: boolean;
  feat_ai_posts: boolean;
  feat_ai_screening: boolean;
  feat_ai_assessments: boolean;
  allow_addon_seats: boolean;
  monthly_cents: number;
  per_seat_cents: number;
  is_public: boolean;
  sort_order: number;
  stripe_price_id: string | null;
  stripe_seat_price_id: string | null;
  created_at: string;
};

export type OrgSubscription = Timestamps & {
  organization_id: string;
  plan_key: string;
  status: SubscriptionStatus;
  base_seats: number;
  addon_seats: number;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization, "name" | "slug">;
      profiles: Table<Profile, "id" | "email">;
      departments: Table<
        Department,
        "organization_id" | "name",
        [Rel<"organization_id", "organizations">, Rel<"head_membership_id", "memberships">]
      >;
      memberships: Table<
        Membership,
        "organization_id" | "user_id",
        [
          Rel<"organization_id", "organizations">,
          Rel<"user_id", "profiles">,
          Rel<"role_id", "roles">,
          Rel<"department_id", "departments">,
        ]
      >;
      roles: Table<
        Role,
        "organization_id" | "key" | "name",
        [Rel<"organization_id", "organizations">]
      >;
      permissions: Table<Permission, "key" | "module" | "label">;
      role_permissions: Table<
        RolePermission,
        "role_id" | "permission_key",
        [Rel<"role_id", "roles">, Rel<"permission_key", "permissions">]
      >;
      user_permission_overrides: Table<
        UserPermissionOverride,
        "organization_id" | "membership_id" | "permission_key" | "allowed",
        [
          Rel<"organization_id", "organizations">,
          Rel<"membership_id", "memberships">,
          Rel<"permission_key", "permissions">,
        ]
      >;
      invitations: Table<
        Invitation,
        "organization_id" | "email" | "token_hash" | "expires_at",
        [
          Rel<"organization_id", "organizations">,
          Rel<"role_id", "roles">,
          Rel<"department_id", "departments">,
        ]
      >;
      approval_rules: Table<
        ApprovalRule,
        "organization_id" | "action_key",
        [Rel<"organization_id", "organizations">]
      >;
      // Update is typed permissively here, but the database rejects it outright:
      // audit_log is append-only (see migration 0004).
      audit_log: Table<
        AuditLogEntry,
        "organization_id" | "action" | "entity_type",
        [Rel<"organization_id", "organizations">, Rel<"actor_membership_id", "memberships">]
      >;
      permission_presets: Table<PermissionPreset, "key" | "name">;
      permission_preset_grants: Table<
        PermissionPresetGrant,
        "preset_key" | "role_key" | "permission_key"
      >;
      job_openings: Table<
        JobOpening,
        "organization_id" | "title",
        [
          Rel<"organization_id", "organizations">,
          Rel<"department_id", "departments">,
          Rel<"created_by", "memberships">,
        ]
      >;
      job_requirements: Table<
        JobRequirement,
        "job_opening_id" | "kind" | "label",
        [Rel<"job_opening_id", "job_openings">]
      >;
      screening_questions: Table<
        ScreeningQuestion,
        "job_opening_id" | "question",
        [Rel<"job_opening_id", "job_openings">]
      >;
      candidates: Table<
        Candidate,
        "organization_id" | "full_name" | "email",
        [Rel<"organization_id", "organizations">, Rel<"created_by", "memberships">]
      >;
      applications: Table<
        Application,
        "organization_id" | "candidate_id" | "job_opening_id",
        [
          Rel<"organization_id", "organizations">,
          Rel<"candidate_id", "candidates">,
          Rel<"job_opening_id", "job_openings">,
        ]
      >;
      documents: Table<
        DocumentRow,
        "organization_id" | "storage_path" | "file_name",
        [
          Rel<"organization_id", "organizations">,
          Rel<"candidate_id", "candidates">,
          Rel<"application_id", "applications">,
        ]
      >;
      candidate_notes: Table<
        CandidateNote,
        "organization_id" | "candidate_id" | "body",
        [
          Rel<"organization_id", "organizations">,
          Rel<"candidate_id", "candidates">,
          Rel<"author_membership_id", "memberships">,
        ]
      >;
      notifications: Table<
        Notification,
        "organization_id" | "recipient_membership_id" | "type",
        [Rel<"organization_id", "organizations">, Rel<"recipient_membership_id", "memberships">]
      >;
      candidate_scorecards: Table<
        CandidateScorecard,
        "organization_id" | "candidate_id" | "author_membership_id",
        [
          Rel<"organization_id", "organizations">,
          Rel<"candidate_id", "candidates">,
          Rel<"author_membership_id", "memberships">,
        ]
      >;
      conflict_declarations: Table<
        ConflictDeclaration,
        "organization_id" | "candidate_id" | "membership_id",
        [Rel<"organization_id", "organizations">, Rel<"candidate_id", "candidates">]
      >;
      candidate_portal_invites: Table<
        CandidatePortalInvite,
        "organization_id" | "candidate_id" | "token_hash" | "expires_at",
        [Rel<"organization_id", "organizations">, Rel<"candidate_id", "candidates">]
      >;
      channels: Table<Channel, "key" | "name" | "category">;
      channel_connections: Table<
        ChannelConnection,
        "organization_id" | "channel_key",
        [Rel<"organization_id", "organizations">, Rel<"channel_key", "channels">]
      >;
      job_postings: Table<
        JobPosting,
        "organization_id" | "job_opening_id" | "channel_key",
        [
          Rel<"organization_id", "organizations">,
          Rel<"job_opening_id", "job_openings">,
          Rel<"channel_key", "channels">,
        ]
      >;
      application_screenings: Table<
        ApplicationScreening,
        "organization_id" | "application_id" | "job_opening_id",
        [
          Rel<"organization_id", "organizations">,
          Rel<"application_id", "applications">,
          Rel<"job_opening_id", "job_openings">,
        ]
      >;
      tests: Table<
        Test,
        "organization_id" | "title",
        [Rel<"organization_id", "organizations">, Rel<"job_opening_id", "job_openings">]
      >;
      test_questions: Table<
        TestQuestion,
        "organization_id" | "test_id" | "type" | "prompt",
        [Rel<"organization_id", "organizations">, Rel<"test_id", "tests">]
      >;
      test_versions: Table<
        TestVersion,
        "organization_id" | "test_id" | "version" | "snapshot",
        [Rel<"organization_id", "organizations">, Rel<"test_id", "tests">]
      >;
      question_bank: Table<
        QuestionBankItem,
        "organization_id" | "type" | "prompt",
        [Rel<"organization_id", "organizations">]
      >;
      test_assignments: Table<
        TestAssignment,
        "organization_id" | "test_id" | "application_id" | "candidate_id",
        [
          Rel<"organization_id", "organizations">,
          Rel<"test_id", "tests">,
          Rel<"application_id", "applications">,
          Rel<"candidate_id", "candidates">,
        ]
      >;
      test_attempts: Table<
        TestAttempt,
        "organization_id" | "assignment_id" | "test_id" | "version" | "expires_at",
        [
          Rel<"organization_id", "organizations">,
          Rel<"assignment_id", "test_assignments">,
          Rel<"test_id", "tests">,
        ]
      >;
      test_answers: Table<
        TestAnswer,
        "organization_id" | "attempt_id" | "question_id",
        [Rel<"organization_id", "organizations">, Rel<"attempt_id", "test_attempts">]
      >;
      proctoring_events: Table<
        ProctoringEvent,
        "organization_id" | "attempt_id" | "type",
        [Rel<"organization_id", "organizations">, Rel<"attempt_id", "test_attempts">]
      >;
      proctoring_analyses: Table<
        ProctoringAnalysis,
        "organization_id" | "attempt_id" | "integrity_level" | "summary" | "model",
        [Rel<"organization_id", "organizations">, Rel<"attempt_id", "test_attempts">]
      >;
      assessment_policies: Table<
        AssessmentPolicy,
        "organization_id",
        [Rel<"organization_id", "organizations">]
      >;
      interviews: Table<
        Interview,
        "organization_id" | "application_id" | "candidate_id" | "scheduled_at",
        [
          Rel<"organization_id", "organizations">,
          Rel<"application_id", "applications">,
          Rel<"candidate_id", "candidates">,
          Rel<"job_opening_id", "job_openings">,
        ]
      >;
      interview_panelists: Table<
        InterviewPanelist,
        "organization_id" | "interview_id" | "membership_id",
        [Rel<"organization_id", "organizations">, Rel<"interview_id", "interviews">]
      >;
      interview_scorecards: Table<
        InterviewScorecard,
        "organization_id" | "interview_id" | "membership_id",
        [Rel<"organization_id", "organizations">, Rel<"interview_id", "interviews">]
      >;
      interview_answers: Table<
        InterviewAnswer,
        "organization_id" | "interview_id" | "question_index" | "video_path",
        [Rel<"organization_id", "organizations">, Rel<"interview_id", "interviews">]
      >;
      contact_messages: Table<ContactMessage, "name" | "email" | "message", []>;
      plans: Table<Plan, "key" | "name", []>;
      org_subscriptions: Table<
        OrgSubscription,
        "organization_id",
        [Rel<"organization_id", "organizations">, Rel<"plan_key", "plans">]
      >;
    };
    Views: Record<string, never>;
    Functions: {
      current_org_id: { Args: Record<string, never>; Returns: string | null };
      is_org_owner: { Args: Record<string, never>; Returns: boolean };
      has_permission: { Args: { p_key: string }; Returns: boolean };
      permission_scope_of: {
        Args: { p_key: string };
        Returns: PermissionScope | null;
      };
      my_permissions: {
        Args: Record<string, never>;
        Returns: { permission_key: string; scope: PermissionScope }[];
      };
      provision_organization: {
        Args: {
          p_company_name: string;
          p_preset_key?: string;
          p_full_name?: string;
        };
        Returns: string;
      };
      transfer_ownership: {
        Args: { p_to_membership_id: string };
        Returns: void;
      };
    };
    Enums: {
      permission_scope: PermissionScope;
      membership_status: MembershipStatus;
      permission_risk: PermissionRisk;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
