-- AIMPACT PR #22 worker claim contract.
-- Run only against the verified TEST schema.
-- The exact column names must be reconciled against the final PR #22 migration before execution.

begin;

with candidate as (
  select id
  from public.diagnosis_jobs
  where status in ('QUEUED','RETRY')
    and (lease_until is null or lease_until < now())
  order by created_at
  for update skip locked
  limit 1
)
update public.diagnosis_jobs j
set status='PROCESSING',
    lease_until=now() + interval '5 minutes',
    started_at=coalesce(started_at, now()),
    attempt_count=coalesce(attempt_count,0)+1,
    updated_at=now()
from candidate
where j.id=candidate.id
returning j.*;
commit;
