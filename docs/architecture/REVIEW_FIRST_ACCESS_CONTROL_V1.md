# Review-First Access Control v1

Status: Draft / review only. Depends on PR #21 data-contract schema. No migration has been applied.

## Security decision

Customer direct reads of `diagnosis_reports` and `diagnosis_reviews` remain denied to `anon` and `authenticated`. The repository's canonical mapping from `auth.uid()` to tenant membership has not yet been established, so this change deliberately does not invent a membership table or add a customer SELECT policy.

## Atomic review operation

The planned server-only RPC accepts tenant_id, report_id, reviewer_id, decision, and notes. It accepts only APPROVED, REJECTED, or REVISION_REQUESTED; locks the tenant-scoped report row; appends a row to `diagnosis_reviews`; and updates `diagnosis_reports.report_status` in the same transaction.

## Mandatory server contract

The RPC must not be called from a browser. A trusted server endpoint must authenticate the human reviewer, verify their admin/reviewer role, derive tenant_id from trusted server-side membership data, and derive reviewer_id from the authenticated identity. It must not accept these identifiers as trusted client input. Keep the service-role key server-side.

## Customer report access remains blocked

No authenticated SELECT grant or RLS policy is added. The intended future customer policy must require both verified membership of `auth.uid()` in the report's tenant and an approved report state corroborated by the latest review decision. Before enabling it, discover and test the canonical membership schema. A view or server API may be preferable to granting access to base tables.

## Verification still required

- PostgreSQL parse and execution against a disposable Supabase project after PR #21 schema is applied.
- Atomicity test: review insert and report update both commit or both roll back.
- Two concurrent reviewers against one report.
- Invalid decision, missing report, wrong tenant, null IDs, and notes-length tests.
- Verify anon/authenticated cannot SELECT or execute the RPC.
- Verify service_role can execute and tenant predicates prevent cross-tenant updates.
- Independent security review of server-side reviewer authorization.

No production migration, merge, or deployment is authorized by this draft.
