# AIMPACT MASTER REMEDIATION REGISTER

Date: 2026-10-01

## CF-01 — Airtable/Supabase lineage mismatch
- Root Cause: VERIFIED structural mismatch; 94 Airtable records and 101 Supabase records are not one dataset.
- Evidence: 27 exact-name matches; 67 Airtable-only; 74 Supabase-only/orphaned.
- Fix: canonical_tool_id foundation and expanded reconciliation.
- Test: counts re-queried after migration.
- Status: UNRESOLVED

## CF-02 — Supabase Tool provenance
- Root Cause: UNVERIFIED. All 101 rows share updated_at 2026-09-30 08:53:12.370613+00 and all have null airtable_id; repository search found no seed/import code.
- Fix: lineage fields added; unresolved provenance retained.
- Status: UNVERIFIED

## CF-03 — Canonical Tool ID
- Fix: deterministic canonical_tool_id implemented in Supabase and Airtable.
- Test: 101/101 Supabase rows populated; 94/94 Airtable rows populated.
- Status: VERIFIED

## CF-04 — Verification evidence
- Fix: evidence schema expanded.
- Test: schema present; evidence remains 0 as no evidence was fabricated.
- Status: VERIFIED (structure), UNVERIFIED (tool data)

## CF-05 — Verification automation
- Root Cause: VERIFIED failure node is Airtable aiGenerateStructuredOutput; recent failures include monthlyConsumptionLimited, webRequestFailureForToolCall, structuredOutputMissingRequiredData.
- Fix: NOT yet fully replaced because quota-limited execution path requires an alternate external execution credential/path.
- Status: FAILED / BLOCKED

## CF-06 — Production availability
- Root Cause: VERIFIED — NETLIFY_TEAM_OPERATIONAL_CREDITS_EXHAUSTED.
- Evidence: Netlify states “Production deploys are paused because your team has used all of its available credits for this billing cycle.” Recent deploy shows “Production: main@d95af86 skipped” and “Skipped due to account credit usage exceeded.”
- Deployment state: GitHub HEAD d95af865a8913de320845c9fb1e778e9f20269c6; Published Production cf6b8c4; latest HEAD deployment SKIPPED.
- Operational path: GitHub HEAD → Netlify Production Deploy → Credit Limit → Deploy SKIPPED → Previous Published Deploy remains.
- Important: no inference is made about the internal health of the currently published deploy.
- Status: BLOCKED BY ACCOUNT CREDIT LIMIT

## CF-07 — CEO KPI hardcoding
- Fix: company_kpi view now exposes DB-derived Customers, Leads, Revenue, Pipeline, Outcomes, Incidents, Security, Production and tool metrics; frontend reads those fields.
- Status: VERIFIED

## CF-08 — Security
- Fix: internal remediation tables protected by RLS; canonical function search_path hardened.
- Test: Supabase Security Advisor returned lints=[] after changes.
- Status: VERIFIED

## CF-09 — Customer/Revenue lineage
- Fix: customers, revenue_transactions and customer_outcomes structures created.
- Current actual records: 0.
- Status: VERIFIED (structure)

## CF-10 — Production smoke evidence
- Fix: production_checks table and current failed run recorded.
- Status: VERIFIED (recording structure), FAILED (production test)

## CF-11 — Incident connection
- Incident: INC-20261001-PROD-001.
- Root Cause: NETLIFY_TEAM_OPERATIONAL_CREDITS_EXHAUSTED.
- Root cause status: VERIFIED.
- Status: VERIFIED (incident and root-cause recording)

## CF-12 — Airtable verification field structure
- Fix: canonical ID and required verification-data fields added.
- Status: VERIFIED (structure)

## CF-13 — Sync logging
- Fix: tool_sync_log created for idempotent sync/result/error/rollback tracking.
- Status: VERIFIED (structure); current sync count 0.

## CF-14 — Change management
- Fix: change_log created.
- Status: VERIFIED (structure)
