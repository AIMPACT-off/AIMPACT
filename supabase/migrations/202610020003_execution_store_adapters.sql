create table if not exists public.aimpact_execution_locks (
  lock_key text primary key,
  owner_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.aimpact_idempotency (
  idempotency_key text primary key,
  context_hash text not null,
  state text not null check (state in ('RUNNING','COMPLETED')),
  result jsonb,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.aimpact_execution_locks enable row level security;
alter table public.aimpact_idempotency enable row level security;
revoke all on public.aimpact_execution_locks, public.aimpact_idempotency from anon, authenticated;
grant select, insert, update, delete on public.aimpact_execution_locks, public.aimpact_idempotency to service_role;

create or replace function public.aimpact_claim_execution_lock(p_lock_key text, p_owner uuid, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$$
declare affected integer;
begin
  if p_ttl_seconds < 1 or p_ttl_seconds > 300 then raise exception 'invalid lock ttl'; end if;
  insert into public.aimpact_execution_locks(lock_key, owner_id, expires_at)
  values (p_lock_key, p_owner, now() + make_interval(secs => p_ttl_seconds))
  on conflict (lock_key) do update set owner_id = excluded.owner_id, expires_at = excluded.expires_at, created_at = now()
  where public.aimpact_execution_locks.expires_at < now();
  get diagnostics affected = row_count;
  return affected > 0;
end $$;

create or replace function public.aimpact_renew_execution_lock(p_lock_key text, p_owner uuid, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if p_ttl_seconds < 1 or p_ttl_seconds > 300 then raise exception 'invalid lock ttl'; end if;
  update public.aimpact_execution_locks
  set expires_at = now() + make_interval(secs => p_ttl_seconds)
  where lock_key = p_lock_key and owner_id = p_owner and expires_at > now();
  get diagnostics affected = row_count;
  return affected > 0;
end $$;

create or replace function public.aimpact_release_execution_lock(p_lock_key text, p_owner uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$$
declare affected integer;
begin
  update public.aimpact_execution_locks set expires_at = now() where lock_key = p_lock_key and owner_id = p_owner;
  get diagnostics affected = row_count;
  return affected > 0;
end $$;

create or replace function public.aimpact_claim_idempotency(p_idempotency_key text, p_context_hash text, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$$
declare affected integer;
begin
  if p_ttl_seconds < 1 or p_ttl_seconds > 604800 then raise exception 'invalid idempotency ttl'; end if;
  insert into public.aimpact_idempotency(idempotency_key, context_hash, state, expires_at)
  values (p_idempotency_key, p_context_hash, 'RUNNING', now() + make_interval(secs => p_ttl_seconds))
  on conflict (idempotency_key) do update set context_hash = excluded.context_hash, state = 'RUNNING', result = null,
    expires_at = excluded.expires_at, updated_at = now()
  where public.aimpact_idempotency.expires_at < now();
  get diagnostics affected = row_count;
  return affected > 0;
end $$;

create or replace function public.aimpact_read_idempotency(p_idempotency_key text)
returns jsonb language sql security definer set search_path = public, pg_temp as $$$
  select jsonb_build_object('contextHash', context_hash, 'state', state, 'result', result)
  from public.aimpact_idempotency where idempotency_key = p_idempotency_key and expires_at > now()
$$;

create or replace function public.aimpact_complete_idempotency(p_idempotency_key text, p_context_hash text, p_result jsonb, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$$
declare affected integer;
begin
  update public.aimpact_idempotency set state = 'COMPLETED', result = p_result,
    expires_at = now() + make_interval(secs => p_ttl_seconds), updated_at = now()
  where idempotency_key = p_idempotency_key and context_hash = p_context_hash and expires_at > now();
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'idempotency claim missing or context mismatch'; end if;
  return true;
end $$;

create or replace function public.aimpact_release_idempotency(p_idempotency_key text, p_context_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  update public.aimpact_idempotency set expires_at = now(), updated_at = now()
  where idempotency_key = p_idempotency_key and context_hash = p_context_hash and state = 'RUNNING';
  get diagnostics affected = row_count;
  return affected > 0;
end $$;

revoke all on function public.aimpact_claim_execution_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.aimpact_release_execution_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.aimpact_claim_idempotency(text, text, integer) from public, anon, authenticated;
revoke all on function public.aimpact_read_idempotency(text) from public, anon, authenticated;
revoke all on function public.aimpact_complete_idempotency(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.aimpact_claim_execution_lock(text, uuid, integer) to service_role;
grant execute on function public.aimpact_release_execution_lock(text, uuid) to service_role;
grant execute on function public.aimpact_claim_idempotency(text, text, integer) to service_role;
grant execute on function public.aimpact_read_idempotency(text) to service_role;
grant execute on function public.aimpact_complete_idempotency(text, text, jsonb, integer) to service_role;

revoke all on function public.aimpact_release_idempotency(text, text) from public, anon, authenticated;
grant execute on function public.aimpact_release_idempotency(text, text) to service_role;

revoke all on function public.aimpact_renew_execution_lock(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.aimpact_renew_execution_lock(text, uuid, integer) to service_role;
