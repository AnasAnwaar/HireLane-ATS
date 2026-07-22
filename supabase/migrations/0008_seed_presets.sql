-- =============================================================================
-- 0008 · Seed permission presets (spec §9.2 "shipped defaults, fully editable")
-- =============================================================================
-- These are STARTING POINTS, not policy. Once a preset is applied at sign-up the
-- rows are copied into the organisation's own roles/role_permissions, and the
-- company edits those freely. Nothing here constrains them afterwards.
-- =============================================================================

insert into public.permission_presets (key, name, description, sort_order) values
  ('standard', 'Standard', 'Sensible defaults so a new company is productive on day one.', 10),
  ('strict',   'Strict',   'Least privilege. Almost everything starts off; grant deliberately.', 20),
  ('custom',   'Custom',   'Owner role only. Build every other role from scratch.', 30)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Roles per preset
-- -----------------------------------------------------------------------------
insert into public.permission_preset_roles (preset_key, role_key, role_name, description, is_owner_role, sort_order) values
  ('standard', 'owner',       'Company Admin (Owner)', 'Full control. Cannot be locked out of permission management.', true,  10),
  ('standard', 'hr_manager',  'HR Manager',            'Runs recruitment day to day.',                                false, 20),
  ('standard', 'recruiter',   'Recruiter',             'Sources and screens for assigned openings.',                  false, 30),
  ('standard', 'team_lead',   'Team Lead',             'Technical evaluator on assigned openings.',                   false, 40),
  ('standard', 'management',  'Management',            'Oversight and reporting across the company.',                 false, 50),
  ('standard', 'auditor',     'Read-Only Auditor',     'Read-only access for compliance review.',                     false, 60),

  ('strict',   'owner',       'Company Admin (Owner)', 'Full control. Cannot be locked out of permission management.', true,  10),
  ('strict',   'hr_manager',  'HR Manager',            'Minimal starting grants; extend deliberately.',               false, 20),
  ('strict',   'recruiter',   'Recruiter',             'Minimal starting grants; extend deliberately.',               false, 30),

  ('custom',   'owner',       'Company Admin (Owner)', 'Full control. Cannot be locked out of permission management.', true,  10)
on conflict (preset_key, role_key) do update set
  role_name = excluded.role_name, description = excluded.description, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Grants — Standard preset (mirrors the spec §9.2 defaults table)
--
-- The Owner role gets no rows: has_permission() short-circuits for owners, so
-- listing grants would be redundant and could drift from the catalogue.
-- -----------------------------------------------------------------------------

-- HR Manager: everything except billing, security and ownership transfer.
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope)
select 'standard', 'hr_manager', key, true,
       case when supports_scope then 'all'::permission_scope else 'all'::permission_scope end
from public.permissions
where key not in (
  'administration.manage_billing',
  'administration.configure_security',
  'administration.transfer_ownership'
)
on conflict do nothing;

-- Recruiter: sourcing and screening on ASSIGNED openings; no admin, no salary,
-- no proctoring evidence, no hire/close authority.
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope)
select 'standard', 'recruiter', key, true,
       case when supports_scope then 'assigned'::permission_scope else 'all'::permission_scope end
from public.permissions
where module in ('Job openings', 'Post generation', 'Applicants', 'Screening', 'Assessments', 'Profile & collaboration')
  and key not in (
    'job_openings.delete', 'job_openings.approve', 'job_openings.publish',
    'job_openings.manage_approvals', 'applicants.export',
    'profile.view_management_notes'
  )
on conflict do nothing;

insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope) values
  ('standard', 'recruiter', 'interviews.view_schedule',    true, 'assigned'),
  ('standard', 'recruiter', 'interviews.schedule',         true, 'assigned'),
  ('standard', 'recruiter', 'interviews.join',             true, 'assigned'),
  ('standard', 'recruiter', 'interviews.submit_scorecard', true, 'assigned'),
  ('standard', 'recruiter', 'proctoring.view_summary',     true, 'assigned'),
  ('standard', 'recruiter', 'proctoring.view_evidence',    true, 'assigned'),
  ('standard', 'recruiter', 'pipeline.advance',            true, 'assigned'),
  ('standard', 'recruiter', 'pipeline.move_backward',      true, 'assigned'),
  ('standard', 'recruiter', 'pipeline.hold',               true, 'assigned'),
  ('standard', 'recruiter', 'pipeline.reject',             true, 'assigned'),
  ('standard', 'recruiter', 'pipeline.add_to_talent_pool', true, 'assigned'),
  ('standard', 'recruiter', 'reporting.view_own',          true, 'all'),
  ('standard', 'recruiter', 'integrations.view',           true, 'all'),
  ('standard', 'recruiter', 'fields.view_candidate_contact', true, 'assigned')
on conflict do nothing;

