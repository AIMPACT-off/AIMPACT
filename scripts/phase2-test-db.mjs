#!/usr/bin/env node
/**
 * Phase 2 disposable TEST database integration runner.
 * No production endpoint is called. Requires explicit disposable-DB acknowledgement.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const required = ["TEST_DATABASE_URL", "TEST_DB_DISPOSABLE"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`FAIL-CLOSED: ${key} is required`);
}
if (process.env.TEST_DB_DISPOSABLE !== "YES") {
  throw new Error("FAIL-CLOSED: set TEST_DB_DISPOSABLE=YES only for a disposable TEST database");
}
const dbUrl = process.env.TEST_DATABASE_URL;
const parsed = new URL(dbUrl);
const target = `${parsed.hostname}/${parsed.pathname}`;
if (/(prod|production|live)/i.test(target)) {
  throw new Error("FAIL-CLOSED: database host/path looks production-like; refusing to connect");
}
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error("FAIL-CLOSED: TEST_DATABASE_URL must use postgres protocol");
}
const migrations = [
  "supabase/migrations/202610040002_ai_diagnosis_data_contract.sql",
  "supabase/migrations/202610040003_diagnosis_queue_retry_dlq.sql",
  "supabase/migrations/202610040004_review_first_access_control.sql",
];
for (const file of migrations) {
  if (!fs.existsSync(file)) throw new Error(`FAIL-CLOSED: missing migration ${file}`);
}
const evidenceDir = process.env.TEST_EVIDENCE_DIR || "artifacts/phase2-test-evidence";
fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  run_id: crypto.randomUUID(),
  started_at: new Date().toISOString(),
  target_host: parsed.hostname,
  target_database: parsed.pathname.replace(/^\//, ""),
  migrations: [],
  checks: {},
  limitations: [
    "HMAC tenant-context issuance is not proof of authenticated account membership.",
    "No tenant membership table/policy is defined by the current canonical migrations.",
    "API identity/authorization checks require a real staging API and authenticated user JWTs; they are not inferred from service-role DB tests."
  ]
};
function psql(sql, label) {
  const r = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" }
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const safe = (r.stderr || r.stdout || "psql failed").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]");
    throw new Error(`${label} failed (exit ${r.status}): ${safe}`);
  }
  return r.stdout.trim();
}
function psqlAsync(sql, label) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) :
      reject(new Error(`${label} failed (exit ${code}): ${stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")}`)));
  });
}
function assert(condition, message) {
  if (!condition) throw new Error("ASSERTION FAILED: " + message);
}
const A = "a1000000-0000-4000-8000-000000000001";
const B = "b2000000-0000-4000-8000-000000000002";
const reviewer = "c3000000-0000-4000-8000-000000000003";
const subA = "a1000000-0000-4000-8000-000000000011";
const subB = "b2000000-0000-4000-8000-000000000012";
const jobRace = "a1000000-0000-4000-8000-000000000021";
const jobDlq = "a1000000-0000-4000-8000-000000000022";
const report = "a1000000-0000-4000-8000-000000000031";
let fixturesCreated = false;
try {
  psql("select current_database() || '|' || current_user", "database identity");
  for (const file of migrations) {
    const applied = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", file], {
      encoding: "utf8", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "" }
    });
    if (applied.error) throw applied.error;
    if (applied.status !== 0) {
      throw new Error(`migration ${file} failed (exit ${applied.status}): ${(applied.stderr || "").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")}`);
    }
    evidence.migrations.push({ file, applied: true });
  }
  const identity = psql("select current_database() || '|' || current_user", "database identity");
  evidence.database_identity = identity;
  psql(`
    insert into public.diagnosis_submissions
      (id,tenant_id,idempotency_key,schema_version,raw_answers,consent_notice_version,consented_at)
    values
      ('${subA}','${A}','phase2-test-tenant-a-0001','v1','{"test":true}','test-v1',now()),
      ('${subB}','${B}','phase2-test-tenant-b-0001','v1','{"test":true}','test-v1',now());
    insert into public.diagnosis_jobs (id,tenant_id,submission_id,max_attempts)
    values ('${jobRace}','${A}','${subA}',3);
    insert into public.diagnosis_reports
      (id,tenant_id,job_id,model_provider,model_name,prompt_version,output_schema_version,
       problem_statement,problem_category,confidence)
    values ('${report}','${A}','${jobRace}','test','fixture','test-v1','v1',
       'TEST fixture only','TEST',0.5);
  `, "tenant fixtures");
  fixturesCreated = true;
  evidence.checks.migrations_and_fixtures = "PASS";
  const fk = psql(`
    select count(*) from pg_constraint
    where conname in ('diagnosis_jobs_tenant_id_submission_id_fkey',
                      'diagnosis_reports_tenant_id_job_id_fkey')
  `, "composite tenant FK check");
  assert(Number(fk) >= 2, "composite tenant foreign keys must exist");
  const browser = psql(`
    select
      has_table_privilege('anon','public.diagnosis_reports','select')::text || '|' ||
      has_table_privilege('authenticated','public.diagnosis_reviews','select')::text || '|' ||
      has_function_privilege('anon','public.record_diagnosis_review(uuid,uuid,uuid,text,text)','execute')::text
  `, "browser privilege check");
  assert(browser === "false|false|false", "browser roles must not read reports/reviews or execute review RPC");
  evidence.checks.tenant_fk_and_browser_denial = "PASS";
  const mismatch = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `insert into public.diagnosis_jobs (tenant_id,submission_id) values ('${B}','${subA}')`], {encoding:"utf8"});
  const mismatchSqlstate = mismatch.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(mismatch.status !== 0 && mismatchSqlstate === "23503", "cross-tenant composite FK must reject with SQLSTATE 23503");
  evidence.checks.cross_tenant_fk_rejection = { status: "PASS", sqlstate: mismatchSqlstate };
  const claimSql = worker => `select id from public.claim_diagnosis_jobs('${worker}',1,300)`;
  const claims = await Promise.all([
    psqlAsync(claimSql("phase2-worker-A"), "worker A concurrent claim"),
    psqlAsync(claimSql("phase2-worker-B"), "worker B concurrent claim")
  ]);
  const winners = claims.filter(Boolean);
  assert(winners.length === 1 && winners[0] === jobRace, "exactly one of two workers must claim the same queued job");
  evidence.checks.concurrent_claim = { status: "PASS", worker_a_claim: claims[0] || null, worker_b_claim: claims[1] || null, claimed_job: winners[0] };
  psql(`insert into public.diagnosis_jobs (id,tenant_id,submission_id,max_attempts)
    values ('${jobDlq}','${A}','${subA}',1)`, "DLQ job fixture");
  const dlqClaim = psql(`select id from public.claim_diagnosis_jobs('phase2-dlq-worker',1,300)`, "claim DLQ fixture");
  assert(dlqClaim === jobDlq, "DLQ fixture must be claimed by its worker before failure");
  const failResult = psql(`
    select (public.fail_diagnosis_job(
      '${A}','${jobDlq}','phase2-dlq-worker','TEST_MAX_ATTEMPTS','forced terminal failure', '{"summary":"fixture"}'
    )).status
  `, "terminal retry failure");
  const dlqCount = psql(`select count(*) from public.diagnosis_dead_letters where tenant_id='${A}' and job_id='${jobDlq}'`, "DLQ row check");
  assert(failResult === "FAILED" && dlqCount === "1", "max-attempt failure must mark job FAILED and create exactly one DLQ row");
  evidence.checks.retry_and_dlq = { status: "PASS", terminal_job_status: failResult, dead_letter_rows: Number(dlqCount) };
  psql(`select public.record_diagnosis_review('${A}','${report}','${reviewer}','REJECTED','first decision')`, "first review");
  psql(`select public.record_diagnosis_review('${A}','${report}','${reviewer}','APPROVED','latest decision')`, "latest review");
  psql("select pg_sleep(0.02)", "separate review timestamps");
  const latest = psql(`
    select rv.decision || '|' || rp.report_status
    from public.diagnosis_reports rp
    join lateral (select decision from public.diagnosis_reviews
      where tenant_id=rp.tenant_id and report_id=rp.id order by created_at desc,id desc limit 1) rv on true
    where rp.tenant_id='${A}' and rp.id='${report}'
  `, "latest review check");
  assert(latest === "APPROVED|APPROVED", "latest approval and report status must agree");
  const beforeRollback = psql(`select count(*) from public.diagnosis_reviews where tenant_id='${A}' and report_id='${report}'`, "review count before rollback");
  psql(`
    begin;
      select public.record_diagnosis_review('${A}','${report}','${reviewer}','REJECTED','rollback proof');
    rollback;
  `, "review transaction rollback");
  const afterRollback = psql(`select count(*) from public.diagnosis_reviews where tenant_id='${A}' and report_id='${report}'`, "review count after rollback");
  const statusAfterRollback = psql(`select report_status from public.diagnosis_reports where tenant_id='${A}' and id='${report}'`, "report status after rollback");
  assert(beforeRollback === afterRollback && statusAfterRollback === "APPROVED", "review history and report status must both roll back together");
  evidence.checks.review_atomicity_and_latest_decision = {
    status: "PASS", latest_review_and_report: latest,
    review_count_before_rollback: Number(beforeRollback), review_count_after_rollback: Number(afterRollback),
    report_status_after_rollback: statusAfterRollback
  };
  // A constraint failure after the review INSERT must roll back that INSERT as well.
  psql("alter table public.diagnosis_reports add constraint phase2_test_block_approved check (report_status <> 'APPROVED') not valid", "install temporary rollback probe");
  const beforeFailure = psql(`select count(*) from public.diagnosis_reviews where tenant_id='${A}' and report_id='${report}'`, "review count before forced failure");
  const forced = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `select public.record_diagnosis_review('${A}','${report}','${reviewer}','APPROVED','forced constraint failure')`], {encoding:"utf8"});
  psql("alter table public.diagnosis_reports drop constraint phase2_test_block_approved", "remove temporary rollback probe");
  const forcedSqlstate = forced.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(forced.status !== 0 && forcedSqlstate === "23514", "forced report update must fail with SQLSTATE 23514");
  const afterFailure = psql(`select count(*) from public.diagnosis_reviews where tenant_id='${A}' and report_id='${report}'`, "review count after forced failure");
  const statusAfterFailure = psql(`select report_status from public.diagnosis_reports where tenant_id='${A}' and id='${report}'`, "report status after forced failure");
  assert(beforeFailure === afterFailure && statusAfterFailure === "APPROVED", "failed report update must roll back inserted review row");
  evidence.checks.review_failure_rollback = { status: "PASS", sqlstate: forcedSqlstate, review_rows_before: Number(beforeFailure), review_rows_after: Number(afterFailure), report_status: statusAfterFailure };
  evidence.db_rows = {
    job: psql(`select to_jsonb(j)::text from public.diagnosis_jobs j where id in ('${jobRace}','${jobDlq}') order by id`, 'evidence job rows'),
    dead_letters: psql(`select to_jsonb(d)::text from public.diagnosis_dead_letters d where job_id='${jobDlq}'`, 'evidence DLQ row'),
    report: psql(`select to_jsonb(r)::text from public.diagnosis_reports r where id='${report}'`, 'evidence report row'),
    reviews: psql(`select coalesce(json_agg(to_jsonb(v) order by created_at,id),'[]'::json)::text from public.diagnosis_reviews v where report_id='${report}'`, 'evidence review rows')
  };
  if (process.env.TEST_API_URL && process.env.TENANT_CONTEXT_HMAC_SECRET) {
    const apiEvidenceFile = path.join(evidenceDir, "phase2-api-" + evidence.run_id + ".json");
    const apiRun = spawnSync(process.execPath, ["scripts/phase2-test-api.mjs"], {
      encoding: "utf8",
      env: { ...process.env, TEST_DB_DISPOSABLE: "YES", TEST_TENANT_A_ID: A, TEST_TENANT_B_ID: B, TEST_REPORT_ID: report, TEST_API_EVIDENCE_FILE: apiEvidenceFile }
    });
    if (apiRun.error) throw apiRun.error;
    let apiResult;
    try { apiResult = JSON.parse(apiRun.stdout); } catch { throw new Error("API evidence probe returned invalid JSON: " + (apiRun.stderr || "")); }
    evidence.api_requests = apiResult.requests;
    evidence.api_evidence_file = apiResult.evidence_file;
    evidence.checks.api_tenant_scope = apiResult.result;
    if (apiRun.status !== 0) throw new Error("TEST API probe failed: " + (apiResult.result || "unknown"));
  } else {
    evidence.checks.api_tenant_scope = "NOT_RUN — set TEST_API_URL and TENANT_CONTEXT_HMAC_SECRET for TEST/staging API probe";
  }
  evidence.checks.account_membership = "NOT_VERIFIED — signed HMAC subject is synthetic and no authenticated user-to-tenant membership lookup exists";
  evidence.checks.real_api_auth = "NOT_VERIFIED — API probe tests HMAC tenant scoping only, not real account membership";
  evidence.result = "PASS_FOR_DATABASE_CHECKS_WITH_EXPLICIT_AUTH_LIMITATIONS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  if (fixturesCreated) {
    try {
      psql(`delete from public.diagnosis_dead_letters where tenant_id in ('${A}','${B}');
        delete from public.diagnosis_submissions where tenant_id in ('${A}','${B}');`, "fixture cleanup");
      evidence.fixture_cleanup = "PASS";
    } catch (cleanupError) {
      evidence.fixture_cleanup = "FAILED: " + String(cleanupError.message || cleanupError);
      process.exitCode = 1;
    }
  }
  evidence.finished_at = new Date().toISOString();
  const out = path.join(evidenceDir, `phase2-test-${evidence.run_id}.json`);
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ result: evidence.result || "INCOMPLETE", evidence_file: out, checks: evidence.checks }, null, 2) + "\n");
}
