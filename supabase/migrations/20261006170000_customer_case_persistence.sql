create extension if not exists pgcrypto;

create table if not exists public.aimpact_cases (
  case_id text primary key,
  lead_session_id text not null unique,
  company text not null,
  industry text,
  problem text not null,
  state text not null default 'DIAGNOSIS_READY',
  intake jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aimpact_diagnoses (
  case_id text primary key references public.aimpact_cases(case_id) on delete cascade,
  diagnosis jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.aimpact_action_plans (
  case_id text primary key references public.aimpact_cases(case_id) on delete cascade,
  action_plan jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.aimpact_payments (
  payment_key text primary key,
  order_id text not null unique,
  case_id text not null references public.aimpact_cases(case_id),
  amount integer not null,
  status text not null,
  toss_payment jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz not null default now()
);

alter table public.aimpact_cases enable row level security;
alter table public.aimpact_diagnoses enable row level security;
alter table public.aimpact_action_plans enable row level security;
alter table public.aimpact_payments enable row level security;

create or replace function public.create_business_xray_case(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id text := p->>'caseId';
begin
  if v_case_id is null or length(v_case_id) <> 24 then
    raise exception 'INVALID_CASE_ID';
  end if;

  insert into public.leads (
    email, company, problem, industry, company_size, current_tools,
    current_process, desired_automation, budget, source, consent,
    funnel_stage, next_action, session_id
  ) values (
    null,
    p->'input'->>'company',
    p->'input'->>'problem',
    p->'input'->>'industry',
    coalesce(p->'input'->>'team',''),
    coalesce(p->'input'->>'tools',''),
    coalesce(p->'input'->>'process',''),
    'Business X-Ray',
    'AI Quick Audit ₩200,000',
    'app-v1',
    true,
    'NEW',
    'Review X-Ray and sell Quick Audit',
    v_case_id
  );

  insert into public.aimpact_cases (
    case_id, lead_session_id, company, industry, problem, state, intake
  ) values (
    v_case_id,
    v_case_id,
    p->'input'->>'company',
    p->'input'->>'industry',
    p->'input'->>'problem',
    'DIAGNOSIS_READY',
    p->'input'
  );

  insert into public.aimpact_diagnoses (case_id, diagnosis)
  values (v_case_id, p->'diagnosis');

  insert into public.aimpact_action_plans (case_id, action_plan)
  values (v_case_id, p->'actionPlan');

  return jsonb_build_object('caseId', v_case_id, 'state', 'DIAGNOSIS_READY');
end;
$$;

create or replace function public.mark_quick_audit_paid(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id text := p->>'caseId';
  v_payment_key text := p->>'paymentKey';
  v_order_id text := p->>'orderId';
  v_amount integer := (p->>'amount')::integer;
begin
  if v_case_id is null or v_payment_key is null or v_order_id is null or v_amount <> 200000 then
    raise exception 'INVALID_PAYMENT_SYNC';
  end if;

  if not exists (select 1 from public.aimpact_cases where case_id = v_case_id) then
    raise exception 'CASE_NOT_FOUND';
  end if;

  insert into public.aimpact_payments (
    payment_key, order_id, case_id, amount, status, toss_payment
  ) values (
    v_payment_key, v_order_id, v_case_id, v_amount, 'PAID', coalesce(p->'payment','{}'::jsonb)
  )
  on conflict (payment_key) do update
    set status = 'PAID',
        toss_payment = excluded.toss_payment,
        confirmed_at = now();

  update public.aimpact_cases
  set state = 'PAID', updated_at = now()
  where case_id = v_case_id;

  update public.leads
  set funnel_stage = 'PAID',
      next_action = 'Deliver AI Quick Audit',
      source = 'app-v1-paid'
  where session_id = v_case_id;

  return jsonb_build_object('caseId', v_case_id, 'state', 'PAID');
end;
$$;

revoke all on function public.create_business_xray_case(jsonb) from public, anon, authenticated;
revoke all on function public.mark_quick_audit_paid(jsonb) from public, anon, authenticated;
grant execute on function public.create_business_xray_case(jsonb) to service_role;
grant execute on function public.mark_quick_audit_paid(jsonb) to service_role;
