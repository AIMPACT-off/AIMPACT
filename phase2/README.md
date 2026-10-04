# AIMPACT Phase 2 — Product Portal V1

Status: BUILD ARTIFACT / NOT PRODUCTION READY

This branch creates the first executable B2B client-portal surface while keeping backend activation fail-closed.

## Product flow

OVERVIEW → DIAGNOSIS → REPORTS → WORKFLOWS → ROI → BILLING

## Security boundary

- Browser never receives a Supabase service-role key.
- Customer report data is not embedded in the static application.
- The portal calls `/.netlify/functions/diagnosis-portal`.
- The API remains disabled until server-side authentication, tenant membership and database integration are verified.
- No production merge or billing activation is performed by this branch.

## Build vs verification

BUILD COMPLETE means the UI/API contract exists in source control.

It does not mean:
- Supabase migration applied
- tenant isolation verified
- authenticated customer access verified
- AI provider connected
- Stripe live billing connected
- production deployed

## Next integration gates

1. Apply PR #21 data contract in disposable TEST Supabase.
2. Validate PR #22 queue/DLQ concurrency.
3. Validate PR #23 atomic review.
4. Establish canonical auth.uid() → tenant membership mapping.
5. Implement authenticated server-side portal API.
6. Verify customer can read APPROVED reports only.
7. Connect billing entitlement after payment verification.
