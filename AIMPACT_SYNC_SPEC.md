# AIMPACT SYNC SPEC

Target flow:

Airtable
→ Human Approval
→ Canonical Tool ID
→ Validation
→ Idempotent Upsert
→ Supabase
→ Verification
→ Production

Required controls:
- canonical ID matching
- duplicate detection
- field reconciliation
- status validation
- timestamp
- result logging
- error logging
- retry
- rollback reference
- incident creation

Implemented foundation:
- canonical_tool_id
- tool_reconciliation
- tool_sync_log
- legacy ID preservation

Current status:
STRUCTURE VERIFIED.
End-to-end Airtable→Supabase automated sync is UNVERIFIED.
No destructive replacement was performed.
