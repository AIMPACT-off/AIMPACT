# Phase 3 Step 1 — Workflow Schema & Tenant Isolation Audit
Date: 2026-10-02
Repository: AIMPACT-off/AIMPACT (main)
Status: PARTIAL — repository evidence inspected; live database audit BLOCKED.

## Executive result
The repository currently contains two SQL migration files under `supabase/migrations/`:
1. `202610020001_phase1_execution_outcomes_audit.sql`
2. `202610020002_audit_hash_chain.sql`

Neither migration defines the existing `public.workflows` table or the eight historical workflow records. The inspected frontend `app.js` reads `public.workflows` using `select("*").order("created_at")`, but does not expose the workflow row schema or the eight row definitions.

The prior Phase 0 report recorded eight workflow rows historically. That count is not independently confirmed against the live database in this audit. No row names, IDs, step definitions, webhook targets, side effects, owner/tenant scope, or execution permissions are asserted here.

## Evidence inspected
- `app.js`: client query for `public.workflows`; client-side workflow draft/rendering only. No server-side dispatcher or provider execution call in this file.
- `config.js`: Supabase project URL and publishable browser key only. A publishable key does not grant SQL catalog access or privileged table inspection.
- `supabase/migrations/`: only the two files listed above are present in the repository directory.
- `202610020001_phase1_execution_outcomes_audit.sql`: creates execution_logs, outcome_logs and audit_logs; enables RLS; revokes anon/authenticated access; grants service_role select/insert. It explicitly defers tenant-scoped client policies until canonical tenant/auth schema is inspected.
- `202610020002_audit_hash_chain.sql`: adds a global chain sequence and hash-chain trigger/function. This does not establish tenant isolation for workflows.

## Live database access limitation
The available repository connection can read GitHub files but cannot run SQL against the Supabase project. The repository does not provide a verified database connection secret, and the schema-sync workflow is gated by `SUPABASE_SCHEMA_SYNC_ENABLED == 'true'` plus `SUPABASE_DB_URL`. Therefore the following live checks were NOT RUN:
- `information_schema` / `pg_catalog` inventory for workflows and related tables/views/functions;
- exact eight-row workflow export and full JSON definitions;
- RLS enabled/forced status, policies, grants, ownership, SECURITY DEFINER/search_path;
- FK relationships and tenant ownership path;
- cross-tenant read/write negative tests;
- existing workflow webhook/API side effects and their authorization controls.

## Required read-only database audit
Run using a restricted read-only database identity (never service_role in a client):
- enumerate schemas, tables, views, materialized views, functions, triggers and grants;
- inspect `public.workflows` columns, constraints, indexes, owner and RLS policies;
- export all workflow rows with secrets redacted, preserving stable IDs and full non-secret step definitions;
- trace every referenced tool, webhook, URL, RPC, table and storage bucket;
- determine tenant binding source and prove tenant A cannot read or mutate tenant B data;
- classify each workflow as read-only, internal write, external side-effect, or unknown;
- do not execute any workflow during discovery.

## Mandatory output before dispatcher binding
For each workflow, record:
`workflow_id`, `name`, `version`, `tenant_scope`, `trigger`, `input_schema`, `step_graph`, `provider_calls`, `data_reads`, `data_writes`, `external_side_effects`, `idempotency_strategy`, `compensation`, `approval_class`, `secrets_required`, `RLS_evidence`, `test_status`.
Secrets and customer personal data must be redacted from the export.

## Gate decision
Do not build guessed adapters or bind the eight workflows to a dispatcher until the live schema and rows have been exported and reviewed. The next executable action requiring access is a read-only Supabase schema/data audit. After that, design migrations against the actual schema, then implement the dispatcher with durable state transitions, atomic idempotency/locking, strict request schemas and isolated workers.
