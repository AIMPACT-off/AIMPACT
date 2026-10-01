# AIMPACT PRODUCTION SMOKE TEST

Run ID: phase2-20261001-prod-001
Environment: production

| Step | Expected | Actual | Result |
|---|---|---|---|
| HTTP root | HTTP 200-399 | Failed to fetch / Cache miss | FAILED |
| HOME | Reachable | Not executable because root request failed | BLOCKED |
| SEARCH | Functional | Not executable | BLOCKED |
| FILTER | Functional | Not executable | BLOCKED |
| TOOL DETAIL | Functional | Not executable | BLOCKED |
| COMPARE | Functional | Not executable | BLOCKED |
| APPLY | Functional | Not executable | BLOCKED |
| WORKFLOW | Functional | Not executable | BLOCKED |
| LEAD | Functional | Not executable | BLOCKED |
| EVENT | Recorded | Not executable | BLOCKED |
| SUPABASE | Backend exists | DB accessible through connector | VERIFIED |

Production root-cause classification remains UNVERIFIED because Netlify deployment/build/runtime logs are not available through the connected tools.

Reference incident: INC-20261001-PROD-001.
