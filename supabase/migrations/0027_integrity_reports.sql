-- =============================================================================
-- 0027 · Integrity Reports (spec §UC-5.3, CP-21)
-- =============================================================================
-- The human decision layer over capture (CP-19) + AI analysis (CP-20). An
-- Integrity Report gathers the event timeline, the check-in evidence and the AI
-- verdict, and records the reviewer's DECISION on the attempt.
--
-- Guardrails (spec §UC-5.3):
--   R2  the system never auto-decides — a human accepts / invalidates / rejects,
--       and the decision is recorded with who + when + why (audit_log).
--
-- The decision lives on test_attempts (1:1 with the attempt). Evidence retention
-- ("auto-deletion") is derived from submitted_at + a fixed window and enforced by
-- scripts/purge-proctoring-evidence.cjs — no column needed.
-- =============================================================================

create type integrity_decision as enum ('pending', 'accepted', 'invalidated', 'rejected');

alter table public.test_attempts
  add column if not exists integrity_decision   integrity_decision not null default 'pending',
  add column if not exists integrity_reason      text,
  add column if not exists integrity_decided_by  uuid references public.memberships(id) on delete set null,
  add column if not exists integrity_decided_at  timestamptz;

-- Reads ride the existing test_attempts select policy (assessments.view). Writes
-- go through the recordIntegrityDecisionAction service-role path after the action
-- authorises proctoring.invalidate in code — the table's own write policy gates on
-- assessments.assign, a different permission, so we don't route decisions through it.
