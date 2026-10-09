-- Server-authoritative Toss order/entitlement ledger for AI Quick Audit.
create table if not exists public.toss_payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  auth_user_id uuid not null,
  product_key text not null check (product_key = 'AI_QUICK_AUDIT'),
  amount integer not null check (amount = 200000),
  currency text not null check (currency = 'KRW'),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','failed')),
  payment_key text unique,
  customer_email text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint toss_paid_requires_payment_key check (status <> 'paid' or payment_key is not null)
);
create index if not exists toss_payment_orders_user_status_idx
  on public.toss_payment_orders(auth_user_id, status, product_key);
alter table public.toss_payment_orders enable row level security;
revoke all on public.toss_payment_orders from anon, authenticated;
grant select, insert, update on public.toss_payment_orders to service_role;
