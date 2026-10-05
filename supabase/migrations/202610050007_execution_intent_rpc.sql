-- AIMPACT Consistency Hardening V1 / Phase B
-- TEST-only: create execution intent RPC only.
create or replace function public.create_execution_intent_atomic(
  p_intent_id uuid,
  p_tenant_id uuid,
  p_event_id uuid,
  p_action text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id uuid default null,
  p_causation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
  v_status text;
begin
  if p_intent_id is null
     or p_tenant_id is null
     or p_action is null
     or p_idempotency_key is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid execution intent parameters' using errcode='22023';
  end if;

  select intent_id, status
    into v_existing, v_status
    from public.control_plane_execution_outbox
   where tenant_id = p_tenant_id
     and idempotency_key = p_idempotency_key
   limit 1;

  if v_existing is not null then
    if v_existing <> p_intent_id then
      raise exception 'execution intent idempotency conflict'
        using errcode='23505';
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'intent_id', v_existing,
      'status', v_status
    );
  end if;

  insert into public.control_plane_execution_outbox (
    intent_id,
    tenant_id,
    event_id,
    action,
    idempotency_key,
    payload,
    correlation_id,
    causation_id
  ) values (
    p_intent_id,
    p_tenant_id,
    p_event_id,
    p_action,
    p_idempotency_key,
    p_payload,
    p_correlation_id,
    p_causation_id
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'intent_id', p_intent_id,
    'status', 'PENDING'
  );

exception
  when unique_violation then
    select intent_id, status
      into v_existing, v_status
      from public.control_plane_execution_outbox
     where tenant_id = p_tenant_id
       and idempotency_key = p_idempotency_key
     limit 1;

    if v_existing = p_intent_id then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'intent_id', v_existing,
        'status', v_status
      );
    end if;

    raise;
end;
$$;

revoke all on function public.create_execution_intent_atomic(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.create_execution_intent_atomic(
  uuid, uuid, uuid, text, text, jsonb, uuid, uuid
) to service_role;
