# Phase 4 Production Preflight

This repository change prepares a read-only preflight; it does not apply migrations or enable LIVE execution.

## Run

```bash
npm run check:production-env
```

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to browser/client)
- `UPSTASH_REDIS_REST_URL` (HTTPS endpoint)
- `UPSTASH_REDIS_REST_TOKEN`

The checklist authenticates to the Supabase REST endpoint and performs an authenticated Upstash REST PING. It checks that the table-creating migrations declare RLS. It intentionally reports remote Production RLS as `NOT_VERIFIED`: local SQL and REST reachability cannot prove the live database's `relrowsecurity` flags or effective policies.

## Production migration gate

Do not run `supabase db push --linked` or apply SQL until all of the following are independently confirmed:
1. Correct production Supabase project ref and target database.
2. Verified, restorable pre-change backup / PITR recovery window.
3. Reviewed pending migration list and SQL diff.
4. Read-only SQL inspection of `pg_class.relrowsecurity` and `pg_policies` for every affected table.
5. A named operator has approved the change window and rollback/recovery plan.

The current preflight script does not perform a database write, create a backup, or certify Production RLS. Keep Production execution disabled until these gates pass.
