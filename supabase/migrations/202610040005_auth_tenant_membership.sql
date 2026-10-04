-- AIMPACT Auth -> Tenant Membership v1
-- Additive, fail-closed access model. Membership writes are server-controlled;
-- authenticated users can only read their own active membership records.
-- Apply only in a disposable TEST project until runtime JWT/RLS tests pass.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);

create index if not exists tenant_memberships_user_active_idx
  on public.tenant_memberships (user_id, tenant_id)
  where status = 'active';

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;

revoke all on public.tenants, public.tenant_memberships from public, anon, authenticated;
grant select on public.tenants, public.tenant_memberships to authenticated;
grant all on public.tenants, public.tenant_memberships to service_role;

create or replace function public.is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

revoke all on function public.is_active_tenant_member(uuid) from public, anon;
grant execute on function public.is_active_tenant_member(uuid) to authenticated, service_role;

create or replace function public.can_read_approved_diagnosis_report(
  p_tenant_id uuid,
  p_report_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    public.is_active_tenant_member(p_tenant_id)
    and exists (
      select 1
      from public.diagnosis_reports r
      join lateral (
        select rv.decision
        from public.diagnosis_reviews rv
        where rv.tenant_id = r.tenant_id
          and rv.report_id = r.id
        order by rv.created_at desc, rv.id desc
        limit 1
      ) latest on true
      where r.tenant_id = p_tenant_id
        and r.id = p_report_id
        and r.report_status = 'APPROVED'
        and latest.decision = 'APPROVED'
    );
$$;

revoke all on function public.can_read_approved_diagnosis_report(uuid,uuid)
  from public, anon;
grant execute on function public.can_read_approved_diagnosis_report(uuid,uuid)
  to authenticated, service_role;

drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants
  for select to authenticated
  using (public.is_active_tenant_member(id));

drop policy if exists tenant_memberships_self_read on public.tenant_memberships;
create policy tenant_memberships_self_read on public.tenant_memberships
  for select to authenticated
  using (user_id = auth.uid() and status = 'active');

drop policy if exists diagnosis_reports_approved_member_read on public.diagnosis_reports;
create policy diagnosis_reports_approved_member_read on public.diagnosis_reports
  for select to authenticated
  using (public.can_read_approved_diagnosis_report(tenant_id, id));

-- No authenticated INSERT/UPDATE/DELETE is granted on membership or diagnosis
-- tables. Provisioning, invitations, role changes and review writes remain
-- trusted-server operations until their own audited APIs are implemented.
