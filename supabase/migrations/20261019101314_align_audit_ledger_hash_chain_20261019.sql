create extension if not exists pgcrypto;

alter table public.audit_logs
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists chain_seq bigserial;

create unique index if not exists audit_logs_chain_seq_uidx
  on public.audit_logs(chain_seq);

alter table public.execution_logs
  add column if not exists actor_id text;

alter table public.execution_logs
  drop constraint if exists execution_logs_status_check;
alter table public.execution_logs
  add constraint execution_logs_status_check
  check (status in ('queued','dry_run','awaiting_approval','running','succeeded','failed','cancelled'));

create table if not exists public.outcome_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_profiles(tenant_id) on delete restrict,
  execution_id uuid not null references public.execution_logs(id) on delete restrict,
  metric_schema_version text not null default '1.0',
  baseline_period tstzrange,
  measurement_period tstzrange,
  t_saved_hours numeric,
  c_saved numeric,
  currency char(3),
  e_reduced_pct numeric,
  baseline_time_hours numeric,
  observed_time_hours numeric,
  baseline_cost numeric,
  observed_cost numeric,
  baseline_error_rate numeric,
  observed_error_rate numeric,
  sample_size integer,
  evidence_reference text,
  attribution_method text,
  measurement_status text not null default 'not_measured'
    check (measurement_status in ('not_measured','estimated','measured','approved','rejected')),
  limitations jsonb not null default '{}'::jsonb,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  check (t_saved_hours is null or baseline_time_hours is not null),
  check (c_saved is null or currency is not null),
  check (e_reduced_pct is null or (e_reduced_pct >= -100 and e_reduced_pct <= 100))
);

create index if not exists outcome_logs_tenant_created_idx
  on public.outcome_logs(tenant_id, created_at desc);

alter table public.outcome_logs enable row level security;
revoke all on public.execution_logs, public.outcome_logs, public.audit_logs from anon, authenticated;
grant select, insert, update on public.execution_logs to service_role;
grant select, insert on public.outcome_logs, public.audit_logs to service_role;

create or replace function public.reject_audit_log_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update or delete on public.audit_logs
for each row execute function public.reject_audit_log_mutation();

create or replace function public.audit_log_hash_chain()
returns trigger language plpgsql as $$
declare prior_hash text;
declare payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('aimpact.audit_logs.chain'));
  select event_hash into prior_hash from public.audit_logs order by chain_seq desc limit 1;
  new.previous_hash := coalesce(prior_hash, repeat('0',64));
  payload := jsonb_build_object(
    'chain_seq',new.chain_seq,'id',new.id,'tenant_id',new.tenant_id,
    'event_type',new.event_type,'actor_id',new.actor_id,'execution_id',new.execution_id,
    'occurred_at',new.occurred_at,'input_hash',new.input_hash,'output_hash',new.output_hash,
    'previous_hash',new.previous_hash,'metadata',new.metadata
  );
  new.event_hash := encode(digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');
  return new;
end;
$$;

drop trigger if exists audit_logs_hash_chain on public.audit_logs;
create trigger audit_logs_hash_chain before insert on public.audit_logs
for each row execute function public.audit_log_hash_chain();

create or replace function public.verify_audit_log_chain()
returns table(chain_seq bigint, expected_hash text, stored_hash text, valid boolean)
language sql stable as $$
  with ordered as (
    select a.*, lag(event_hash) over(order by chain_seq) prior
    from public.audit_logs a
  ),
  calculated as (
    select chain_seq,event_hash,previous_hash,
      encode(digest(convert_to(jsonb_build_object(
        'chain_seq',chain_seq,'id',id,'tenant_id',tenant_id,'event_type',event_type,
        'actor_id',actor_id,'execution_id',execution_id,'occurred_at',occurred_at,
        'input_hash',input_hash,'output_hash',output_hash,'previous_hash',previous_hash,
        'metadata',metadata
      )::text,'UTF8'),'sha256'),'hex') calc,
      coalesce(prior,repeat('0',64)) expected_prior
    from ordered
  )
  select chain_seq,calc,event_hash,(calc=event_hash and previous_hash=expected_prior)
  from calculated order by chain_seq;
$$;

revoke all on function public.verify_audit_log_chain() from public,anon,authenticated;
grant execute on function public.verify_audit_log_chain() to service_role;

comment on table public.execution_logs is 'Server-side workflow execution state; service-role only.';
comment on table public.outcome_logs is 'Versioned, evidence-linked outcomes; NULL means not measured, never assumed zero.';
comment on table public.audit_logs is 'Append-only, hash-chained decision and execution audit events; service-role/server-side writes only.';