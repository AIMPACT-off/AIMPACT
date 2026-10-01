# AIMPACT CHANGE LOG

## CH-20261001-01
Component: Supabase Tool lineage
Before: public_tools had 101 rows, no canonical_tool_id, all airtable_id null.
Change: added canonical_tool_id and lineage fields; populated deterministic IDs.
Test: 101/101 canonical IDs present.
Result: PASS.
Rollback: migration reversal not executed.
Evidence: Supabase schema/count queries.

## CH-20261001-02
Component: Airtable AI TOOLS
Before: no canonical Tool ID.
Change: added CANONICAL TOOL ID and verification evidence fields; populated 94 canonical IDs.
Test: 94/94 populated.
Result: PASS.
Rollback: Airtable field removal not executed.
Evidence: Airtable field/count checks.

## CH-20261001-03
Component: Reconciliation
Before: 101 reconciliation records.
Change: expanded to 168 records and classified mismatches.
Test: 27 MISSING_AIRTABLE_ID; 67 MISSING_SUPABASE; 74 ORPHANED.
Result: PASS.
Rollback: no deletion.
Evidence: reconciliation query.

## CH-20261001-04
Component: Security
Before: two new internal tables without policies and mutable function search_path.
Change: RLS deny policies and function search_path hardening.
Test: Security Advisor lints=[].
Result: PASS.

## CH-20261001-05
Component: CEO Control Tower
Before: frontend contained hardcoded customer/revenue/pipeline/outcome/security/production values.
Change: company_kpi view and frontend now use DB-derived fields.
Test: company_kpi returns actual zero values and production deployment state.
Result: PASS.

## CH-20261001-06
Component: Incident/Production
Before: production failure existed with incidents=0.
Change: production_checks and incident INC-20261001-PROD-001 created.
Test: incident created with root cause initially HYPOTHESIS.
Result: PASS for detection recording.

## CH-20261001-07
Component: Netlify Production Root Cause
Date: 2026-10-01
Component: Production deployment / Netlify
Change: Updated operational records and Phase 2 documentation after reviewing the user's Netlify deploy evidence. No application code, Smoke Workflow, rollback, Netlify configuration, or new feature was changed.
Verified evidence:
- Netlify Project: aimpact-ai.
- Published Production: main@cf6b8c4.
- GitHub HEAD: d95af865a8913de320845c9fb1e778e9f20269c6.
- Netlify: “Production deploys are paused because your team has used all of its available credits for this billing cycle.”
- Netlify: “Production: main@d95af86 skipped.”
- Netlify: “Skipped due to account credit usage exceeded.”
Result: VERIFIED root cause = NETLIFY_TEAM_OPERATIONAL_CREDITS_EXHAUSTED.
Operational impact: latest GitHub commit is not deployed; Published Production remains on previous deploy.
Status: BLOCKED BY ACCOUNT CREDIT LIMIT.
Phase 3: NOT STARTED.
