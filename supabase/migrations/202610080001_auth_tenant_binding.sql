-- AIMPACT canonical Auth UID -> tenant binding.
-- Customer-facing access remains fail-closed until Supabase Auth is configured.
create table if not exists public.tenant_profiles (
  tenant_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  company_name text,
  primary_email text,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_profiles_auth_user_id_idx
  on public.tenant_profiles(auth_user_id);

alter table public.tenant_profiles enable row level security;
revoke all on public.tenant_profiles from anon, authenticated;
grant select, insert, update on public.tenant_profiles to service_role;

create or replace function public.aimpact_get_or_create_tenant(
  p_auth_user_id uuid,
  p_company_name text default null,
  p_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant_id uuid;
begin
  if p_auth_user_id is null then raise exception 'auth user id required'; end if;

  select tenant_id into v_tenant_id
  from public.tenant_profiles
  where auth_user_id = p_auth_user_id;

  if v_tenant_id is null then
    insert into public.tenant_profiles(auth_user_id, company_name, primary_email)
    values (p_auth_user_id, nullif(trim(p_company_name), ''), nullif(lower(trim(p_email)), ''))
    returning tenant_id into v_tenant_id;
  else
    update public.tenant_profiles
    set company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
        primary_email = coalesce(nullif(lower(trim(p_email)), ''), primary_email),
        updated_at = now()
    where tenant_id = v_tenant_id;
  end if;

  return v_tenant_id;
end $$;

revoke all on function public.aimpact_get_or_create_tenant(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.aimpact_get_or_create_tenant(uuid,text,text) to service_role;
