# AIMPACT audit scripts

## Provider environment detector
Run `node scripts/check-provider-env.mjs`. It prints credential presence only, never values. Presence does not validate authentication or entitlement. Provider-specific health probes must be added only for documented read-only endpoints.

## Tenant isolation negative tests
Run with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TENANT_A_JWT` and `RLS_TEST_CASES`. Test cases must point at a row known to belong to Tenant B; an empty result is meaningful only when the fixture is known to exist. Never use a service-role key. Run only against a non-production test project unless an approved test fixture is in place.

## Schema snapshot
The GitHub Actions workflow uses Supabase CLI and `SUPABASE_DB_URL` to create a schema-only dump. It never dumps table data. Review generated diffs before merging; schema snapshots can expose function definitions or internal object names and should be treated as sensitive.
