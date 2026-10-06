-- AIMPACT Consistency Hardening V1 / Phase D-2
-- TEST-only: Retry failed execution intents with bounded exponential backoff.
create or replace function public.retry_execution_intent_atomic(
  p_intent_id uuid,
  p_max_attempts integer default 3,
  p_backoff_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.control_plane_execution_outbox%rowtype;
  v_next_status text;
  v_next_available_at timestamptz;
  v_delay_seconds integer;
begin
  if p_intent_id is null then
    raise exception using errcode = '22023', message = 'intent_id is required';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using errcode = '22023', message = 'max_attempts must be between 1 and 100';
  end if;
  if p_backoff_seconds < 1 or p_backoff_seconds > 86400 then
    raise exception using errcode = '22023', message = 'backoff_seconds must be between 1 and 86400';
  end if;

  select *
    into v_row
    from public.control_plane_execution_outbox
   where intent_id = p_intent_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'execution intent not found';
  end if;

  if v_row.status = 'PENDING' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'intent_id', v_row.intent_id,
      'status', v_row.status,
      'attempt', v_row.attempt,
      'available_at', v_row.available_at
    );
  end if;

  if v_row.status = 'FAILED' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'intent_id', v_row.intent_id,
      'status', v_row.status,
      'attempt', v_row.attempt,
      'available_at', v_row.available_at
    );
  end if;

  if v_row.status <> 'CLAIMED' then
    raise exception using errcode = '55000',
      message = format('execution intent must be CLAIMED before retry; current status=%s', v_row.status);
  end if;

  if v_row.attempt >= p_max_attempts then
    update public.control_plane_execution_outbox
       set status = 'FAILED',
           claimed_at = null,
           claimed_by = null,
           last_error_code = coalesce(last_error_code, 'RETRY_EXHAUSTED'),
           last_error_message = coalesce(last_error_message, 'maximum retry attempts reached'),
           updated_at = now()
     where intent_id = p_intent_id
     returning * into v_row;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'retry_exhausted', true,
      'intent_id', v_row.intent_id,
      'status', v_row.status,
      'attempt', v_row.attempt
    );
  end if;

  v_delay_seconds := p_backoff_seconds * greatest(1, power(2, v_row.attempt - 1)::integer);
  v_next_available_at := now() + make_interval(secs => v_delay_seconds);

  update public.control_plane_execution_outbox
     set status = 'PENDING',
         available_at = v_next_available_at,
         claimed_at = null,
         claimed_by = null,
         last_error_code = coalesce(last_error_code, 'ACTION_FAILED'),
         updated_at = now()
   where intent_id = p_intent_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'retry_exhausted', false,
    'intent_id', v_row.intent_id,
    'status', v_row.status,
    'attempt', v_row.attempt,
    'available_at', v_row.available_at,
    'backoff_seconds', v_delay_seconds
  );
end;
$$;

revoke all on function public.retry_execution_intent_atomic(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.retry_execution_intent_atomic(uuid,integer,integer) to service_role;

comment on function public.retry_execution_intent_atomic(uuid,integer,integer) is
  'TEST-only Consistency Hardening V1 Phase D-2. Bounded retry with exponential backoff; DLQ/Circuit Breaker intentionally excluded.';
