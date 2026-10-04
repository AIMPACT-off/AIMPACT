-- AIMPACT trusted tenant provisioning + atomic diagnosis intake v1
-- All mutation RPCs are service_role-only. Callers must validate the end-user
-- Supabase JWT before supplying p_owner_user_id / p_tenant_id.
-- Additive; do not apply to production before dedicated TEST evidence + approval.

create or replace function public.create_tenant_with_owner(
  p_name text,
  p_slug text,
  p_owner_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_created boolean := false;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160
     or p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or p_owner_user_id is null then
    raise exception 'invalid tenant bootstrap parameters' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), p_slug, p_owner_user_id)
  on conflict (slug) do nothing
  returning id into v_tenant_id;

  if v_tenant_id is not null then
    v_created := true;
  else
    select t.id into v_tenant_id
      from public.tenants t
     where t.slug = p_slug
       and t.created_by = p_owner_user_id
     for update;
    if v_tenant_id is null then
      raise exception 'tenant slug already exists or owner mismatch' using errcode = '23505';
    end if;
    if not exists (
      select 1 from public.tenant_memberships m
       where m.tenant_id = v_tenant_id
         and m.user_id = p_owner_user_id
         and m.role = 'owner'
         and m.status = 'active'
    ) then
      raise exception 'existing tenant has no matching active owner' using errcode = '42501';
    end if;
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, p_owner_user_id, 'owner', 'active')
  on conflict (tenant_id, user_id) do nothing;

  if not exists (
    select 1 from public.tenant_memberships m
     where m.tenant_id = v_tenant_id
       and m.user_id = p_owner_user_id
       and m.role = 'owner'
       and m.status = 'active'
  ) then
    raise exception 'owner membership conflict' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'owner_user_id', p_owner_user_id,
    'created', v_created
  );
end;
$$;

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
as $$
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

revoke all on function public.create_tenant_with_owner(text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.create_tenant_with_owner(text,text,uuid) to service_role;
grant execute on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid) to service_role;

comment on function public.create_tenant_with_owner(text,text,uuid) is
  'Atomic trusted-server tenant bootstrap. Caller MUST validate the Supabase Auth JWT and derive owner user id from its verified subject.';
comment on function public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamptz,uuid) is
  'Atomically inserts/recovers one idempotent diagnosis submission and its queue job; service_role only.';
