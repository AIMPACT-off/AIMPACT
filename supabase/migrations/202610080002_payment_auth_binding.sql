alter table public.payment_entitlements
  add column if not exists auth_user_id uuid;

create index if not exists payment_entitlements_auth_user_id_idx
  on public.payment_entitlements(auth_user_id);

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
  p_metadata jsonb default '{}'::jsonb,
  p_auth_user_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.payment_entitlements(
    stripe_event_id, checkout_session_id, payment_link_id, product_key,
    status, amount, currency, customer_email, customer_name,
    stripe_customer_id, paid_at, metadata, auth_user_id
  )
  values (
    p_stripe_event_id, p_checkout_session_id, p_payment_link_id, 'AI_QUICK_AUDIT',
    'paid', p_amount, upper(p_currency), p_customer_email, p_customer_name,
    p_customer_id, p_paid_at, coalesce(p_metadata, '{}'::jsonb), p_auth_user_id
  )
  on conflict (stripe_event_id) do nothing;
  return true;
end $$;

revoke all on function public.aimpact_record_verified_payment(text,text,text,integer,text,text,text,text,timestamptz,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.aimpact_record_verified_payment(text,text,text,integer,text,text,text,text,timestamptz,jsonb,uuid)
  to service_role;
