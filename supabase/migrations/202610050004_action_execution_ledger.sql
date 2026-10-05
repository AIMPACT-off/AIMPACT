-- AIMPACT Control Plane action execution ledger v1
-- Additive TEST-only persistence contract. No production enablement.

create table if not exists public.control_plane_action_executions (
  execution_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid references public.control_plane_events(event_id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 120),
  status text not null check (status in ('EXECUTED','NO_HANDLER','FAILED','NOT_DISPATCHED')),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  attempt integer not null default 1 check (attempt >= 1),
  handler_version text not null default '1',
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  error_message text,
  correlation_id uuid,
  causation_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists control_plane_action_exec_tenant_time_idx
  on public.control_plane_action_executions (tenant_id, created_at desc, execution_id desc);

create index if not exists control_plane_action_exec_event_idx
  on public.control_plane_action_executions (tenant_id, event_id);

alter table public.control_plane_action_executions enable row level security;

revoke all on public.control_plane_action_executions from public, anon, authenticated;
grant select on public.control_plane_action_executions to authenticated;
grant all on public.control_plane_action_executions to service_role;

drop policy if exists control_plane_action_exec_member_read on public.control_plane_action_executions;
create policy control_plane_action_exec_member_read
  on public.control_plane_action_executions
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create or replace function public.record_action_execution_atomic(
  p_execution_id uuid,
  p_tenant_id uuid,
  p_event_id uuid,
  p_action text,
  p_status text,
  p_idempotency_key text,
  p_attempt integer default 1,
  p_handler_version text default '1',
  p_result jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null,
  p_correlation_id uuid default null,
  p_causation_id uuid default null,
  p_started_at timestamptz default now(),
  p_completed_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
  v_status text;
begin
  if p_execution_id is null or p_tenant_id is null
     or p_action is null or p_status is null or p_idempotency_key is null
     or p_attempt is null or p_attempt < 1
     or p_status not in ('EXECUTED','NO_HANDLER','FAILED','NOT_DISPATCHED')
     or p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'invalid action execution parameters' using errcode = '22023';
  end if;

  select execution_id into v_existing
    from public.control_plane_action_executions
   where tenant_id = p_tenant_id
     and idempotency_key = p_idempotency_key
   limit 1;

  if v_existing is not null then
    if v_existing <> p_execution_id then
      raise exception 'action idempotency key already belongs to a different execution id'
        using errcode = '23505';
    end if;

    select status into v_status
      from public.control_plane_action_executions
     where execution_id = v_existing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'execution_id', v_existing,
      'tenant_id', p_tenant_id,
      'status', v_status
    );
  end if;

  insert into public.control_plane_action_executions (
    execution_id, tenant_id, event_id, action, status, idempotency_key,
    attempt, handler_version, result, error_code, error_message,
    correlation_id, causation_id, started_at, completed_at
  ) values (
    p_execution_id, p_tenant_id, p_event_id, p_action, p_status, p_idempotency_key,
    p_attempt, p_handler_version, p_result, p_error_code, p_error_message,
    p_correlation_id, p_causation_id, p_started_at, p_completed_at
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'execution_id', p_execution_id,
    'tenant_id', p_tenant_id,
    'status', p_status
  );
exception
  when unique_violation then
    select execution_id into v_existing
      from public.control_plane_action_executions
     where tenant_id = p_tenant_id
       and idempotency_key = p_idempotency_key
     limit 1;
    if v_existing = p_execution_id then
      select status into v_status
        from public.control_plane_action_executions
       where execution_id = v_existing;
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'execution_id', v_existing,
        'tenant_id', p_tenant_id,
        'status', v_status
      );
    end if;
    raise;
end;
$$;

revoke all on function public.record_action_execution_atomic(
  uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,text,uuid,uuid,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.record_action_execution_atomic(
  uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,text,uuid,uuid,timestamptz,timestamptz
) to service_role;

comment on function public.record_action_execution_atomic(
  uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,text,uuid,uuid,timestamptz,timestamptz
) is
  'TEST-only Action Execution Ledger writer with tenant/idempotency protection.';
