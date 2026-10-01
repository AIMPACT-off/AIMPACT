# AIMPACT DATA LINEAGE

## Current evidence
- Airtable AI TOOLS: 94
- Supabase public_tools: 101
- Exact name matches: 27
- Airtable-only: 67
- Supabase-only/orphaned: 74
- Supabase rows with canonical_tool_id: 101
- Airtable rows with canonical_tool_id: 94

## Important
Exact-name matching was used only to establish legacy linkage. Tool identity is now represented by canonical_tool_id. Name is not the ongoing identity key.

## Supabase provenance
All 101 public_tools rows have the same updated_at timestamp: 2026-09-30 08:53:12.370613+00. All 101 had null airtable_id before reconciliation. Repository inspection found no public_tools seed/import/insert source in the GitHub repository. The actual process that created the 101-row batch is therefore UNVERIFIED.

## Lineage states
- NAME_MATCH_ONLY: 27
- UNRESOLVED/ORPHANED: 74
- Airtable-only records: 67, represented in reconciliation as MISSING_SUPABASE

No record was deleted or forcibly merged.
