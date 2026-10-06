create table if not exists public.payment_entitlements (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  checkout_session_id text not null unique,
  payment_link_id text not null,
  product_key text not null,
  status text not null check (status in ('paid','revoked')),
  amount integer not null,
  currency char(3) not null,
  customer_email text,
  customer_name text,
  stripe_customer_id text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payment_entitlements enable row level security;
revoke all on public.payment_entitlements from anon, authenticated;
grant select, insert on public.payment_entitlements to service_role;

create or replace function public.aimpact_record_verified_payment(
  p_stripe_event_id text,
  p_checkout_session_id text,
  p_payment_link_id text,
  p_amount integer,
  p_currency text,
  p_customer_email text default null,
  p_customer_name text default null,
  p_customer_id text default null,
  p_paid_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.payment_entitlements(
    stripe_event_id, checkout_session_id, payment_link_id, product_key,
    status, amount, currency, customer_email, customer_name,
    stripe_customer_id, paid_at, metadata
  )
  values (
    p_stripe_event_id, p_checkout_session_id, p_payment_link_id, 'AI_QUICK_AUDIT',
    'paid', p_amount, upper(p_currency), p_customer_email, p_customer_name,
    p_customer_id, p_paid_at, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_event_id) do nothing;
  return true;
end $$;

revoke all on function public.aimpact_record_verified_payment(text,text,text,integer,text,text,text,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.aimpact_record_verified_payment(text,text,text,integer,text,text,text,text,timestamptz,jsonb)
  to service_role;
