# Phase 4 Production Preflight

This repository change prepares a read-only preflight; it does not apply migrations or enable LIVE execution.

## Run

```bash
npm run check:production-env
```

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to browser/client)
- `UPSTASH_REDIS_REST_URL` (HTTPS endpoint)
- `UPSTASH_REDIS_REST_TOKEN`

The checklist authenticates to the Supabase REST endpoint and performs an authenticated Upstash REST PING. It checks that the table-creating migrations declare RLS. It intentionally reports remote Production RLS as `NOT_VERIFIED`: local SQL and REST reachability cannot prove the live database's `relrowsecurity` flags or effective policies.

## Production migration gate

Do not run `supabase db push --linked` or apply SQL until all of the following are independently confirmed:
1. Correct production Supabase project ref and target database.
2. Verified, restorable pre-change backup / PITR recovery window.
3. Reviewed pending migration list and SQL diff.
4. Read-only SQL inspection of `pg_class.relrowsecurity` and `pg_policies` for every affected table.
5. A named operator has approved the change window and rollback/recovery plan.

The current preflight script does not perform a database write, create a backup, or certify Production RLS. Keep Production execution disabled until these gates pass.

## Read-only RLS verification

Run `supabase/verification/verify_rls_active.sql` against the intended Production project using a read-only database role. It reports table existence, `relrowsecurity`, `relforcerowsecurity`, and policy count for:
- `public.tenants`
- `public.tenant_outcomes`
- `public.execution_audit_logs`
- `public.workflow_dispatch_state`

A missing table is reported as `MISSING_TABLE`, not as a pass. Note: the migrations currently in this repository create `execution_logs`, `outcome_logs`, `audit_logs`, `aimpact_execution_locks`, and `aimpact_idempotency`; the four requested names are not created by those migrations. Reconcile the canonical Production schema before declaring coverage. RLS enabled + policy count greater than zero is not proof that tenant predicates are correct; inspect each `qual` / `with_check` and run cross-tenant negative-access tests with tenant JWTs.

## PITR / backup gate before any Production migration

1. Confirm the exact Supabase project reference and database target independently.
2. In the Supabase project dashboard, verify that PITR is enabled and record the latest recoverable timestamp / recovery window immediately before the change. If PITR is unavailable, create and verify a provider-supported backup export and document its restore procedure.
3. Confirm the backup is restorable by restoring it to an isolated non-production project. A backup artifact that has not been restore-tested is not a verified rollback path.
4. Record the migration set, checksum, operator, approval, start time, and recovery point in the change record.
5. Do not start if the recovery point is older than the approved change window or restore validation is incomplete.

The repository cannot independently verify a Supabase PITR snapshot from a local CLI without authenticated project-level backup/restore access. The preflight therefore must not claim that a snapshot exists.

## Down-migration / recovery validation

No generic automatic down-migration is safe for the current production dataset. Before applying each migration:
- classify every statement as reversible, conditionally reversible, or irreversible (data rewrite/drop, external side effect, or lossy conversion);
- prepare a reviewed down-migration only for genuinely reversible schema changes;
- test up → down → up against a disposable clone populated with representative data, checking row counts, constraints, indexes, triggers, grants, RLS flags and policies;
- for irreversible changes, use a tested PITR restore or a forward-fix migration; do not promise zero-downtime rollback by issuing destructive inverse SQL;
- document expected downtime/locking and use expand → backfill → validate → contract for table/column changes.

Production migration application remains blocked until backup/PITR restore proof, SQL RLS review, rollback/recovery rehearsal, and named operator approval are recorded.
