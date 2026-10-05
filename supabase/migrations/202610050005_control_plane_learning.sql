-- TEST-only Control Plane learning/correlation evidence store.
create table if not exists public.control_plane_learning_signals (
  signal_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  execution_id uuid references public.control_plane_action_executions(execution_id) on delete set null,
  event_id uuid references public.control_plane_events(event_id) on delete set null,
  signal_type text not null check (signal_type in ('ACTION_OUTCOME','ACTION_FAILURE','ACTION_REPLAY','POLICY_BLOCK')),
  outcome text not null check (outcome in ('POSITIVE','NEGATIVE','DUPLICATE','BLOCKED')),
  features jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  causation_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, execution_id, signal_type)
);
create index if not exists control_plane_learning_signals_tenant_created_idx
  on public.control_plane_learning_signals(tenant_id, created_at desc);
create index if not exists control_plane_learning_signals_event_idx
  on public.control_plane_learning_signals(tenant_id, event_id);

alter table public.control_plane_learning_signals enable row level security;
revoke all on public.control_plane_learning_signals from public, anon;
grant select on public.control_plane_learning_signals to authenticated;
grant all on public.control_plane_learning_signals to service_role;

drop policy if exists control_plane_learning_member_read on public.control_plane_learning_signals;
create policy control_plane_learning_member_read
on public.control_plane_learning_signals
for select to authenticated
using (public.is_active_tenant_member(tenant_id));

create or replace function public.record_learning_signal_atomic(
  p_signal_id uuid,
  p_tenant_id uuid,
  p_execution_id uuid,
  p_event_id uuid,
  p_signal_type text,
  p_outcome text,
  p_features jsonb,
  p_correlation_id uuid,
  p_causation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.control_plane_learning_signals;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='service_role required';
  end if;
  if p_signal_id is null or p_tenant_id is null or p_signal_type is null or p_outcome is null then
    raise exception using errcode='22023', message='signal identity is required';
  end if;
  select * into existing
    from public.control_plane_learning_signals
   where tenant_id=p_tenant_id
     and execution_id is not distinct from p_execution_id
     and signal_type=p_signal_type
   limit 1;
  if existing.signal_id is not null then
    if existing.signal_id=p_signal_id then
      return jsonb_build_object('ok',true,'duplicate',true,'signal_id',existing.signal_id);
    end if;
    raise exception using errcode='23505', message='learning signal idempotency conflict';
  end if;
  insert into public.control_plane_learning_signals(
    signal_id,tenant_id,execution_id,event_id,signal_type,outcome,features,correlation_id,causation_id
  ) values (
    p_signal_id,p_tenant_id,p_execution_id,p_event_id,p_signal_type,p_outcome,
    coalesce(p_features,'{}'::jsonb),p_correlation_id,p_causation_id
  );
  return jsonb_build_object('ok',true,'duplicate',false,'signal_id',p_signal_id,'outcome',p_outcome);
end;
$$;
revoke execute on function public.record_learning_signal_atomic(uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.record_learning_signal_atomic(uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid)
  to service_role;
