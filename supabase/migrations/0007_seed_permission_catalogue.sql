-- =============================================================================
-- 0007 · Seed the permission catalogue (spec §9.1)
-- =============================================================================
-- Every capability the software has, as an individually togglable key.
-- `supports_scope` marks the "⊞" entries in the spec that can be narrowed to
-- All / Department / Assigned / Own.
--
-- Adding a feature later means adding rows here — never hard-coding a check.
-- =============================================================================

insert into public.permissions (key, module, label, description, supports_scope, is_field_level, risk, sort_order) values

-- Administration ---------------------------------------------------------------
('administration.manage_company_profile', 'Administration', 'Manage company profile',    'Edit company name, logo, locations and locale settings.',            false, false, 'medium', 10),
('administration.manage_users',           'Administration', 'Manage users',              'Invite, deactivate and edit members of the organisation.',           false, false, 'high',   20),
('administration.manage_roles',           'Administration', 'Manage roles & permissions','Create roles and change what every role in the company can do.',      false, false, 'high',   30),
('administration.manage_departments',     'Administration', 'Manage departments',        'Create and edit departments and their heads.',                       false, false, 'low',    40),
('administration.configure_workflow',     'Administration', 'Configure workflow',        'Pipeline stages, approval chains, mandatory fields and SLA timers.',  false, false, 'medium', 50),
('administration.configure_ai_policy',    'Administration', 'Configure AI policy',       'Enable or disable AI features and set scoring weights.',             false, false, 'medium', 60),
('administration.configure_security',     'Administration', 'Configure security & SSO',  'Password policy, MFA enforcement, session timeout, IP allow-list.',  false, false, 'high',   70),
('administration.manage_billing',         'Administration', 'Manage billing',            'Plan, seats, invoices and payment method.',                          false, false, 'high',   80),
('administration.view_audit_log',         'Administration', 'View audit log',            'Read the full immutable activity log.',                              false, true,  'medium', 90),
('administration.transfer_ownership',     'Administration', 'Transfer ownership',        'Hand the Owner role to another member.',                             false, false, 'high',  100),

-- Integrations -----------------------------------------------------------------
('integrations.view',          'Integrations', 'View channels',        'See connected job boards and their status.',            false, false, 'low',    110),
('integrations.connect',       'Integrations', 'Connect channel',      'Authorise a new job board or social platform.',         false, false, 'high',   120),
('integrations.disconnect',    'Integrations', 'Disconnect channel',   'Remove an existing channel connection.',                false, false, 'high',   130),
('integrations.reauthorise',   'Integrations', 'Re-authorise channel', 'Refresh an expired channel connection.',                false, false, 'medium', 140),

-- Job openings -----------------------------------------------------------------
('job_openings.view',            'Job openings', 'View openings',          'See job openings.',                                  true,  false, 'low',    150),
('job_openings.create',          'Job openings', 'Create opening',         'Create a new job requisition.',                      false, false, 'low',    160),
('job_openings.edit',            'Job openings', 'Edit opening',           'Change an existing requisition.',                    true,  false, 'medium', 170),
('job_openings.delete',          'Job openings', 'Delete opening',         'Permanently remove a requisition.',                  true,  false, 'high',   180),
('job_openings.approve',         'Job openings', 'Approve opening',        'Sign off a requisition awaiting approval.',          true,  false, 'high',   190),
('job_openings.publish',         'Job openings', 'Publish to channels',    'Push the opening live to connected job boards.',     true,  false, 'high',   200),
('job_openings.schedule',        'Job openings', 'Schedule posting',       'Queue a posting for a future date.',                 true,  false, 'medium', 210),
('job_openings.close',           'Job openings', 'Close / reopen opening', 'Close a position or reopen a closed one.',           true,  false, 'medium', 220),
('job_openings.edit_live_post',  'Job openings', 'Edit a live post',       'Amend a posting that is already published.',         true,  false, 'medium', 230),
('job_openings.manage_approvals','Job openings', 'Manage approval chain',  'Configure who must approve an opening.',             false, false, 'high',   240),

-- Post generation --------------------------------------------------------------
('post_generation.generate',        'Post generation', 'Generate AI post variants', 'Produce platform-specific drafts with AI.',        false, false, 'low',    250),
('post_generation.edit',            'Post generation', 'Edit variants',             'Change generated post copy before publishing.',    false, false, 'low',    260),
('post_generation.regenerate',      'Post generation', 'Regenerate',                'Re-run generation with new instructions.',         false, false, 'low',    270),
('post_generation.override_seo',    'Post generation', 'Override SEO recommendations','Publish despite SEO warnings.',                  false, false, 'medium', 280),

