-- AIMPACT AI diagnosis data contract v1
-- REVIEW ONLY. Do not apply to production until tenant identity/membership model,
-- disposable-project tests, and migration review are complete.
-- Fail-closed default: browser roles receive no table privileges. Server-side
-- service_role is the only initial worker path and bypasses RLS by design.

create table if not exists public.diagnosis_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  schema_version text not null,
  raw_answers jsonb not null check (jsonb_typeof(raw_answers) = 'object'),
  consent_notice_version text not null,
  consented_at timestamptz not null,
  submitted_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, id)
);

create table if not exists public.diagnosis_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  submission_id uuid not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  last_error_detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, submission_id),
  unique (tenant_id, id),
  foreign key (tenant_id, submission_id)
    references public.diagnosis_submissions (tenant_id, id) on delete cascade
);

create index if not exists diagnosis_jobs_queue_idx
  on public.diagnosis_jobs (status, available_at, created_at);

create table if not exists public.diagnosis_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_id uuid not null,
  model_provider text not null,
  model_name text not null,
  prompt_version text not null,
  output_schema_version text not null,
  problem_statement text not null,
  problem_category text not null,
  solution_candidates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(solution_candidates) = 'array'),
  workflow_recommendation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(workflow_recommendation) = 'object'),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  risk_flags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(risk_flags) = 'array'),
  report_status text not null default 'PENDING_REVIEW'
    check (report_status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_id),
  foreign key (tenant_id, job_id)
    references public.diagnosis_jobs (tenant_id, id) on delete cascade
);

create table if not exists public.diagnosis_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_id uuid not null,
  reviewer_id uuid not null,
  decision text not null
    check (decision in ('APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, report_id)
    references public.diagnosis_reports (tenant_id, id) on delete cascade
);

create index if not exists diagnosis_reports_tenant_created_idx
  on public.diagnosis_reports (tenant_id, created_at desc);
create index if not exists diagnosis_reviews_report_created_idx
  on public.diagnosis_reviews (tenant_id, report_id, created_at desc);

alter table public.diagnosis_submissions enable row level security;
alter table public.diagnosis_jobs enable row level security;
alter table public.diagnosis_reports enable row level security;
alter table public.diagnosis_reviews enable row level security;

revoke all on public.diagnosis_submissions, public.diagnosis_jobs,
  public.diagnosis_reports, public.diagnosis_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.diagnosis_submissions,
  public.diagnosis_jobs, public.diagnosis_reports, public.diagnosis_reviews to service_role;

comment on table public.diagnosis_submissions is
  'Immutable customer-provided diagnosis input; never overwrite with model output.';
comment on table public.diagnosis_jobs is
  'Async processing state and retry/error metadata. Claiming/locking protocol must be implemented by worker.';
comment on table public.diagnosis_reports is
  'Versioned AI output with evidence and confidence; remains pending human review by default.';
comment on table public.diagnosis_reviews is
  'Append-only human review decisions; enforce append-only behavior in a later hardened migration.';
