# AIMPACT AI Diagnosis Data Contract v1

**Status:** Draft specification committed on an isolated feature branch. Not merged, not deployed, and not applied to any database.

## 1. Source questionnaire mapping

The contract maps directly to the 14-question B2B async audit SOP:

| Q | JSON property | Required |
|---|---|---|
| 01 Outcome | `outcome` | Yes |
| 02 Current workflow | `current_workflow` | Yes |
| 03 Frequency & volume | `frequency_volume` | Yes |
| 04 Time & cost | `time_cost` | Yes |
| 05 Bottleneck | `bottleneck` | Yes |
| 06 Systems | `systems` | Yes |
| 07 Inputs & outputs | `inputs_outputs` | Yes |
| 08 Exceptions | `exceptions` | Yes |
| 09 Data sensitivity | `data_sensitivity` | Yes |
| 10 Current AI use | `current_ai_use` | Yes |
| 11 Success measure | `success_measure` | Yes |
| 12 Stakeholders | `stakeholders` | Yes |
| 13 Timing | `timing` | Yes |
| 14 Budget range | `budget_range` | No |

Schema: `schemas/business-diagnosis-request.v1.schema.json`

## 2. Persistence model

- `diagnosis_submissions`: raw customer input only; unique idempotency key per tenant.
- `diagnosis_jobs`: queue state, attempts, lease/worker metadata, and sanitized error fields.
- `diagnosis_reports`: AI output, model/prompt versions, candidate solutions, evidence, confidence, and review state.
- `diagnosis_reviews`: human decisions, stored separately from generated report content.

All tables carry `tenant_id`. Composite foreign keys prevent a child row from referring to a parent under a different tenant. The DDL deliberately does not guess a foreign key to a tenants table or a membership/RLS helper because the repository's canonical tenant/auth schema must be verified first.

DDL: `supabase/migrations/202610040002_ai_diagnosis_data_contract.sql`

## 3. Queue and idempotency contract

1. Validate payload against the pinned schema version before persistence.
2. In one transaction, insert the submission using `(tenant_id, idempotency_key)`; on conflict, return the existing submission/job instead of enqueueing a duplicate.
3. Insert one `PENDING` job per tenant/submission.
4. Worker claims only due `PENDING` jobs (or expired processing leases) using row locking / `FOR UPDATE SKIP LOCKED`; implement this as a separate reviewed RPC/worker change.
5. Increment attempt count on claim. Retry transient failures with bounded exponential backoff; after max attempts, mark `FAILED` and route to a DLQ policy.
6. Persist output with model, prompt and schema versions. A successful job is not customer-visible until a reviewer approves the report.

## 4. Security boundaries and known gaps

- RLS is enabled and browser roles have no grants: fail-closed initial posture.
- `service_role` bypasses RLS. It must remain server-side and all worker queries must explicitly scope by tenant.
- This migration does **not** prove tenant isolation. Real tenant-scoped authenticated access requires the canonical tenant-membership model and policies; neither is invented here.
- `last_error_detail` must contain operational metadata only. Never persist credentials, full prompts containing sensitive customer data, or raw provider responses by default.
- The review table is described as append-only but database-level UPDATE/DELETE prevention is not yet included.
- The DDL creates storage only; no queue worker, retry scheduler, DLQ consumer, AI provider integration, or report delivery is implemented here.

## 5. Acceptance tests required before merge/apply

- JSON Schema: valid full payload; missing required field; unknown property; overlong string; invalid sensitivity enum; optional budget omitted.
- DB: tenant A cannot reference tenant B submission/job/report; duplicate idempotency key does not create a second job; status/check constraints reject invalid states.
- Security: anon/authenticated direct SELECT/INSERT/UPDATE/DELETE denied for all four tables; service worker can operate only through tenant-scoped code.
- Queue: concurrent workers cannot claim the same job; transient retry/backoff; max-attempt transition to FAILED; stale PROCESSING lease recovery.
- Review: report remains hidden from customer until APPROVED; reviewer decision is tenant-bound and auditable.

**No migration is authorized for production by this document.**