-- Applicants -------------------------------------------------------------------
('applicants.view_list',       'Applicants', 'View applicant list',     'See applicants for an opening.',                        true,  false, 'low',    290),
('applicants.view_profile',    'Applicants', 'View full profile',       'Open a candidate profile in full.',                     true,  false, 'medium', 300),
('applicants.import',          'Applicants', 'Import / add manually',   'Add a candidate by CV upload or manual entry.',         true,  false, 'low',    310),
('applicants.connect',         'Applicants', 'Connect with applicant',  'Create the applicant profile and begin engagement.',    true,  false, 'medium', 320),
('applicants.send_invitation', 'Applicants', 'Send invitation link',    'Issue a candidate-portal invitation.',                  true,  false, 'medium', 330),
('applicants.merge',           'Applicants', 'Merge duplicates',        'Combine duplicate candidate records.',                  true,  false, 'medium', 340),
('applicants.transfer',        'Applicants', 'Transfer to another opening','Move a candidate to a different requisition.',       true,  false, 'medium', 350),
('applicants.export',          'Applicants', 'Export applicant data',   'Download candidate data. High privacy impact.',         true,  true,  'high',   360),

-- Screening --------------------------------------------------------------------
('screening.view_score',       'Screening', 'View relevance score',     'See the AI match score for a candidate.',               true,  false, 'low',    370),
('screening.view_report',      'Screening', 'View match report',        'See the full scoring breakdown and evidence.',          true,  false, 'low',    380),
('screening.adjust_weights',   'Screening', 'Adjust scoring weights',   'Change how criteria are weighted for an opening.',      true,  false, 'medium', 390),
('screening.rerank',           'Screening', 'Trigger re-rank',          'Re-score all applicants for an opening.',               true,  false, 'low',    400),
('screening.override',         'Screening', 'Override AI recommendation','Record a human decision against the AI verdict.',      true,  false, 'medium', 410),

-- Assessments ------------------------------------------------------------------
('assessments.view',            'Assessments', 'View tests',                 'See tests and their configuration.',               true,  false, 'low',    420),
('assessments.create_manual',   'Assessments', 'Create test manually',       'Author a test by hand.',                           true,  false, 'low',    430),
('assessments.generate_ai',     'Assessments', 'Generate test with AI',      'Produce a draft test from the job requirements.',   true,  false, 'low',    440),
('assessments.edit',            'Assessments', 'Edit / publish test',        'Change and publish a test.',                       true,  false, 'medium', 450),
('assessments.manage_bank',     'Assessments', 'Manage question bank',       'Add and edit reusable questions.',                 false, false, 'medium', 460),
('assessments.assign',          'Assessments', 'Assign test',                'Send a test to candidates.',                       true,  false, 'medium', 470),
('assessments.extend_deadline', 'Assessments', 'Extend deadline',            'Give a candidate more time to complete.',          true,  false, 'low',    480),
('assessments.grant_retake',    'Assessments', 'Grant retake',               'Allow an additional attempt.',                     true,  false, 'medium', 490),
('assessments.view_answers',    'Assessments', 'View answers',               'Read a candidate submitted answers.',              true,  false, 'medium', 500),
('assessments.confirm_grades',  'Assessments', 'Confirm AI-suggested grades','Accept or amend AI grading of written answers.',   true,  false, 'medium', 510),

-- Proctoring -------------------------------------------------------------------
('proctoring.set_level',        'Proctoring', 'Set proctoring level',      'Choose Off / Basic / Standard / Strict per test.',     true,  false, 'high',   520),
('proctoring.view_summary',     'Proctoring', 'View integrity summary',    'See the headline integrity result and flag counts.',   true,  false, 'medium', 530),
('proctoring.view_evidence',    'Proctoring', 'View integrity evidence',   'Open captured screenshots, clips and audio.',          true,  true,  'high',   540),
('proctoring.invalidate',       'Proctoring', 'Invalidate a test attempt', 'Void a result on integrity grounds.',                  true,  false, 'high',   550),
('proctoring.disable',          'Proctoring', 'Disable proctoring',        'Run an assessment with no monitoring at all.',         true,  false, 'high',   560),

