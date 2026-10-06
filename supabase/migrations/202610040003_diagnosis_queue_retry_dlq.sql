-- AIMPACT async diagnosis queue claim/retry/DLQ RPCs v1
-- Depends on 202610040002_ai_diagnosis_data_contract.sql.
-- REVIEW ONLY: do not apply until disposable Supabase integration tests pass.
-- All RPCs are service_role-only. service_role bypasses RLS; callers MUST scope by tenant_id.

create table if not exists public.diagnosis_dead_letters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_id uuid not null,
  attempt_count integer not null check (attempt_count >= 0),
  terminal_reason text not null,
  error_code text,
  error_message text,
  error_detail jsonb,
  failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  foreign key (tenant_id, job_id)
    references public.diagnosis_jobs (tenant_id, id) on delete restrict,
  unique (tenant_id, job_id)
);

create index if not exists diagnosis_dead_letters_tenant_failed_idx
  on public.diagnosis_dead_letters (tenant_id, failed_at desc);

alter table public.diagnosis_dead_letters enable row level security;
revoke all on public.diagnosis_dead_letters from public, anon, authenticated;
grant select, insert, update on public.diagnosis_dead_letters to service_role;

create or replace function public.claim_diagnosis_jobs(
  p_worker_id text,
  p_batch_size integer default 5,
  p_lease_seconds integer default 300
) returns setof public.diagnosis_jobs
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120
     or p_batch_size < 1 or p_batch_size > 50
     or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'invalid claim parameters';
  end if;

  with exhausted as (
    update public.diagnosis_jobs j
       set status = 'FAILED', locked_at = null, locked_by = null,
           last_error_code = coalesce(j.last_error_code, 'LEASE_EXPIRED_MAX_ATTEMPTS'),
           last_error_message = coalesce(j.last_error_message, 'Worker lease expired after maximum attempts'),
           updated_at = clock_timestamp()
     where j.status = 'PROCESSING'
       and j.locked_at < clock_timestamp() - make_interval(secs => p_lease_seconds)
       and j.attempt_count >= j.max_attempts
    returning j.tenant_id, j.id, j.attempt_count, j.last_error_code,
              j.last_error_message, j.last_error_detail
  )
  insert into public.diagnosis_dead_letters
    (tenant_id, job_id, attempt_count, terminal_reason, error_code, error_message, error_detail)
  select tenant_id, id, attempt_count, 'MAX_ATTEMPTS_LEASE_EXPIRED',
         last_error_code, last_error_message, last_error_detail
    from exhausted
  on conflict (tenant_id, job_id) do nothing;

  update public.diagnosis_jobs j
     set status = 'PENDING', available_at = clock_timestamp(),
         locked_at = null, locked_by = null, updated_at = clock_timestamp()
   where j.status = 'PROCESSING'
     and j.locked_at < clock_timestamp() - make_interval(secs => p_lease_seconds)
     and j.attempt_count < j.max_attempts;

  return query
  with picked as (
    select j.id from public.diagnosis_jobs j
     where j.status = 'PENDING' and j.available_at <= clock_timestamp()
       and j.attempt_count < j.max_attempts
     order by j.available_at, j.created_at
     for update skip locked limit p_batch_size
  )
  update public.diagnosis_jobs j
     set status = 'PROCESSING', attempt_count = j.attempt_count + 1,
         locked_at = clock_timestamp(), locked_by = p_worker_id, updated_at = clock_timestamp()
    from picked where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.fail_diagnosis_job(
  p_tenant_id uuid, p_job_id uuid, p_worker_id text,
  p_error_code text, p_error_message text, p_error_detail jsonb default null
) returns public.diagnosis_jobs
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare j public.diagnosis_jobs%rowtype; delay_seconds integer;
begin
  if p_tenant_id is null or p_job_id is null
     or p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'invalid failure parameters';
  end if;
  select * into j from public.diagnosis_jobs
   where tenant_id = p_tenant_id and id = p_job_id for update;
  if not found then raise exception 'job not found'; end if;
  if j.status <> 'PROCESSING' or j.locked_by is distinct from p_worker_id then
    raise exception 'job is not leased by this worker';
  end if;
  if j.attempt_count >= j.max_attempts then
    update public.diagnosis_jobs
       set status = 'FAILED', locked_at = null, locked_by = null,
           last_error_code = left(p_error_code, 120),
           last_error_message = left(p_error_message, 1000),
           last_error_detail = case when p_error_detail is null then null else
             jsonb_build_object('summary', left(coalesce(p_error_detail->>'summary',''), 1000)) end,
           updated_at = clock_timestamp()
     where tenant_id = p_tenant_id and id = p_job_id returning * into j;
    insert into public.diagnosis_dead_letters
      (tenant_id, job_id, attempt_count, terminal_reason, error_code, error_message, error_detail)
    values (j.tenant_id, j.id, j.attempt_count, 'MAX_ATTEMPTS_EXCEEDED',
            j.last_error_code, j.last_error_message, j.last_error_detail)
    on conflict (tenant_id, job_id) do nothing;
  else
    delay_seconds := least(3600, (30 * power(2, greatest(j.attempt_count - 1, 0)))::integer);
    update public.diagnosis_jobs
       set status = 'PENDING',
           available_at = clock_timestamp() + make_interval(secs => delay_seconds),
           locked_at = null, locked_by = null,
           last_error_code = left(p_error_code, 120),
           last_error_message = left(p_error_message, 1000),
           last_error_detail = case when p_error_detail is null then null else
             jsonb_build_object('summary', left(coalesce(p_error_detail->>'summary',''), 1000)) end,
           updated_at = clock_timestamp()
     where tenant_id = p_tenant_id and id = p_job_id returning * into j;
  end if;
  return j;
end;
$$;

create or replace function public.complete_diagnosis_job(
  p_tenant_id uuid, p_job_id uuid, p_worker_id text
) returns public.diagnosis_jobs
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare j public.diagnosis_jobs%rowtype;
begin
  if p_tenant_id is null or p_job_id is null
     or p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'invalid completion parameters';
  end if;
  update public.diagnosis_jobs
     set status = 'COMPLETED', completed_at = clock_timestamp(),
         locked_at = null, locked_by = null, updated_at = clock_timestamp()
   where tenant_id = p_tenant_id and id = p_job_id
     and status = 'PROCESSING' and locked_by = p_worker_id
  returning * into j;
  if not found then raise exception 'job is not leased by this worker'; end if;
  return j;
end;
$$;

revoke all on function public.claim_diagnosis_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_diagnosis_job(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_diagnosis_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_diagnosis_jobs(text, integer, integer) to service_role;
grant execute on function public.fail_diagnosis_job(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.complete_diagnosis_job(uuid, uuid, text) to service_role;

comment on table public.diagnosis_dead_letters is
  'Terminal diagnosis jobs requiring operator inspection; never stores raw customer payloads.';
