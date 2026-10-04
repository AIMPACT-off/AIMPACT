# Phase 2 disposable TEST database verification

This runner is a destructive integration test for a disposable TEST database. It applies the three canonical Phase 2 migrations in order, creates deterministic Tenant A/B fixtures, exercises queue/review behavior, removes its fixtures, and writes a JSON evidence file.

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

- Apply migrations `202610040002`, `202610040003`, and `202610040004` sequentially with `ON_ERROR_STOP`.
- Verify composite tenant foreign keys, browser-role denial, and cross-tenant FK rejection.
- Launch two independent `psql` worker claims concurrently and require exactly one to claim the same queued job.
- Claim a one-attempt job, fail it, and require `FAILED` plus exactly one `diagnosis_dead_letters` row.
- Verify latest review decision/report status agreement, caller transaction rollback, and rollback of the review insert when the report update is forced to fail.
- Capture database fixture rows in the JSON evidence package.
- When optional API variables are present, call the deployed review function and record Tenant A (200), Tenant B (403), and invalid-context (401) request/response evidence.

## Explicit limitations

- Database service-role tests do not prove authenticated account membership.
- Current canonical migrations do not define a trusted user-to-tenant membership table/policy. A valid HMAC tenant-context token is not proof that its subject belongs to that tenant.
- If `TEST_API_URL` and `TENANT_CONTEXT_HMAC_SECRET` are configured, the optional probe collects real HTTP request/response bodies for signed-context scoping. If absent, the API probe is `NOT_RUN`.
- Even when the optional API probe passes, authenticated account membership remains unverified: the test uses synthetic HMAC contexts and the current handler does not perform a trusted membership lookup.
- No production migration, deployment, merge, or feature activation is performed.