-- Interviews -------------------------------------------------------------------
('interviews.view_schedule',    'Interviews', 'View schedule',           'See upcoming and past interviews.',                     true,  false, 'low',    570),
('interviews.schedule',         'Interviews', 'Schedule / reschedule',   'Book or move an interview.',                            true,  false, 'medium', 580),
('interviews.join',             'Interviews', 'Join as panel member',    'Take part in the video call.',                          true,  false, 'low',    590),
('interviews.enable_recording', 'Interviews', 'Enable recording',        'Turn on consented recording for a session.',            true,  false, 'high',   600),
('interviews.view_recording',   'Interviews', 'View recording',          'Play back a recorded interview.',                       true,  true,  'high',   610),
('interviews.view_transcript',  'Interviews', 'View transcript',         'Read the interview transcript.',                        true,  true,  'medium', 620),
('interviews.submit_scorecard', 'Interviews', 'Submit scorecard',        'Record a competency rating and verdict.',               true,  false, 'low',    630),
('interviews.view_others_scorecards','Interviews','View others'' scorecards','See panel scorecards before submitting your own.',  true,  true,  'medium', 640),

-- Profile & collaboration ------------------------------------------------------
('profile.add_note',            'Profile & collaboration', 'Add note',              'Write a note on a candidate profile.',        true,  false, 'low',    650),
('profile.edit_own_note',       'Profile & collaboration', 'Edit own note',         'Amend a note you authored.',                  true,  false, 'low',    660),
('profile.view_team_notes',     'Profile & collaboration', 'View team notes',       'Read notes shared with the hiring team.',     true,  true,  'medium', 670),
('profile.view_management_notes','Profile & collaboration','View management notes', 'Read notes restricted to management.',        true,  true,  'high',   680),
('profile.mention_users',       'Profile & collaboration', 'Mention users',         'Notify a colleague with an @mention.',        true,  false, 'low',    690),
('profile.upload_documents',    'Profile & collaboration', 'Upload documents',      'Attach files to a candidate profile.',        true,  false, 'low',    700),
('profile.view_documents',      'Profile & collaboration', 'View documents',        'Open CVs, portfolios and certificates.',      true,  true,  'medium', 710),

-- Pipeline decisions -----------------------------------------------------------
('pipeline.advance',            'Pipeline decisions', 'Advance stage',      'Move a candidate forward in the pipeline.',           true,  false, 'medium', 720),
('pipeline.move_backward',      'Pipeline decisions', 'Move backward',      'Return a candidate to an earlier stage.',             true,  false, 'medium', 730),
('pipeline.hold',               'Pipeline decisions', 'Put on hold',        'Pause a candidate in place.',                         true,  false, 'low',    740),
('pipeline.reject',             'Pipeline decisions', 'Reject candidate',   'Reject a candidate with a recorded reason.',          true,  false, 'high',   750),
('pipeline.approve_rejection',  'Pipeline decisions', 'Approve rejection',  'Sign off a rejection that requires approval.',        true,  false, 'high',   760),
('pipeline.mark_hired',         'Pipeline decisions', 'Mark hired',         'Record the hire and close the position.',             true,  false, 'high',   770),
('pipeline.add_to_talent_pool', 'Pipeline decisions', 'Add to talent pool', 'Keep a rejected candidate for future openings.',      true,  false, 'low',    780),

-- Reporting --------------------------------------------------------------------
('reporting.view_own',        'Reporting', 'View own reports',         'Reports covering your own requisitions.',                 false, false, 'low',    790),
('reporting.view_department', 'Reporting', 'View department reports',  'Reports across your department.',                         false, false, 'medium', 800),
('reporting.view_company',    'Reporting', 'View company-wide reports','Reports across the whole organisation.',                  false, false, 'medium', 810),
('reporting.view_diversity',  'Reporting', 'View diversity reports',   'Aggregate-only diversity reporting.',                     false, true,  'high',   820),
('reporting.export',          'Reporting', 'Export reports',           'Download reports as CSV or PDF.',                         false, false, 'medium', 830),

-- Sensitive fields (field-level visibility, spec §UC-0 step 5) ------------------
('fields.view_salary',              'Sensitive fields', 'View salary band',           'See salary ranges on openings and candidates.', true, true, 'high',   840),
('fields.view_candidate_contact',   'Sensitive fields', 'View candidate contact',     'See email, phone and address.',                  true, true, 'high',   850),
('fields.view_candidate_documents', 'Sensitive fields', 'View candidate ID documents','See uploaded identity documents.',               true, true, 'high',   860),
('fields.view_private_notes',       'Sensitive fields', 'View private notes',         'Read notes marked private to their author.',     true, true, 'high',   870)

on conflict (key) do update set
  module         = excluded.module,
  label          = excluded.label,
  description    = excluded.description,
  supports_scope = excluded.supports_scope,
  is_field_level = excluded.is_field_level,
  risk           = excluded.risk,
  sort_order     = excluded.sort_order;
