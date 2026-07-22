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

/** Insert helper: server-defaulted columns are optional. */
type Insertable<T, TRequired extends keyof T> = Pick<T, TRequired> &
  Partial<Omit<T, TRequired>>;

/**
 * Table shape expected by `@supabase/supabase-js`.
 *
 * `Relationships` is required by its generics even when empty — omit it and
 * every table silently resolves to `never`, which surfaces as baffling
 * "not assignable to parameter of type 'never'" errors at each call site.
 */
type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization, "name" | "slug">;
      profiles: Table<Profile, "id" | "email">;
      departments: Table<Department, "organization_id" | "name">;
      memberships: Table<Membership, "organization_id" | "user_id">;
      roles: Table<Role, "organization_id" | "key" | "name">;
      permissions: Table<Permission, "key" | "module" | "label">;
      role_permissions: Table<RolePermission, "role_id" | "permission_key">;
      user_permission_overrides: Table<
        UserPermissionOverride,
        "organization_id" | "membership_id" | "permission_key" | "allowed"
      >;
      invitations: Table<
        Invitation,
        "organization_id" | "email" | "token_hash" | "expires_at"
      >;
      approval_rules: Table<ApprovalRule, "organization_id" | "action_key">;
      // Update is typed permissively here, but the database rejects it outright:
      // audit_log is append-only (see migration 0004).
      audit_log: Table<AuditLogEntry, "organization_id" | "action" | "entity_type">;
      permission_presets: Table<PermissionPreset, "key" | "name">;
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