-- Team Lead: evaluates. Reads candidates, authors tests, interviews. No admin,
-- no pipeline decisions, no salary, evidence summary only.
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope) values
  ('standard', 'team_lead', 'job_openings.view',            true, 'assigned'),
  ('standard', 'team_lead', 'applicants.view_list',         true, 'assigned'),
  ('standard', 'team_lead', 'applicants.view_profile',      true, 'assigned'),
  ('standard', 'team_lead', 'screening.view_score',         true, 'assigned'),
  ('standard', 'team_lead', 'screening.view_report',        true, 'assigned'),
  ('standard', 'team_lead', 'assessments.view',             true, 'assigned'),
  ('standard', 'team_lead', 'assessments.create_manual',    true, 'assigned'),
  ('standard', 'team_lead', 'assessments.generate_ai',      true, 'assigned'),
  ('standard', 'team_lead', 'assessments.edit',             true, 'assigned'),
  ('standard', 'team_lead', 'assessments.view_answers',     true, 'assigned'),
  ('standard', 'team_lead', 'assessments.confirm_grades',   true, 'assigned'),
  ('standard', 'team_lead', 'proctoring.view_summary',      true, 'assigned'),
  ('standard', 'team_lead', 'interviews.view_schedule',     true, 'assigned'),
  ('standard', 'team_lead', 'interviews.join',              true, 'assigned'),
  ('standard', 'team_lead', 'interviews.submit_scorecard',  true, 'assigned'),
  ('standard', 'team_lead', 'profile.add_note',             true, 'assigned'),
  ('standard', 'team_lead', 'profile.edit_own_note',        true, 'assigned'),
  ('standard', 'team_lead', 'profile.view_team_notes',      true, 'assigned'),
  ('standard', 'team_lead', 'profile.mention_users',        true, 'assigned'),
  ('standard', 'team_lead', 'profile.view_documents',       true, 'assigned'),
  ('standard', 'team_lead', 'reporting.view_own',           true, 'all')
on conflict do nothing;

-- Management: company-wide visibility, interviews, notes, salary. No admin, no
-- day-to-day pipeline operation.
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope) values
  ('standard', 'management', 'job_openings.view',             true, 'all'),
  ('standard', 'management', 'applicants.view_list',          true, 'all'),
  ('standard', 'management', 'applicants.view_profile',       true, 'all'),
  ('standard', 'management', 'screening.view_score',          true, 'all'),
  ('standard', 'management', 'screening.view_report',         true, 'all'),
  ('standard', 'management', 'assessments.view',              true, 'all'),
  ('standard', 'management', 'proctoring.view_summary',       true, 'all'),
  ('standard', 'management', 'interviews.view_schedule',      true, 'all'),
  ('standard', 'management', 'interviews.join',               true, 'all'),
  ('standard', 'management', 'interviews.submit_scorecard',   true, 'all'),
  ('standard', 'management', 'profile.add_note',              true, 'all'),
  ('standard', 'management', 'profile.edit_own_note',         true, 'all'),
  ('standard', 'management', 'profile.view_team_notes',       true, 'all'),
  ('standard', 'management', 'profile.view_management_notes', true, 'all'),
  ('standard', 'management', 'profile.mention_users',         true, 'all'),
  ('standard', 'management', 'profile.view_documents',        true, 'all'),
  ('standard', 'management', 'reporting.view_own',            true, 'all'),
  ('standard', 'management', 'reporting.view_department',     true, 'all'),
  ('standard', 'management', 'reporting.view_company',        true, 'all'),
  ('standard', 'management', 'reporting.export',              true, 'all'),
  ('standard', 'management', 'fields.view_salary',            true, 'all')
on conflict do nothing;

-- Read-Only Auditor: sees everything relevant to compliance, changes nothing.
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope) values
  ('standard', 'auditor', 'job_openings.view',        true, 'all'),
  ('standard', 'auditor', 'applicants.view_list',     true, 'all'),
  ('standard', 'auditor', 'applicants.view_profile',  true, 'all'),
  ('standard', 'auditor', 'assessments.view',         true, 'all'),
  ('standard', 'auditor', 'proctoring.view_summary',  true, 'all'),
  ('standard', 'auditor', 'interviews.view_schedule', true, 'all'),
  ('standard', 'auditor', 'reporting.view_company',   true, 'all'),
  ('standard', 'auditor', 'reporting.export',         true, 'all'),
  ('standard', 'auditor', 'administration.view_audit_log', true, 'all')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Grants — Strict preset. Deliberately sparse: view-only starting points that
-- an admin extends by hand.
-- -----------------------------------------------------------------------------
insert into public.permission_preset_grants (preset_key, role_key, permission_key, allowed, scope) values
  ('strict', 'hr_manager', 'job_openings.view',        true, 'all'),
  ('strict', 'hr_manager', 'job_openings.create',      true, 'all'),
  ('strict', 'hr_manager', 'job_openings.edit',        true, 'all'),
  ('strict', 'hr_manager', 'applicants.view_list',     true, 'all'),
  ('strict', 'hr_manager', 'applicants.view_profile',  true, 'all'),
  ('strict', 'hr_manager', 'administration.manage_users', true, 'all'),

  ('strict', 'recruiter',  'job_openings.view',        true, 'assigned'),
  ('strict', 'recruiter',  'applicants.view_list',     true, 'assigned'),
  ('strict', 'recruiter',  'applicants.view_profile',  true, 'assigned')
on conflict do nothing;
