-- AIMPACT Review-First Access Control v1
-- Depends on PR #21 diagnosis data-contract schema.
-- FAIL-CLOSED: no customer SELECT grant or policy is introduced here.
-- Canonical auth.uid() -> tenant membership mapping remains unverified.
-- Invoke only from a trusted server after authenticating reviewer permissions.
-- Never expose the service_role key or this RPC to a browser.

create or replace function public.record_diagnosis_review(
  p_tenant_id uuid,
  p_report_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_report_id uuid;
begin
  if p_tenant_id is null or p_report_id is null or p_reviewer_id is null then
    raise exception 'tenant, report and reviewer are required'
      using errcode = '22004';
  end if;

  if p_decision is null or p_decision not in
      ('APPROVED', 'REJECTED', 'REVISION_REQUESTED') then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 4000 then
    raise exception 'review notes exceed 4000 characters'
      using errcode = '22001';
  end if;

  select r.id into v_report_id
  from public.diagnosis_reports r
  where r.tenant_id = p_tenant_id
    and r.id = p_report_id
  for update;

  if v_report_id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  -- Both writes are part of this transaction: failure rolls back both.
  insert into public.diagnosis_reviews
    (tenant_id, report_id, reviewer_id, decision, notes)
  values
    (p_tenant_id, p_report_id, p_reviewer_id, p_decision, p_notes);

  update public.diagnosis_reports
  set report_status = p_decision,
      updated_at = pg_catalog.now()
  where tenant_id = p_tenant_id
    and id = p_report_id;
end;
$$;

revoke all on function public.record_diagnosis_review(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_diagnosis_review(uuid, uuid, uuid, text, text)
  to service_role;

-- Explicitly keep browser roles denied. Do not add customer SELECT until
-- tenant membership has been identified and tested in a disposable project.
revoke all on public.diagnosis_reports, public.diagnosis_reviews
  from public, anon, authenticated;
