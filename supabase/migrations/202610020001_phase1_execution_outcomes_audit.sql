-- AIMPACT Phase 1 foundation.
-- Apply only after review in a non-production Supabase project.
-- No customer-facing runtime is enabled by this migration.
create extension if not exists pgcrypto;

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id text not null,
  execution_id text not null unique,
  status text not null check (status in ('queued','dry_run','awaiting_approval','running','succeeded','failed','cancelled')),
  mode text not null check (mode in ('dry_run','sandbox','production')),
  input_hash text,
  output_hash text,
  actor_id text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.outcome_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
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

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  event_type text not null,
  actor_id text,
  execution_id text,
  occurred_at timestamptz not null default now(),
  input_hash text,
  output_hash text,
  previous_hash text,
  event_hash text not null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.execution_logs enable row level security;
alter table public.outcome_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Server-side service role only. Tenant-scoped client policies must be added
-- after the canonical tenant/auth schema has been inspected and tested.
revoke all on public.execution_logs, public.outcome_logs, public.audit_logs from anon, authenticated;
grant select, insert on public.execution_logs, public.outcome_logs to service_role;
grant select, insert on public.audit_logs to service_role;

create or replace function public.reject_audit_log_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update or delete on public.audit_logs
for each row execute function public.reject_audit_log_mutation();

comment on table public.execution_logs is 'Server-side workflow execution state; customer-facing access disabled until tenant policies are verified.';
comment on table public.outcome_logs is 'Versioned, evidence-linked outcomes; NULL means not measured, never assumed zero.';
comment on table public.audit_logs is 'Append-only decision and execution audit events; service-role/server-side writes only.';
