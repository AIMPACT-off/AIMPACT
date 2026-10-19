create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_profiles(tenant_id) on delete restrict,
  workflow_id text not null,
  execution_id uuid not null unique,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled')),
  mode text not null default 'sandbox',
  input_hash text not null,
  output_hash text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint execution_finished_after_started check (finished_at is null or finished_at >= started_at)
);
create index if not exists execution_logs_tenant_created_idx
  on public.execution_logs(tenant_id, created_at desc);
create index if not exists execution_logs_workflow_status_idx
  on public.execution_logs(workflow_id, status, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_profiles(tenant_id) on delete restrict,
  event_type text not null,
  actor_id uuid,
  execution_id uuid not null references public.execution_logs(execution_id) on delete restrict,
  input_hash text not null,
  output_hash text not null,
  previous_hash text,
  event_hash text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_tenant_created_idx
  on public.audit_logs(tenant_id, created_at desc);
create index if not exists audit_logs_execution_idx
  on public.audit_logs(execution_id);

alter table public.execution_logs enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.execution_logs from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
grant select, insert, update on public.execution_logs to service_role;
grant select, insert, update on public.audit_logs to service_role;