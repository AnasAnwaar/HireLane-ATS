# Database

Schema for the Hirelane ATS. Written as plain SQL migrations so they can be applied to any
Postgres instance — a Supabase project, or anything else — when you're ready to go live.

## Files

| Migration | Contents |
|-----------|----------|
| `0001_types_and_helpers.sql` | Extensions, enums, session helpers (`current_org_id`, `is_org_owner`) |
| `0002_organizations_and_identity.sql` | `organizations`, `profiles`, `departments`, `memberships`, `invitations` |
| `0003_permissions.sql` | `permissions` catalogue, `roles`, `role_permissions`, per-user overrides, approval rules |
| `0004_audit_log.sql` | Append-only audit log with immutability triggers |
| `0005_permission_resolution.sql` | `has_permission()`, `permission_scope_of()`, `can_access_record()`, `my_permissions()` |
| `0006_rls_policies.sql` | Row-Level Security on every tenant table |
| `0007_seed_permission_catalogue.sql` | The ~90 permission keys from spec §9.1 |
| `0008_seed_presets.sql` | `Standard` / `Strict` / `Custom` role presets |
| `0009_provisioning.sql` | `provision_organization()` (sign-up), `transfer_ownership()` |

Apply them in filename order. Every file is idempotent-friendly where it can be
(`on conflict do update` on seeds), but the DDL files expect a clean database.

## Applying them

**When you have a Supabase project:**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Or against any Postgres:**

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

Then regenerate the TypeScript types:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

## Validation

```bash
npm run validate:sql
```

Parses every migration with the real PostgreSQL grammar (a WASM build of the server's own
parser), so syntax errors are caught without a running database.

> **This checks syntax only.** Semantic correctness — that a policy predicate does what it
> claims, that RLS actually blocks cross-tenant reads — requires applying the migrations to
> a live instance and running the isolation tests in `tests/`. Treat the schema as
> *unproven* until that happens.

## Design notes

### Tenant isolation
Every tenant table carries `organization_id` and is protected by `FORCE ROW LEVEL
SECURITY`, filtered on `organization_id = current_org_id()`. Isolation is enforced by the
database, so a forgotten `where` clause in application code cannot leak across companies.

`current_org_id()` prefers an `app_metadata.organization_id` JWT claim (for users who
belong to several organisations) but always re-verifies the membership still exists and is
active — a stale token cannot grant access to an organisation the user has left.

### Permission resolution
One code path, used by both RLS and the application:

```
owner?  → everything, always (cannot be locked out)
   ↓
per-user override (if not expired)  → wins over the role
   ↓
role grant
   ↓
data scope: all / department / assigned / own   (most restrictive wins)
```

`can_access_record()` applies a resolved scope to a single row, so feature tables get scope
handling by calling one function rather than reimplementing the logic per table.

### The four guardrails
Per spec §9.3, these are enforced in the database rather than left configurable:

1. **Append-only audit log** — `UPDATE`/`DELETE` blocked by trigger *and* revoked grants.
   Belt and braces, because either alone can be bypassed by a future migration.
2. **At least one Owner** — partial unique index plus a last-owner guard trigger.
3. **Owner cannot be locked out** — `has_permission()` short-circuits for owners; RLS
   forbids editing the Owner role's grants.
4. **Tenant isolation** — as above.

Consent capture (guardrail 1 in the spec) is enforced at the application layer when
assessments land in CP-19, since it concerns a flow rather than a row.

### Things deliberately deferred
- **Feature tables** (job openings, candidates, tests, interviews) arrive with their own
  checkpoints — CP-6 onward. Only the tenancy and permission core is here.
- **Approval chain execution**: `approval_rules` stores configuration; the runtime that
  enforces it lands with the features it gates.
