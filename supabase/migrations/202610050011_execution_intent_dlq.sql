create table if not exists public.control_plane_execution_dlq (
  dlq_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  intent_id uuid not null references public.control_plane_execution_outbox(intent_id) on delete cascade,
  action text not null,
  idempotency_key text not null,
  attempt integer not null check (attempt >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  error_code text,
  error_message text,
  correlation_id uuid,
  causation_id uuid,
  quarantined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, intent_id)
);

create index if not exists control_plane_execution_dlq_tenant_time_idx
  on public.control_plane_execution_dlq (tenant_id, quarantined_at desc);

alter table public.control_plane_execution_dlq enable row level security;

revoke all on public.control_plane_execution_dlq from public, anon;
grant select on public.control_plane_execution_dlq to authenticated;
grant all on public.control_plane_execution_dlq to service_role;

drop policy if exists control_plane_execution_dlq_member_read on public.control_plane_execution_dlq;
create policy control_plane_execution_dlq_member_read
  on public.control_plane_execution_dlq
  for select
  to authenticated
  using (public.is_active_tenant_member(tenant_id));

create or replace function public.quarantine_execution_intent_dlq_atomic(
  p_intent_id uuid,
  p_reason_code text default 'RETRY_EXHAUSTED',
  p_reason_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.control_plane_execution_outbox%rowtype;
  v_existing public.control_plane_execution_dlq%rowtype;
  v_dlq_id uuid;
begin
  if p_intent_id is null then
    raise exception using errcode = '22023', message = 'intent_id is required';
  end if;
  if p_reason_code is null or length(trim(p_reason_code)) = 0 or length(p_reason_code) > 120 then
    raise exception using errcode = '22023', message = 'invalid reason code';
  end if;

  select * into v_intent
    from public.control_plane_execution_outbox
   where intent_id = p_intent_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'execution intent not found';
  end if;

  select * into v_existing
    from public.control_plane_execution_dlq
   where tenant_id = v_intent.tenant_id
     and intent_id = p_intent_id
   for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'dlq_id', v_existing.dlq_id,
      'intent_id', p_intent_id,
      'status', 'DLQ'
    );
  end if;

  if v_intent.status <> 'FAILED' then
    raise exception using errcode = '55000',
      message = 'only FAILED execution intents may be quarantined to DLQ';
  end if;

  insert into public.control_plane_execution_dlq (
    tenant_id, intent_id, action, idempotency_key, attempt, payload,
    error_code, error_message, correlation_id, causation_id
  ) values (
    v_intent.tenant_id, v_intent.intent_id, v_intent.action, v_intent.idempotency_key,
    v_intent.attempt, v_intent.payload,
    coalesce(p_reason_code, v_intent.last_error_code),
    coalesce(p_reason_message, v_intent.last_error_message),
    v_intent.correlation_id, v_intent.causation_id
  )
  returning dlq_id into v_dlq_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'dlq_id', v_dlq_id,
    'intent_id', p_intent_id,
    'status', 'DLQ'
  );
exception
  when unique_violation then
    select * into v_existing
      from public.control_plane_execution_dlq
     where tenant_id = v_intent.tenant_id
       and intent_id = p_intent_id;
    if found then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'dlq_id', v_existing.dlq_id,
        'intent_id', p_intent_id,
        'status', 'DLQ'
      );
    end if;
    raise;
end;
$$;

revoke all on function public.quarantine_execution_intent_dlq_atomic(uuid,text,text) from public, anon, authenticated;
grant execute on function public.quarantine_execution_intent_dlq_atomic(uuid,text,text) to service_role;

comment on function public.quarantine_execution_intent_dlq_atomic(uuid,text,text)
  is 'TEST-only DLQ quarantine boundary; preserves FAILED outbox intent and records a durable manual-review snapshot.';
