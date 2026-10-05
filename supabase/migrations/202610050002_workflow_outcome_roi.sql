-- AIMPACT Workflow + Outcome/ROI v1
-- TEST/REVIEW ONLY. Production remains frozen.
-- Workflow creation is trusted-server only; authenticated clients may read only their active tenant.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_id uuid not null,
  status text not null default 'READY'
    check (status in ('READY','QUEUED','RUNNING','BLOCKED','COMPLETED','FAILED')),
  workflow_name text not null check (char_length(trim(workflow_name)) between 1 and 160),
  current_step text not null default 'DISCOVER'
    check (current_step in ('DISCOVER','VERIFY','APPLY','MEASURE')),
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, report_id)
    references public.diagnosis_reports(tenant_id, id) on delete cascade
);

create index if not exists workflow_runs_tenant_updated_idx
  on public.workflow_runs (tenant_id, updated_at desc);

create table if not exists public.outcome_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id uuid not null,
  metric_name text not null check (char_length(trim(metric_name)) between 1 and 120),
  baseline_value numeric,
  current_value numeric,
  unit text,
  measurement_period_start timestamptz,
  measurement_period_end timestamptz,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, workflow_id)
    references public.workflow_runs(tenant_id, id) on delete cascade
);

create index if not exists outcome_metrics_tenant_created_idx
  on public.outcome_metrics (tenant_id, created_at desc);

alter table public.workflow_runs enable row level security;
alter table public.outcome_metrics enable row level security;

revoke all on public.workflow_runs, public.outcome_metrics from public, anon, authenticated;
grant select on public.workflow_runs, public.outcome_metrics to authenticated;
grant all on public.workflow_runs, public.outcome_metrics to service_role;

drop policy if exists workflow_runs_member_read on public.workflow_runs;
create policy workflow_runs_member_read on public.workflow_runs
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

drop policy if exists outcome_metrics_member_read on public.outcome_metrics;
create policy outcome_metrics_member_read on public.outcome_metrics
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

revoke all on public.workflow_runs, public.outcome_metrics from anon;
