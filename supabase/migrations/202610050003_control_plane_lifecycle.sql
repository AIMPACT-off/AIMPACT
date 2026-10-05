-- AIMPACT Control Plane lifecycle event ledger + optimistic state projection v1
-- Additive TEST-only control-plane persistence contract.
-- The application lifecycle engine remains the canonical transition vocabulary;
-- this layer provides atomic idempotency and compare-and-swap concurrency control.

create table if not exists public.control_plane_events (
  event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 8 and 240),
  sequence bigint not null check (sequence >= 1),
  actor_type text not null default 'system'
    check (actor_type in ('user','system','webhook','worker','cron')),
  actor_id uuid,
  correlation_id uuid,
  causation_id uuid,
  schema_version text not null default '1',
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, sequence)
);

create index if not exists control_plane_events_tenant_time_idx
  on public.control_plane_events (tenant_id, occurred_at desc, event_id desc);

create table if not exists public.customer_lifecycle_state (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  state text not null default 'LEAD'
    check (state in (
      'LEAD','ONBOARDING','DIAGNOSIS','REVIEW','APPROVED','READY','ACTIVE',
      'OUTCOME','RENEWAL','COMPLETED','BLOCKED','SUSPENDED','CANCELED','FAILED'
    )),
  version bigint not null default 0 check (version >= 0),
  last_event_id uuid references public.control_plane_events(event_id),
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.control_plane_events enable row level security;
alter table public.customer_lifecycle_state enable row level security;

revoke all on public.control_plane_events, public.customer_lifecycle_state from public, anon, authenticated;
grant select on public.control_plane_events, public.customer_lifecycle_state to authenticated;
grant all on public.control_plane_events, public.customer_lifecycle_state to service_role;

drop policy if exists control_plane_events_member_read on public.control_plane_events;
create policy control_plane_events_member_read on public.control_plane_events
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

drop policy if exists customer_lifecycle_state_member_read on public.customer_lifecycle_state;
create policy customer_lifecycle_state_member_read on public.customer_lifecycle_state
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create or replace function public.apply_lifecycle_event_atomic(
  p_event_id uuid,
  p_tenant_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_expected_version bigint,
  p_next_sequence bigint,
  p_actor_type text default 'system',
  p_actor_id uuid default null,
  p_correlation_id uuid default null,
  p_causation_id uuid default null,
  p_schema_version text default '1',
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_state text;
  v_current_version bigint;
  v_next_state text;
  v_inserted_event_id uuid;
  v_duplicate boolean := false;
  v_updated integer := 0;
begin
  if p_event_id is null or p_tenant_id is null
     or p_event_type is null or p_idempotency_key is null
     or p_expected_version is null or p_next_sequence is null
     or p_expected_version < 0 or p_next_sequence < 1
     or p_actor_type not in ('user','system','webhook','worker','cron')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid lifecycle event parameters' using errcode = '22023';
  end if;

  select s.state, s.version
    into v_current_state, v_current_version
    from public.customer_lifecycle_state s
   where s.tenant_id = p_tenant_id;

  if v_current_state is null then
    if p_expected_version <> 0 then
      raise exception 'optimistic version mismatch: expected 0 for new lifecycle state, got %', p_expected_version
        using errcode = '40001';
    end if;
    v_current_state := 'LEAD';
    v_current_version := 0;
  end if;

  if v_current_version <> p_expected_version then
    raise exception 'optimistic version mismatch: expected %, actual %', p_expected_version, v_current_version
      using errcode = '40001';
  end if;

  select case
    when v_current_state = 'LEAD' and p_event_type = 'TENANT_CREATED' then 'ONBOARDING'
    when v_current_state = 'ONBOARDING' and p_event_type = 'DIAGNOSIS_SUBMITTED' then 'DIAGNOSIS'
    when v_current_state = 'DIAGNOSIS' and p_event_type = 'DIAGNOSIS_REVIEW_STARTED' then 'REVIEW'
    when v_current_state in ('DIAGNOSIS','REVIEW') and p_event_type = 'DIAGNOSIS_REVIEW_APPROVED' then 'APPROVED'
    when v_current_state = 'REVIEW' and p_event_type = 'DIAGNOSIS_REVIEW_REJECTED' then 'DIAGNOSIS'
    when v_current_state = 'APPROVED' and p_event_type = 'ENTITLEMENT_ACTIVE' then 'READY'
    when v_current_state = 'READY' and p_event_type = 'WORKFLOW_STARTED' then 'ACTIVE'
    when v_current_state = 'ACTIVE' and p_event_type = 'OUTCOME_SUBMITTED' then 'OUTCOME'
    when v_current_state = 'ACTIVE' and p_event_type = 'WORKFLOW_FAILED' then 'FAILED'
    when v_current_state = 'OUTCOME' and p_event_type = 'OUTCOME_VERIFIED' then 'RENEWAL'
    when v_current_state = 'OUTCOME' and p_event_type = 'OUTCOME_REJECTED' then 'ACTIVE'
    when v_current_state = 'RENEWAL' and p_event_type = 'SUBSCRIPTION_RENEWED' then 'ACTIVE'
    when v_current_state = 'RENEWAL' and p_event_type = 'SUBSCRIPTION_CANCELED' then 'CANCELED'
    when v_current_state = 'BLOCKED' and p_event_type = 'BLOCK_RESOLVED' then 'READY'
    when v_current_state = 'SUSPENDED' and p_event_type = 'SUSPENSION_RESOLVED' then 'READY'
    when v_current_state = 'SUSPENDED' and p_event_type = 'SUBSCRIPTION_CANCELED' then 'CANCELED'
    when v_current_state = 'FAILED' and p_event_type = 'RETRY_APPROVED' then 'READY'
    when v_current_state = 'FAILED' and p_event_type = 'WORKFLOW_RESTARTED' then 'ACTIVE'
    else null
  end into v_next_state;

  if v_next_state is null then
    raise exception 'lifecycle transition not allowed: % + %', v_current_state, p_event_type
      using errcode = '22023';
  end if;

  begin
    insert into public.control_plane_events (
      event_id, tenant_id, event_type, idempotency_key, sequence,
      actor_type, actor_id, correlation_id, causation_id, schema_version,
      payload, occurred_at
    ) values (
      p_event_id, p_tenant_id, p_event_type, p_idempotency_key, p_next_sequence,
      p_actor_type, p_actor_id, p_correlation_id, p_causation_id, p_schema_version,
      p_payload, p_occurred_at
    )
    returning event_id into v_inserted_event_id;
  exception when unique_violation then
    select e.event_id into v_inserted_event_id
      from public.control_plane_events e
     where e.tenant_id = p_tenant_id
       and e.idempotency_key = p_idempotency_key
     limit 1;
    if v_inserted_event_id is null then
      raise;
    end if;
    v_duplicate := true;
  end;

  if v_duplicate then
    if v_inserted_event_id <> p_event_id then
      raise exception 'idempotency key already belongs to a different event id'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'event_id', v_inserted_event_id,
      'tenant_id', p_tenant_id,
      'state', v_current_state,
      'version', v_current_version
    );
  end if;

  if v_current_version = 0 and v_current_state = 'LEAD' then
    insert into public.customer_lifecycle_state (
      tenant_id, state, version, last_event_id, last_event_at, updated_at
    ) values (
      p_tenant_id, v_next_state, 1, p_event_id, p_occurred_at, now()
    )
    on conflict (tenant_id) do nothing;

    if not exists (
      select 1 from public.customer_lifecycle_state
       where tenant_id = p_tenant_id
         and version = 1
         and last_event_id = p_event_id
    ) then
      raise exception 'optimistic concurrency conflict creating lifecycle state'
        using errcode = '40001';
    end if;
  else
    update public.customer_lifecycle_state
       set state = v_next_state,
           version = v_current_version + 1,
           last_event_id = p_event_id,
           last_event_at = p_occurred_at,
           updated_at = now()
     where tenant_id = p_tenant_id
       and version = v_current_version;

    get diagnostics v_updated = row_count;

    if v_updated <> 1 then
      raise exception 'optimistic concurrency conflict for tenant % at version %',
        p_tenant_id, v_current_version using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', p_event_id,
    'tenant_id', p_tenant_id,
    'from_state', v_current_state,
    'to_state', v_next_state,
    'version', v_current_version + 1
  );
end;
$$;

revoke all on function public.apply_lifecycle_event_atomic(
  uuid,uuid,text,text,bigint,bigint,text,uuid,uuid,uuid,text,jsonb,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_lifecycle_event_atomic(
  uuid,uuid,text,text,bigint,bigint,text,uuid,uuid,uuid,text,jsonb,timestamptz
) to service_role;

comment on function public.apply_lifecycle_event_atomic(
  uuid,uuid,text,text,bigint,bigint,text,uuid,uuid,uuid,text,jsonb,timestamptz
) is
  'Atomic Control Plane lifecycle transition with tenant/idempotency uniqueness and optimistic compare-and-swap versioning. TEST-only until dedicated evidence passes.';
