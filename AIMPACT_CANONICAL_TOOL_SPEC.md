# AIMPACT CANONICAL TOOL SPEC

Canonical format:
tool_<stable-hash>_<normalized-name>

Canonical ID is deterministic from normalized Tool name and is shared between Airtable and Supabase.

Legacy identifiers remain:
- Airtable record ID
- Supabase UUID
- existing legacy identifiers

Duplicate records are not deleted. They must be classified as DUPLICATE and retain lineage.

Current implementation:
- public_tools.canonical_tool_id: 101/101 populated
- Airtable AI TOOLS CANONICAL TOOL ID: 94/94 populated
- unique index exists on Supabase canonical_tool_id

Status: VERIFIED
