# Phase 2 disposable TEST database verification

This runner is a destructive integration test for a disposable TEST database. It applies the five canonical Phase 2 migrations in order, creates deterministic Tenant A/B fixtures, exercises queue/review behavior, removes its fixtures, and writes a JSON evidence file.

## Preconditions

- Use a newly created, disposable Supabase TEST project/database. Never point this runner at production or a shared database.
- Install Node.js and the PostgreSQL `psql` client.
- Supply `TEST_DATABASE_URL` through the local shell or CI secret store. Do not paste credentials into chat or commit them.
- Set `TEST_DB_DISPOSABLE=YES` only after independently confirming the target is disposable.
- Optional HTTP probe: set `TEST_API_URL` to the TEST/staging Netlify site base URL and `TENANT_CONTEXT_HMAC_SECRET` through the secret store. The runner signs synthetic Tenant A/B contexts and records the actual GET responses.

## Run

```sh
export TEST_DATABASE_URL='postgresql://…'
export TEST_DB_DISPOSABLE=YES
npm run test:phase2-db
```

Evidence is written to `artifacts/phase2-test-evidence/` by default. Set `TEST_EVIDENCE_DIR` to change the output directory. The evidence contains the target host/database name, migration results, check results, and fixture rows; it does not write the connection URL.

## Covered checks

- Apply migrations `202610040002` through `202610040005` sequentially with `ON_ERROR_STOP`.
- Verify the Auth-linked `tenants` / `tenant_memberships` schema, RLS enablement, authenticated grants, and approved-report policy function through PostgreSQL catalog checks.
- Verify composite tenant foreign keys, browser-role denial, and cross-tenant FK rejection.
- Launch two independent `psql` worker claims concurrently and require exactly one to claim the same queued job.
- Claim a one-attempt job, fail it, and require `FAILED` plus exactly one `diagnosis_dead_letters` row.
- Verify latest review decision/report status agreement, caller transaction rollback, and rollback of the review insert when the report update is forced to fail.
- Capture database fixture rows in the JSON evidence package.
- When optional API variables are present, call the deployed review function and record Tenant A (200), Tenant B (403), and invalid-context (401) request/response evidence.

## Real Supabase Auth JWT audit

The companion script `scripts/phase2-auth-jwt-audit.mjs` provisions two disposable Auth users through the Supabase Admin API, signs both in through the password grant to obtain real access JWTs, creates isolated Tenant A/B fixtures, and queries PostgREST using each user's JWT (never the service-role key) to verify membership, tenant, approved-report, and unapproved-report RLS behavior. It also attempts an authenticated membership mutation and requires denial.

Run only against a disposable TEST project after confirming the target:

```sh
export TEST_SUPABASE_URL='https://<disposable-project>.supabase.co'
export TEST_SUPABASE_ANON_KEY='…'
export TEST_SUPABASE_SERVICE_ROLE_KEY='…'
export TEST_DB_DISPOSABLE=YES
node scripts/phase2-auth-jwt-audit.mjs
```

Keep keys in a local shell or secure CI secret store; never paste them into chat or commit them. The script rejects non-HTTPS and production-like hosts, emits status/count evidence without tokens or credentials, and attempts fixture cleanup. Inspect the TEST project for residual fixtures if a run fails. A successful run is the first runtime evidence for real Supabase JWT-to-membership RLS behavior; it does not prove a production deployment, tenant-owner bootstrap API, invitations, or end-to-end signup UX.

## Evidence interpretation and limits

- A successful GitHub Actions run against its disposable local Supabase stack proves that workflow's migration/audit exercise only. It is not a PASS for a separately provisioned TEST database. Record these as separate evidence sources.
- Two independent claims launched with `Promise.all` (or otherwise launched concurrently) prove concurrent request launch and the observed claim outcome. They do **not**, by themselves, prove that the requests overlapped while contending for the same PostgreSQL row lock. Strict row-lock contention remains **NOT VERIFIED** unless a separate test deliberately holds the relevant lock, demonstrates the competing session is blocked, and captures the resulting evidence.
- The HTTP probe evidence contract is limited to request metadata, HTTP status code, and response body payload actually collected by the runner. Do not claim response-header evidence unless the runner is explicitly changed to collect and persist headers and that change is verified.
- The optional API probe's 200/403/401 outcomes prove only the signed-tenant-context behavior exercised by those requests. They do not prove authenticated user-to-tenant membership.
- Database service-role tests do not prove authenticated account membership.
- Migration `202610040005` defines Auth-linked tenant and membership tables plus RLS-scoped tenant/report reads. This is schema implementation, not proof that a real authenticated JWT is mapped to the intended membership at runtime. A valid HMAC tenant-context token is not proof that its subject belongs to that tenant.
- If `TEST_API_URL` and `TENANT_CONTEXT_HMAC_SECRET` are configured, the optional probe collects real HTTP response status and body for signed-context scoping. If absent, the API probe is `NOT_RUN`.
- Even when the optional API probe passes, authenticated account membership remains unverified: the probe uses synthetic HMAC contexts and does not exercise a Supabase Auth JWT against the membership RLS policies.
- No production migration, deployment, merge, or feature activation is performed.

## Evidence status vocabulary

Use these labels consistently in reports:

- `PASS`: the named check ran against the named target and its raw evidence satisfies the stated assertion.
- `ALIGNED`: source or documentation matches the agreed specification; this is not a runtime pass.
- `NOT_RUN`: the check was not executed.
- `NOT VERIFIED`: execution/evidence is absent or insufficient to support the claim.
- `UNVERIFIED`: a required security or product property has not been established.
- `HOLD`: an operational gate intentionally prevents merge, deployment, migration, or activation.

Never aggregate source-level alignment, local disposable CI, dedicated TEST DB runtime, and production verification into one undifferentiated PASS or completion percentage.
