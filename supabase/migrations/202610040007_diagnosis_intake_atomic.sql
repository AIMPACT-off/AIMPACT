-- Split from 202610040006 for statement-safe disposable migration execution.

create or replace function public.create_diagnosis_intake_atomic(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_schema_version text,
  p_raw_answers jsonb,
  p_consent_notice_version text,
  p_consented_at timestamptz,
  p_submitted_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_submission_id uuid;
  v_job_id uuid;
  v_duplicate boolean := false;
begin
  if p_tenant_id is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 200
     or p_schema_version is null
     or p_raw_answers is null
     or jsonb_typeof(p_raw_answers) <> 'object'
     or p_consent_notice_version is null
     or p_consented_at is null then
    raise exception 'invalid diagnosis intake parameters' using errcode = '22023';
  end if;

  insert into public.diagnosis_submissions (
    tenant_id, idempotency_key, schema_version, raw_answers,
    consent_notice_version, consented_at, submitted_by
  ) values (
    p_tenant_id, p_idempotency_key, p_schema_version, p_raw_answers,
    p_consent_notice_version, p_consented_at, p_submitted_by
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_submission_id;

  if v_submission_id is null then
    v_duplicate := true;
    select s.id into v_submission_id
      from public.diagnosis_submissions s
     where s.tenant_id = p_tenant_id
       and s.idempotency_key = p_idempotency_key
     for update;
    if v_submission_id is null then
      raise exception 'idempotent submission could not be resolved';
    end if;
  end if;

  insert into public.diagnosis_jobs (tenant_id, submission_id)
  values (p_tenant_id, v_submission_id)
  on conflict (tenant_id, submission_id) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select j.id into v_job_id
      from public.diagnosis_jobs j
     where j.tenant_id = p_tenant_id
       and j.submission_id = v_submission_id
     for update;
  end if;

  if v_job_id is null then
    raise exception 'atomic diagnosis job could not be resolved';
  end if;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'job_id', v_job_id,
    'duplicate', v_duplicate,
    'queued', true
  );
end;
$$;

revoke all on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid) to service_role;

comment on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid) is
  'Atomically inserts/recovers one idempotent diagnosis submission and its queue job; service_role only.';
