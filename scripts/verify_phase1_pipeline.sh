#!/usr/bin/env bash
set -euo pipefail

# AIMPACT Phase 1 TEST verification harness
# Fail-closed: refuses production-looking database URLs and never enables intake.
#
# Required:
#   TEST_DATABASE_URL   PostgreSQL connection string for the disposable TEST DB
# Optional:
#   TEST_API_URL        Public test/preview base URL (defaults to https://aimpact-ai.netlify.app)
#   TEST_ORIGIN         Origin header for the intake request
#   TEST_SERVICE_KEY    Supabase service-role key for the API test
#
# This harness does NOT set WAITLIST_INTAKE_ENABLED and does NOT deploy/merge.

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
: "${TEST_SERVICE_KEY:?TEST_SERVICE_KEY is required (presence check only)}"
: "${TEST_API_URL:?TEST_API_URL is required (TEST/staging only)}"

case "${TEST_DATABASE_URL}" in
  *aimpact-ai.netlify.app*|*prod*|*production*)
    echo "BLOCKED: database URL looks like production." >&2
    exit 20
    ;;
esac

command -v psql >/dev/null || { echo "BLOCKED: psql is required." >&2; exit 21; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration_19="${repo_root}/supabase/migrations/202610040001_secure_waitlist_intake.sql"
migration_21="${repo_root}/supabase/migrations/202610040002_ai_diagnosis_data_contract.sql"

test -f "${migration_19}" || { echo "BLOCKED: missing PR #19 migration: ${migration_19}" >&2; exit 22; }
test -f "${migration_21}" || { echo "BLOCKED: missing PR #21 migration: ${migration_21}" >&2; exit 23; }

echo "[1/6] Applying exact repository migrations to TEST DB"
psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration_19}"
psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration_21}"

echo "[2/6] Verifying required tables, RLS and browser-role grants"
psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'waitlist_submissions','waitlist_rate_limits',
    'diagnosis_submissions','diagnosis_jobs',
    'diagnosis_reports','diagnosis_reviews'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'MISSING TABLE: %', t;
    END IF;
  END LOOP;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.waitlist_submissions'::regclass) THEN
    RAISE EXCEPTION 'RLS NOT ENABLED: waitlist_submissions';
  END IF;

  IF has_table_privilege('anon', 'public.waitlist_submissions', 'SELECT')
     OR has_table_privilege('anon', 'public.waitlist_submissions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.waitlist_submissions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.waitlist_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'SECURITY FAIL: browser-role table privilege exists';
  END IF;

  RAISE NOTICE 'PASS: required tables/RLS/browser grants verified';
END $$;
SQL

echo "[3/6] Verifying actual anon-role SELECT denial (expected SQLSTATE 42501)"
psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.waitlist_submissions LIMIT 1;
    RAISE EXCEPTION 'SECURITY FAIL: anon SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon SELECT denied with SQLSTATE 42501';
  END;
END $$;
ROLLBACK;
SQL

echo "[4/6] Verifying service_role INSERT grant exists"
psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $
BEGIN
  IF NOT has_table_privilege('service_role', 'public.waitlist_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'SECURITY FAIL: service_role INSERT grant missing';
  END IF;
END $;
SQL

if [[ -n "${TEST_SERVICE_KEY:-}" ]]; then
  base="${TEST_API_URL}"
  origin="${TEST_ORIGIN:-https://aimpact-ai.netlify.app}"
  email="phase1-verification-$(date +%s)@example.invalid"

  echo "[5/6] Calling intake endpoint and capturing HTTP evidence"
  response_file="$(mktemp)"
  trap 'rm -f "${response_file}"' EXIT

  http_code="$(curl -sS -o "${response_file}" -w '%{http_code}' \
    -X POST "${base%/}/.netlify/functions/waitlist-intake" \
    -H "Origin: ${origin}" \
    -H 'Content-Type: application/json' \
    --data-binary "{
      \"company\":\"AIMPACT TEST ONLY\",
      \"name\":\"Phase1 Verification\",
      \"email\":\"${email}\",
      \"website\":\"\",
      \"problem\":\"Automated TEST verification only. Do not treat as a customer lead.\",
      \"channel\":\"Email\",
      \"consent\":true,
      \"notice_version\":\"2026-10-04\"
    }")"

  echo "HTTP_STATUS=${http_code}"
  cat "${response_file}"
  echo

  [[ "${http_code}" == "202" ]] || {
    echo "FAIL: expected HTTP 202." >&2
    exit 30
  }

  echo "[6/6] Querying the inserted TEST record"
  record_count="$(psql "${TEST_DATABASE_URL}" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.waitlist_submissions WHERE work_email = '${email}';")"
  [[ "${record_count}" == "1" ]] || { echo "FAIL: expected exactly one TEST DB record; got ${record_count}." >&2; exit 31; }
  psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -c \
    "SELECT id, company_name, contact_name, work_email, consent, consent_notice_version, created_at FROM public.waitlist_submissions WHERE work_email = '${email}' ORDER BY created_at DESC LIMIT 1;"
fi

echo "RESULT: FULL TEST PIPELINE VERIFIED."
echo "WAITLIST_INTAKE_ENABLED was NOT changed."
