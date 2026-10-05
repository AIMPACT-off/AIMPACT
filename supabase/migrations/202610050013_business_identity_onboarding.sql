create extension if not exists pgcrypto;

create table if not exists public.tenant_business_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text not null,
  business_registration_number text not null,
  representative_name text not null,
  business_address text not null,
  website text,
  industry text,
  bank_name text not null,
  account_holder text not null,
  bank_account_last4 text not null check (bank_account_last4 ~ '^[0-9]{4}$'),
  bank_account_ciphertext text not null,
  certificate_path text,
  certificate_sha256 text,
  status text not null default 'SUBMITTED' check (status in ('DRAFT','SUBMITTED','VERIFIED','REJECTED')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_business_profiles_status_idx
  on public.tenant_business_profiles(status, submitted_at desc);

alter table public.tenant_business_profiles enable row level security;
revoke all on public.tenant_business_profiles from anon, authenticated;
grant select on public.tenant_business_profiles to authenticated;

drop policy if exists tenant_business_profiles_select_own on public.tenant_business_profiles;
create policy tenant_business_profiles_select_own
on public.tenant_business_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = tenant_business_profiles.tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
);

insert into storage.buckets (id, name, public)
values ('business-certificates','business-certificates',false)
on conflict (id) do update set public=false;

create or replace function public.upsert_business_profile_atomic(
  p_tenant_id uuid,
  p_legal_name text,
  p_business_registration_number text,
  p_representative_name text,
  p_business_address text,
  p_website text,
  p_industry text,
  p_bank_name text,
  p_account_holder text,
  p_bank_account_last4 text,
  p_bank_account_ciphertext text,
  p_certificate_path text,
  p_certificate_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_exists boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode='42501', message='SERVICE_ROLE_REQUIRED';
  end if;

  if p_tenant_id is null
     or nullif(trim(p_legal_name),'') is null
     or nullif(trim(p_business_registration_number),'') is null
     or nullif(trim(p_representative_name),'') is null
     or nullif(trim(p_business_address),'') is null
     or nullif(trim(p_bank_name),'') is null
     or nullif(trim(p_account_holder),'') is null
     or p_bank_account_last4 !~ '^[0-9]{4}$'
     or nullif(trim(p_bank_account_ciphertext),'') is null
  then
    raise exception using errcode='22023', message='INVALID_BUSINESS_PROFILE';
  end if;

  select exists(select 1 from public.tenants t where t.id=p_tenant_id) into v_exists;
  if not v_exists then
    raise exception using errcode='P0002', message='TENANT_NOT_FOUND';
  end if;

  insert into public.tenant_business_profiles(
    tenant_id, legal_name, business_registration_number, representative_name,
    business_address, website, industry, bank_name, account_holder,
    bank_account_last4, bank_account_ciphertext, certificate_path,
    certificate_sha256, status, submitted_at, updated_at
  )
  values(
    p_tenant_id, trim(p_legal_name), trim(p_business_registration_number),
    trim(p_representative_name), trim(p_business_address), nullif(trim(p_website),''),
    nullif(trim(p_industry),''), trim(p_bank_name), trim(p_account_holder),
    p_bank_account_last4, p_bank_account_ciphertext, nullif(trim(p_certificate_path),''),
    nullif(trim(p_certificate_sha256),''), 'SUBMITTED', now(), now()
  )
  on conflict (tenant_id) do update set
    legal_name=excluded.legal_name,
    business_registration_number=excluded.business_registration_number,
    representative_name=excluded.representative_name,
    business_address=excluded.business_address,
    website=excluded.website,
    industry=excluded.industry,
    bank_name=excluded.bank_name,
    account_holder=excluded.account_holder,
    bank_account_last4=excluded.bank_account_last4,
    bank_account_ciphertext=excluded.bank_account_ciphertext,
    certificate_path=excluded.certificate_path,
    certificate_sha256=excluded.certificate_sha256,
    status='SUBMITTED',
    submitted_at=now(),
    updated_at=now();

  return jsonb_build_object('ok',true,'tenant_id',p_tenant_id,'status','SUBMITTED');
end;
$function$;

revoke all on function public.upsert_business_profile_atomic(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.upsert_business_profile_atomic(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text
) to service_role;

comment on table public.tenant_business_profiles is
'Business identity and payout information. Bank account is stored only as server-encrypted ciphertext; certificate is stored in private storage.';
