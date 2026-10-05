-- AIMPACT Consistency Hardening V1 / Phase A
-- TEST-only: execution intent outbox table only.
create table if not exists public.control_plane_execution_outbox (
  intent_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid references public.control_plane_events(event_id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 120),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  status text not null default 'PENDING'
    check (status in ('PENDING','CLAIMED','COMPLETED','FAILED','CANCELED')),
  attempt integer not null default 0 check (attempt >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  correlation_id uuid,
  causation_id uuid,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists control_plane_outbox_ready_idx
  on public.control_plane_execution_outbox (status, available_at, created_at, intent_id);

create index if not exists control_plane_outbox_tenant_idx
  on public.control_plane_execution_outbox (tenant_id, created_at desc, intent_id);

alter table public.control_plane_execution_outbox enable row level security;

comment on table public.control_plane_execution_outbox is
  'TEST-only Consistency Hardening V1 execution intent outbox. Phase A schema.';
