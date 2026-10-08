-- Canonical native-store entitlement ledger.
create table if not exists public.store_entitlements (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  tenant_id uuid references public.tenant_profiles(tenant_id),
  platform text not null check (platform in ('ios','android')),
  product_id text not null,
  transaction_id text not null,
  order_id text,
  status text not null default 'active' check (status in ('active','revoked','pending')),
  purchased_at timestamptz,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(platform, transaction_id)
);
create index if not exists store_entitlements_auth_user_idx
  on public.store_entitlements(auth_user_id);
create index if not exists store_entitlements_product_idx
  on public.store_entitlements(product_id, status);

alter table public.store_entitlements enable row level security;
revoke all on public.store_entitlements from anon, authenticated;
grant select, insert, update on public.store_entitlements to service_role;
