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
  v_existing public.aimpact_payments%rowtype;
begin
  if v_case_id is null
     or v_payment_key is null
     or v_order_id is null
     or v_amount <> 200000
     or v_order_id <> 'AIMPACT-QA-' || v_case_id then
    raise exception 'INVALID_PAYMENT_SYNC';
  end if;

  if not exists (
    select 1 from public.aimpact_cases where case_id = v_case_id
  ) then
    raise exception 'CASE_NOT_FOUND';
  end if;

  select * into v_existing
  from public.aimpact_payments
  where payment_key = v_payment_key;

  if found then
    if v_existing.order_id <> v_order_id
       or v_existing.case_id <> v_case_id
       or v_existing.amount <> v_amount then
      raise exception 'PAYMENT_KEY_MISMATCH';
    end if;

    update public.aimpact_payments
    set status = 'PAID',
        toss_payment = coalesce(p->'payment','{}'::jsonb),
        confirmed_at = now()
    where payment_key = v_payment_key;
  else
    insert into public.aimpact_payments (
      payment_key, order_id, case_id, amount, status, toss_payment
    ) values (
      v_payment_key, v_order_id, v_case_id, v_amount, 'PAID',
      coalesce(p->'payment','{}'::jsonb)
    );
  end if;

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

revoke all on function public.mark_quick_audit_paid(jsonb) from public, anon, authenticated;
grant execute on function public.mark_quick_audit_paid(jsonb) to service_role;
