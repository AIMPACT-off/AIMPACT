# AIMPACT Diagnosis Queue / Retry / DLQ RPC v1

**Status:** Draft implementation on a branch based on AI Diagnosis Data Contract v1. Not merged, not deployed, and not applied to a database.

## RPCs

- `claim_diagnosis_jobs(worker_id, batch_size, lease_seconds)`: recovers expired leases, moves exhausted leases to DLQ, then claims due jobs atomically with `FOR UPDATE SKIP LOCKED`. Claim increments attempt count and records a worker lease.
- `fail_diagnosis_job(tenant_id, job_id, worker_id, error...)`: verifies the active worker lease; schedules bounded exponential retry (30 seconds doubling to 1 hour), or terminalizes the job and writes one DLQ record after max attempts.
- `complete_diagnosis_job(tenant_id, job_id, worker_id)`: completes only a job currently leased by the named worker.

## Security

- All functions are SECURITY DEFINER with pinned search_path and EXECUTE restricted to service_role.
- Service role bypasses RLS. These functions scope mutations using both tenant_id and job_id, but the worker must derive tenant_id from trusted server-side job context, never from untrusted client input.
- DLQ table has RLS enabled and no anon/authenticated grants.
- Do not put full customer payloads, secrets, prompts, or provider response bodies in error_detail. The function stores only a short summary field.

## Required tests (not run here)

1. Two concurrent sessions claim the same queue: no job is returned to both.
2. Claim lease expiry requeues a job below max attempts.
3. Expired lease at max attempts moves job to FAILED and creates exactly one DLQ row.
4. Failure schedules 30s, 60s, 120s... capped at 3600s; max attempt moves to DLQ.
5. Wrong tenant, wrong worker, stale worker and non-leased completion/failure are rejected.
6. anon/authenticated cannot execute RPCs or read/write DLQ.
7. Run only after base data-contract migration is applied to a disposable Supabase project.

## Important implementation note

The current base schema permits job status values PENDING / PROCESSING / COMPLETED / FAILED. DLQ is a separate table, not a fifth job status. This keeps queue state and terminal operator work distinct.
