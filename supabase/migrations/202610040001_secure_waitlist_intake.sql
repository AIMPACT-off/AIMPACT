-- AIMPACT secure waitlist intake (review and apply only after Supabase project is verified).
-- The Netlify function uses the service role for a narrow INSERT/RPC path. Service role
-- bypasses RLS by design; therefore browser roles receive no table access and the
-- server function must remain the only public write path. Never expose the service key.

create table if not exists public.waitlist_submissions (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(company_name) between 1 and 160),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  work_email text not null check (char_length(work_email) between 3 and 320),
  company_website text,
  business_problem text not null check (char_length(business_problem) between 1 and 4000),
  preferred_channel text not null default 'Email',
  consent boolean not null check (consent is true),
  consent_notice_version text not null,
  consented_at timestamptz not null,
  requester_ip_hash text not null,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '6 months')
);

alter table public.waitlist_submissions enable row level security;
revoke all on table public.waitlist_submissions from anon, authenticated;
grant insert on table public.waitlist_submissions to service_role;

create table if not exists public.waitlist_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);
alter table public.waitlist_rate_limits enable row level security;
revoke all on table public.waitlist_rate_limits from anon, authenticated;
revoke all on table public.waitlist_rate_limits from public;

create or replace function public.consume_waitlist_rate_limit(
  p_key_hash text,
  p_window_seconds integer default 3600,
  p_max_requests integer default 5
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_row public.waitlist_rate_limits%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_window_seconds < 1 or p_window_seconds > 86400
     or p_max_requests < 1 or p_max_requests > 100 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.waitlist_rate_limits(key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, current_time, 1, current_time)
  on conflict (key_hash) do nothing;

  select * into current_row
  from public.waitlist_rate_limits
  where key_hash = p_key_hash
  for update;

  if current_time >= current_row.window_started_at + make_interval(secs => p_window_seconds) then
    update public.waitlist_rate_limits
    set window_started_at = current_time, request_count = 1, updated_at = current_time
    where key_hash = p_key_hash;
    return true;
  end if;

  if current_row.request_count >= p_max_requests then
    return false;
  end if;

  update public.waitlist_rate_limits
  set request_count = request_count + 1, updated_at = current_time
  where key_hash = p_key_hash;
  return true;
end;
$$;

revoke all on function public.consume_waitlist_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_waitlist_rate_limit(text, integer, integer) to service_role;

comment on table public.waitlist_submissions is
  'Private AIMPACT waitlist requests. No anon/authenticated grants; server-side intake only.';
