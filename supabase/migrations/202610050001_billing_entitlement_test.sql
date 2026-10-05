-- AIMPACT Billing Entitlement v1
-- TEST-ONLY design artifact. Do not apply to production.
-- Stripe signature verification remains in the trusted webhook function.
-- This RPC accepts only already-verified, server-originated Stripe events.

create table if not exists public.billing_events (
  event_id text primary key check (char_length(trim(event_id)) between 10 and 255),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null check (char_length(trim(event_type)) between 3 and 120),
  event_status text not null check (event_status in ('PROCESSING','PROCESSED','IGNORED','FAILED')),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text check (plan is null or plan in ('START','GROWTH')),
  received_at timestamptz not null default now(),
  event_created_at timestamptz,
  processed_at timestamptz,
  error_code text,
  unique (tenant_id, event_id)
);

create index if not exists billing_events_tenant_created_idx
  on public.billing_events (tenant_id, received_at desc);

create table if not exists public.tenant_entitlements (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan text not null check (plan in ('START','GROWTH')),
  status text not null check (status in ('ACTIVE','PAST_DUE','CANCELED','INCOMPLETE','INACTIVE')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists tenant_entitlements_subscription_uq
  on public.tenant_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.billing_events enable row level security;
alter table public.tenant_entitlements enable row level security;

revoke all on public.billing_events, public.tenant_entitlements
  from public, anon, authenticated;
grant select on public.tenant_entitlements to authenticated;

drop policy if exists tenant_entitlements_member_read on public.tenant_entitlements;
create policy tenant_entitlements_member_read on public.tenant_entitlements
  for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create or replace function public.process_stripe_entitlement_event(
  p_event_id text,
  p_event_type text,
  p_tenant_id uuid,
  p_plan text,
  p_status text,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_event_created_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.billing_events%rowtype;
  v_entitlement public.tenant_entitlements%rowtype;
  v_latest_created timestamptz;
  v_status text;
begin
  if p_event_id is null or p_event_type is null or p_tenant_id is null
     or p_plan is null or p_status is null then
    raise exception 'billing event required' using errcode = '22023';
  end if;

  if p_plan not in ('START','GROWTH') then
    raise exception 'unsupported billing plan' using errcode = '22023';
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  select * into v_existing
    from public.billing_events
   where event_id = p_event_id
   for update;

  if v_existing.event_id is not null then
    return jsonb_build_object(
      'processed', false,
      'duplicate', true,
      'event_id', p_event_id,
      'tenant_id', v_existing.tenant_id
    );
  end if;

  v_status := case
    when p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded')
      and p_status = 'paid' then 'ACTIVE'
    when p_event_type = 'invoice.paid' then 'ACTIVE'
    when p_event_type = 'invoice.payment_failed' then 'PAST_DUE'
    when p_event_type = 'customer.subscription.deleted' then 'CANCELED'
    when p_event_type = 'customer.subscription.updated'
      and p_status in ('active','trialing') then 'ACTIVE'
    when p_event_type = 'customer.subscription.updated'
      and p_status = 'past_due' then 'PAST_DUE'
    when p_event_type = 'customer.subscription.updated'
      and p_status = 'canceled' then 'CANCELED'
    else null
  end;

  if v_status is null then
    insert into public.billing_events(
      event_id,tenant_id,event_type,event_status,stripe_customer_id,
      stripe_subscription_id,plan,event_created_at,processed_at
    ) values (
      p_event_id,p_tenant_id,p_event_type,'IGNORED',p_customer_id,
      p_subscription_id,p_plan,p_event_created_at,now()
    );
    return jsonb_build_object('processed',false,'ignored',true,'event_id',p_event_id);
  end if;

  insert into public.billing_events(
    event_id,tenant_id,event_type,event_status,stripe_customer_id,
    stripe_subscription_id,plan,event_created_at
  ) values (
    p_event_id,p_tenant_id,p_event_type,'PROCESSING',p_customer_id,
    p_subscription_id,p_plan,p_event_created_at
  );

  insert into public.tenant_entitlements(
    tenant_id,plan,status,stripe_customer_id,stripe_subscription_id,updated_at
  ) values (
    p_tenant_id,p_plan,v_status,p_customer_id,p_subscription_id,now()
  )
  on conflict (tenant_id) do update set
    plan=excluded.plan,
    status=excluded.status,
    stripe_customer_id=coalesce(excluded.stripe_customer_id,public.tenant_entitlements.stripe_customer_id),
    stripe_subscription_id=coalesce(excluded.stripe_subscription_id,public.tenant_entitlements.stripe_subscription_id),
    updated_at=now();

  update public.billing_events
     set event_status='PROCESSED', processed_at=now()
   where event_id=p_event_id;

  select * into v_entitlement from public.tenant_entitlements where tenant_id=p_tenant_id;

  return jsonb_build_object(
    'processed',true,
    'duplicate',false,
    'event_id',p_event_id,
    'tenant_id',p_tenant_id,
    'plan',v_entitlement.plan,
    'status',v_entitlement.status
  );
exception when others then
  update public.billing_events
     set event_status='FAILED', error_code=sqlstate, processed_at=now()
   where event_id=p_event_id;
  raise;
end;
$$;

revoke all on function public.process_stripe_entitlement_event(
  text,text,uuid,text,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.process_stripe_entitlement_event(
  text,text,uuid,text,text,text,text,timestamptz
) to service_role;

comment on table public.billing_events is
  'Idempotent audit ledger for trusted, Stripe-signature-verified webhook events.';
comment on table public.tenant_entitlements is
  'One current billing entitlement per AIMPACT tenant; tenant_id is the isolation boundary.';
comment on function public.process_stripe_entitlement_event(text,text,uuid,text,text,text,text,timestamptz) is
  'Trusted server-only entitlement transition. Stripe signature verification MUST occur before RPC invocation.';
