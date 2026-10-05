-- AIMPACT Consistency Hardening V1 / Phase D-1
-- TEST-only: Complete execution intent atomically after a successful CLAIMED action.
create or replace function public.complete_execution_intent_atomic(
  p_intent_id uuid,
  p_status text default 'COMPLETED',
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.control_plane_execution_outbox%rowtype;
begin
  if p_intent_id is null then
    raise exception using errcode = '22023', message = 'intent_id is required';
  end if;

  if upper(coalesce(trim(p_status), '')) <> 'COMPLETED' then
    raise exception using errcode = '22023', message = 'complete RPC only accepts COMPLETED status';
  end if;

  select *
    into v_row
    from public.control_plane_execution_outbox
   where intent_id = p_intent_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'execution intent not found';
  end if;

  if v_row.status = 'COMPLETED' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'intent_id', v_row.intent_id,
      'status', v_row.status,
      'attempt', v_row.attempt,
      'completed_at', v_row.completed_at
    );
  end if;

  if v_row.status <> 'CLAIMED' then
    raise exception using errcode = '55000',
      message = format('execution intent must be CLAIMED before completion; current status=%s', v_row.status);
  end if;

  update public.control_plane_execution_outbox
     set status = 'COMPLETED',
         completed_at = now(),
         last_error_code = null,
         last_error_message = null,
         updated_at = now()
   where intent_id = p_intent_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'intent_id', v_row.intent_id,
    'status', v_row.status,
    'attempt', v_row.attempt,
    'completed_at', v_row.completed_at
  );
end;
$$;

revoke all on function public.complete_execution_intent_atomic(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_execution_intent_atomic(uuid,text,text,text) to service_role;

comment on function public.complete_execution_intent_atomic(uuid,text,text,text) is
  'TEST-only Consistency Hardening V1 Phase D-1. Completes CLAIMED execution intents idempotently; retry/failure/DLQ are intentionally excluded.';
