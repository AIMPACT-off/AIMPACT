-- AIMPACT Autonomous Control Plane event/gate persistence v1
-- TEST-only additive persistence. Production remains FROZEN.

create table if not exists public.autonomous_system_events (
  event_id uuid primary key,
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  source text not null check (char_length(trim(source)) between 1 and 120),
  repository text,
  ref text,
  commit_sha text,
  correlation_id uuid not null,
  causation_id uuid,
  schema_version text not null default '1',
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, event_id)
);

create table if not exists public.autonomous_gate_state (
  gate_id text primary key,
  scope text not null default 'TEST' check (scope in ('TEST','PRODUCTION')),
  status text not null check (status in (
    'NOT_READY','READY','RUNNING','PASSED','BLOCKED','NOT_VERIFIED',
    'HUMAN_APPROVAL_REQUIRED','FROZEN'
  )),
  version bigint not null default 0 check (version >= 0),
  last_evidence_id text,
  readiness jsonb not null default '{}'::jsonb check (jsonb_typeof(readiness) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.autonomous_system_events enable row level security;
alter table public.autonomous_gate_state enable row level security;
revoke all on public.autonomous_system_events, public.autonomous_gate_state from public, anon, authenticated;
grant all on public.autonomous_system_events, public.autonomous_gate_state to service_role;

create or replace function public.record_autonomous_system_event_atomic(
  p_event_id uuid, p_event_type text, p_source text, p_repository text,
  p_ref text, p_commit_sha text, p_correlation_id uuid, p_causation_id uuid,
  p_schema_version text, p_payload jsonb, p_occurred_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_event_id is null or p_event_type is null or p_source is null
     or p_correlation_id is null or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid autonomous event parameters' using errcode='22023';
  end if;
  insert into public.autonomous_system_events
    (event_id,event_type,source,repository,ref,commit_sha,correlation_id,causation_id,schema_version,payload,occurred_at)
  values
    (p_event_id,p_event_type,p_source,p_repository,p_ref,p_commit_sha,p_correlation_id,p_causation_id,p_schema_version,p_payload,p_occurred_at)
  on conflict (event_id) do nothing;
  return jsonb_build_object(
    'ok', true,
    'duplicate', exists(select 1 from public.autonomous_system_events e where e.event_id=p_event_id and e.created_at < now()),
    'event_id', p_event_id
  );
end;
$$;

revoke all on function public.record_autonomous_system_event_atomic(uuid,text,text,text,text,text,uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.record_autonomous_system_event_atomic(uuid,text,text,text,text,text,uuid,uuid,text,jsonb,timestamptz) to service_role;

create or replace function public.set_autonomous_gate_state_atomic(
  p_gate_id text, p_scope text, p_status text, p_expected_version bigint,
  p_last_evidence_id text, p_readiness jsonb
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_version bigint; v_status text;
begin
  if p_gate_id is null or p_scope not in ('TEST','PRODUCTION')
     or p_status not in ('NOT_READY','READY','RUNNING','PASSED','BLOCKED','NOT_VERIFIED','HUMAN_APPROVAL_REQUIRED','FROZEN')
     or p_expected_version < 0 or p_readiness is null or jsonb_typeof(p_readiness)<>'object' then
    raise exception 'invalid autonomous gate parameters' using errcode='22023';
  end if;
  select version,status into v_version,v_status from public.autonomous_gate_state where gate_id=p_gate_id for update;
  if v_version is null then
    if p_expected_version<>0 then raise exception 'autonomous gate version mismatch' using errcode='40001'; end if;
    insert into public.autonomous_gate_state(gate_id,scope,status,version,last_evidence_id,readiness)
    values(p_gate_id,p_scope,p_status,1,p_last_evidence_id,p_readiness);
    return jsonb_build_object('ok',true,'duplicate',false,'version',1,'status',p_status);
  end if;
  if v_version<>p_expected_version then raise exception 'autonomous gate version mismatch: expected %, actual %',p_expected_version,v_version using errcode='40001'; end if;
  update public.autonomous_gate_state
     set scope=p_scope,status=p_status,version=v_version+1,last_evidence_id=p_last_evidence_id,readiness=p_readiness,updated_at=now()
   where gate_id=p_gate_id and version=v_version;
  if not found then raise exception 'autonomous gate concurrency conflict' using errcode='40001'; end if;
  return jsonb_build_object('ok',true,'duplicate',false,'version',v_version+1,'status',p_status);
end;
$$;

revoke all on function public.set_autonomous_gate_state_atomic(text,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_autonomous_gate_state_atomic(text,text,text,bigint,text,jsonb) to service_role;

comment on table public.autonomous_system_events is 'TEST-only autonomous event ingestion evidence. Production remains FROZEN.';
comment on table public.autonomous_gate_state is 'TEST-only autonomous gate projection. Production remains FROZEN.';
