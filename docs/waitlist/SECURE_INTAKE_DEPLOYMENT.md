# AIMPACT Secure Waitlist Intake — Deployment Gate

Status: **IMPLEMENTATION DRAFT — NOT DEPLOYED / NOT ENABLED**

## Request path
Browser form (still disabled) → Netlify Function `/.netlify/functions/waitlist-intake` → Supabase RPC rate limiter → private `waitlist_submissions` table.

The function validates method, exact Origin, JSON content type/body size, required fields, email, HTTPS website URL, consent and notice version. It uses a keyed HMAC of the edge-provided client IP for a 5-request/hour limit. It does not log submitted personal data. The client never receives a database key.

## Important security boundary
The function uses `SUPABASE_SERVICE_ROLE_KEY`. Supabase service-role access bypasses RLS. This is intentional only for this narrow server-side operation; the browser must never receive this key. The migration revokes table access from `anon` and `authenticated`, enables RLS, and grants the server role only the operations required by the function. This is not proof of tenant isolation for other AIMPACT tables.

## Required Netlify environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only secret; never a VITE/NEXT_PUBLIC variable)
- `RATE_LIMIT_HMAC_SECRET` (random high-entropy secret)
- `ALLOWED_ORIGIN=https://aimpact-ai.netlify.app`

## Required before deployment
1. Confirm the actual Supabase project and hosting region / overseas-transfer disclosure.
2. Review the privacy notice, controller identity, contact details and lawful basis with qualified counsel.
3. Apply the migration only to a verified non-production project first.
4. Configure Netlify environment variables without exposing them in build logs.
5. Add integration tests against a disposable Supabase project: consent validation, invalid payload, origin rejection, 6th request blocked, anon SELECT/INSERT/UPDATE/DELETE denied, service-side insert succeeds.
6. Verify the production deploy and logs, then obtain explicit approval before enabling the browser form.

## Deletion and retention
Rows carry a six-month retention deadline. This migration does **not** create a scheduled purge or prove deletion within 24 hours. Until a scheduled, monitored purge and deletion-request runbook are implemented and tested, handle verified deletion requests manually, record the request and completion time, and do not advertise a guaranteed 24-hour purge. Rate-limit rows also require periodic cleanup.

## Rollback
Keep `WAITLIST_INTAKE_ENABLED = false`. If a deployment is accidentally exposed, remove/disable the Netlify function route or its required environment variables and confirm the public page remains non-submitting.
