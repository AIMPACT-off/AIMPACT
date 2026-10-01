# AIMPACT PRODUCTION SMOKE TEST

Run ID: phase2-20261001-prod-001  
Environment: production

## Deployment state

- GitHub HEAD: d95af865a8913de320845c9fb1e778e9f20269c6 — VERIFIED
- Netlify Published Production: cf6b8c4 — VERIFIED
- Netlify deploy of d95af86: SKIPPED — VERIFIED
- Blocker: NETLIFY_TEAM_OPERATIONAL_CREDITS_EXHAUSTED — VERIFIED
- Smoke workflow: no further modification required.

## Root-cause evidence

Netlify states: “Production deploys are paused because your team has used all of its available credits for this billing cycle.”

Recent deploy:
- “Production: main@d95af86 skipped”
- “Skipped due to account credit usage exceeded”

Therefore the current production deployment is not the latest GitHub HEAD.

## Current smoke state

| Step | Expected | Actual | Result |
|---|---|---|---|
| HTTP root | HTTP 200-399 | Production validation previously returned Failed to fetch / Cache miss; latest-commit deployment is blocked | FAILED |
| HOME | Reachable | Cannot certify against latest GitHub HEAD until deployment resumes | BLOCKED |
| SEARCH | Functional | Not executed/certified against latest HEAD | BLOCKED |
| FILTER | Functional | Not executed/certified against latest HEAD | BLOCKED |
| TOOL DETAIL | Functional | Not executed/certified against latest HEAD | BLOCKED |
| COMPARE | Functional | Not executed/certified against latest HEAD | BLOCKED |
| APPLY | Functional | Not executed/certified against latest HEAD | BLOCKED |
| WORKFLOW | Functional | Not executed/certified against latest HEAD | BLOCKED |
| LEAD | Recorded | Not executed/certified against latest HEAD | BLOCKED |
| EVENT | Recorded | Not executed/certified against latest HEAD | BLOCKED |
| SUPABASE | Backend exists and accessible | DB accessible through connector | VERIFIED |

Important: the FAILED HTTP result does not establish an internal error in Published Production cf6b8c4. The verified operational blocker is the skipped deployment of d95af86 due to Netlify account credit exhaustion.

## Required order after deployment resumes

1. Smoke Level 0
2. Smoke Level 1
3. Smoke Level 2
4. E2E
5. Verification evidence
6. Airtable → Supabase sync/reconciliation
7. Regression
8. Phase 2 certification

Do not start Phase 3 before these gates pass.
