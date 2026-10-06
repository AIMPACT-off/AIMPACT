-- AIMPACT Consistency Hardening V1 / Phase C
-- TEST-only: claim/lease RPC only.
create or replace function public.claim_execution_intent_atomic(
  p_tenant_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.control_plane_execution_outbox%rowtype;
begin
  if p_tenant_id is null or p_worker_id is null or char_length(trim(p_worker_id)) < 1
     or p_lease_seconds < 1 or p_lease_seconds > 86400 then
    raise exception 'invalid execution claim parameters' using errcode='22023';
  end if;

  select *
    into v_row
    from public.control_plane_execution_outbox
   where tenant_id = p_tenant_id
     and (
       (status = 'PENDING' and available_at <= now())
       or
       (status = 'CLAIMED' and claimed_at is not null
        and claimed_at <= now() - make_interval(secs => p_lease_seconds))
     )
   order by available_at asc, created_at asc, intent_id asc
   for update skip locked
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'claimed', false);
  end if;

  update public.control_plane_execution_outbox
     set status = 'CLAIMED',
         claimed_at = now(),
         claimed_by = trim(p_worker_id),
         attempt = attempt + 1,
         updated_at = now()
   where intent_id = v_row.intent_id
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'intent_id', v_row.intent_id,
    'tenant_id', v_row.tenant_id,
    'event_id', v_row.event_id,
    'action', v_row.action,
    'idempotency_key', v_row.idempotency_key,
    'payload', v_row.payload,
    'status', v_row.status,
    'attempt', v_row.attempt,
    'claimed_by', v_row.claimed_by,
    'claimed_at', v_row.claimed_at,
    'available_at', v_row.available_at,
    'correlation_id', v_row.correlation_id,
    'causation_id', v_row.causation_id
  );
end;
$$;

revoke all on function public.claim_execution_intent_atomic(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.claim_execution_intent_atomic(uuid, text, integer)
  to service_role;
