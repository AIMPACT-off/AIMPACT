# AIMPACT Operational Runbook — Phase 4 Standby

## Operating posture

Production execution remains **STANDBY / NOT AUTHORIZED** until credentials, live RLS tests, backup restoration, operator approval, and a separate LIVE authorization procedure are complete. Never paste production secrets into chat, issues, logs, or source control. Configure them only in the approved secret manager / GitHub Actions secrets.

## 1. Database migration rollback

There is no universal safe down-migration for the current production migration set. Do not run a guessed reverse migration or `supabase db reset` against production. After a verified restore point and approval, execute only the reviewed, migration-specific rollback SQL created for that release:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$APPROVED_ROLLBACK_SQL"
```

`APPROVED_ROLLBACK_SQL` must be an absolute path to a reviewed file, tested against a disposable clone with representative data. If a migration is irreversible, use the documented PITR restore procedure or a forward-fix; do not improvise a down migration.

## 2. Circuit breaker / global hard lock

For an application instance, activate the dispatcher kill switch through its control-plane admin path; the emergency environment gate for all new dispatches is:

```sh
AIMPACT_GLOBAL_KILL_SWITCH=true
```

Apply through the deployment platform's runtime configuration and restart/roll out every replica. The current in-process `GlobalKillSwitch.activate()` aborts registered cooperative tasks in that process only; an environment change does not broadcast to already-running replicas. Verify every replica reports the gate active before considering the lock complete.

## 3. Fail-closed fallback to MOCK

Upstash or Supabase execution-store failure must **not** trigger an automatic LIVE-to-MOCK switch: silently changing modes can conceal lost state or produce misleading outcomes. Current dispatcher behavior is fail-closed (503) when required persistent stores are unavailable. To resume safe testing, explicitly deploy/restart with `EXECUTION_MODE=MOCK`; MOCK executes only the eight synthetic `mock-01`…`mock-08` workflows and performs no external API dispatch. Do not use MOCK results as production outcomes.

## Pre-flight commands

- Read-only cross-tenant RLS check: `npm run test:tenant-isolation` (requires distinct pre-provisioned tenant A/B JWTs and B-owned fixture URLs).
- Production environment checklist: `npm run check:production-env`.
- Full automated test suite: `npm test`.

A passing pre-flight does not by itself authorize production execution. Live DB policy predicates, tenant JWT isolation, PITR restore, and named operator approval remain independent gates.
