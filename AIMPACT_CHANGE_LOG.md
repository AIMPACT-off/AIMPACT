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

## CH-20261001-03
Component: Reconciliation
Before: 101 reconciliation records.
Change: expanded to 168 records and classified mismatches.
Test: 27 MISSING_AIRTABLE_ID; 67 MISSING_SUPABASE; 74 ORPHANED.
Result: PASS.
Rollback: no deletion.

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
Test: company_kpi returns actual zero values and UNVERIFIED production state.
Result: PASS.

## CH-20261001-06
Component: Incident/Production
Before: production failure existed with incidents=0.
Change: production_checks and incident INC-20261001-PROD-001 created.
Test: incident status INVESTIGATING; root_cause_status HYPOTHESIS.
Result: PASS for detection recording.
