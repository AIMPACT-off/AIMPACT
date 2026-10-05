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
  "supabase/migrations/202610040005_auth_tenant_membership.sql",
  "supabase/migrations/202610040006_tenant_bootstrap_atomic_intake.sql",
  "supabase/migrations/202610050003_control_plane_lifecycle.sql",
  "supabase/migrations/202610050004_action_execution_ledger.sql",
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
    "Membership schema/policies are created by migration 005, but authenticated JWT membership behavior is not proven by service-role fixture tests.",
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
    const child = spawn("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At", "-c", sql], {
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
const subDlq = "a1000000-0000-4000-8000-000000000013";
const jobRace = "a1000000-0000-4000-8000-000000000021";
const jobDlq = "a1000000-0000-4000-8000-000000000022";
const report = "a1000000-0000-4000-8000-000000000031";
let fixturesCreated = false;
try {
  psql("select current_database() || '|' || current_user", "database identity");
  psql(`
    insert into public.tenants (id,name,slug,created_by)
    values
      ('${A}','TEST Control Plane A','test-control-plane-a',null),
      ('${B}','TEST Control Plane B','test-control-plane-b',null)
    on conflict (id) do nothing;
  `, "control plane tenant fixtures");
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
  const membershipCatalog = psql(`
    select
      to_regclass('public.tenants') is not null,
      to_regclass('public.tenant_memberships') is not null,
      (select relrowsecurity from pg_class where oid='public.tenant_memberships'::regclass),
      has_table_privilege('authenticated','public.tenant_memberships','select'),
      has_table_privilege('authenticated','public.tenant_memberships','insert'),
      has_table_privilege('authenticated','public.diagnosis_reports','select'),
      has_function_privilege('authenticated','public.can_read_approved_diagnosis_report(uuid,uuid)','execute')
  `, "membership schema catalog check");
  assert(membershipCatalog === "t|t|t|t|f|t|t", "membership tables, RLS and restricted authenticated grants must exist");
  evidence.checks.membership_schema_and_report_policy = {
    status: "PASS",
    catalog: membershipCatalog,
    limitation: "Catalog/privilege structure only; no authenticated JWT subject membership test was run."
  };
  const rpcPrivileges = psql(`
    select
      has_function_privilege('authenticated','public.create_tenant_with_owner(text,text,uuid)','execute')::text || '|' ||
      has_function_privilege('service_role','public.create_tenant_with_owner(text,text,uuid)','execute')::text || '|' ||
      has_function_privilege('authenticated','public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamp with time zone,uuid)','execute')::text || '|' ||
      has_function_privilege('service_role','public.create_diagnosis_intake_atomic(uuid,text,text,jsonb,text,timestamp with time zone,uuid)','execute')::text
  `, "trusted RPC privilege check");
  assert(rpcPrivileges === "false|true|false|true", "bootstrap and atomic intake RPCs must be service_role-only");
  evidence.checks.trusted_rpc_privileges = { status: "PASS", catalog: rpcPrivileges };
  const atomicKey = "phase2-atomic-test-" + evidence.run_id;
  const atomicSql = `
    select
      (r->>'submission_id') || '|' || (r->>'job_id') || '|' || (r->>'duplicate')
    from (select public.create_diagnosis_intake_atomic(
      '${A}', '${atomicKey}', '1.0.0', '{"atomic_test":true}'::jsonb,
      'phase2-test-v1', now(), null
    ) as r) x
  `;
  const atomicFirst = psql(atomicSql, "atomic intake first call");
  const atomicSecond = psql(atomicSql, "atomic intake idempotent replay");
  const atomicParts = atomicFirst.split("|");
  assert(atomicParts.length === 3 && atomicParts[2] === "false", "first atomic intake call must create submission and job");
  assert(atomicSecond === atomicParts[0] + "|" + atomicParts[1] + "|true", "idempotent replay must return the same submission and job");
  const atomicCounts = psql(`
    select
      (select count(*) from public.diagnosis_submissions where tenant_id='${A}' and idempotency_key='${atomicKey}') || '|' ||
      (select count(*) from public.diagnosis_jobs where tenant_id='${A}' and submission_id='${atomicParts[0]}')
  `, "atomic intake row count");
  assert(atomicCounts === "1|1", "atomic intake must create exactly one submission and one queue job");
  evidence.checks.atomic_intake_idempotency = {
    status: "PASS",
    first_call: atomicFirst,
    replay: atomicSecond,
    submission_rows_and_job_rows: atomicCounts
  };
  const forcedAtomicKey = "phase2-atomic-rollback-" + evidence.run_id;
  psql("alter table public.diagnosis_jobs add constraint phase2_test_block_intake_job check (status <> 'PENDING') not valid", "install atomic intake rollback probe");
  const forcedAtomic = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `select public.create_diagnosis_intake_atomic('${A}','${forcedAtomicKey}','1.0.0','{"rollback_test":true}'::jsonb,'phase2-test-v1',now(),null)`], {encoding:"utf8"});
  psql("alter table public.diagnosis_jobs drop constraint phase2_test_block_intake_job", "remove atomic intake rollback probe");
  const forcedAtomicSqlstate = forcedAtomic.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(forcedAtomic.status !== 0 && forcedAtomicSqlstate === "23514", "forced queue-job constraint failure must abort atomic intake");
  const atomicRollbackCounts = psql(`
    select
      (select count(*) from public.diagnosis_submissions where tenant_id='${A}' and idempotency_key='${forcedAtomicKey}') || '|' ||
      (select count(*) from public.diagnosis_jobs j join public.diagnosis_submissions s on s.tenant_id=j.tenant_id and s.id=j.submission_id
       where s.tenant_id='${A}' and s.idempotency_key='${forcedAtomicKey}')
  `, "atomic intake rollback row count");
  assert(atomicRollbackCounts === "0|0", "failed queue-job insert must roll back the new diagnosis submission");
  evidence.checks.atomic_intake_failure_rollback = {
    status: "PASS",
    sqlstate: forcedAtomicSqlstate,
    submission_rows_and_job_rows_after_failure: atomicRollbackCounts
  };
  const mismatch = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `insert into public.diagnosis_jobs (tenant_id,submission_id) values ('${B}','${subA}')`], {encoding:"utf8"});
  const mismatchSqlstate = mismatch.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(mismatch.status !== 0 && mismatchSqlstate === "23503", "cross-tenant composite FK must reject with SQLSTATE 23503");
  evidence.checks.cross_tenant_fk_rejection = { status: "PASS", sqlstate: mismatchSqlstate };
  // Keep the concurrent-claim probe isolated to the single jobRace fixture.
  // The atomic-idempotency probe above intentionally created its own pending job.
  psql(`update public.diagnosis_jobs set status='COMPLETED', completed_at=clock_timestamp(), updated_at=clock_timestamp()
    where tenant_id='${A}' and id='${atomicParts[1]}' and status='PENDING'`, "isolate concurrent claim fixture");
  const claimSql = worker => `select id from public.claim_diagnosis_jobs('${worker}',1,300)`;
  const claims = await Promise.all([
    psqlAsync(claimSql("phase2-worker-A"), "worker A concurrent claim"),
    psqlAsync(claimSql("phase2-worker-B"), "worker B concurrent claim")
  ]);
  const winners = claims.filter(Boolean);
  assert(winners.length === 1 && winners[0] === jobRace, "exactly one of two workers must claim the same queued job");
  evidence.checks.concurrent_claim = { status: "PASS", worker_a_claim: claims[0] || null, worker_b_claim: claims[1] || null, claimed_job: winners[0] };
  psql(`insert into public.diagnosis_submissions
      (id,tenant_id,idempotency_key,schema_version,raw_answers,consent_notice_version,consented_at)
    values ('${subDlq}','${A}','phase2-test-dlq-0001','v1','{"dlq_test":true}','test-v1',now());
    insert into public.diagnosis_jobs (id,tenant_id,submission_id,max_attempts)
    values ('${jobDlq}','${A}','${subDlq}',1)`, "DLQ job fixture");
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

  const cpEvent1 = "a1000000-0000-4000-8000-000000000101";
  const cpEvent2 = "a1000000-0000-4000-8000-000000000102";
  const cpEvent3 = "a1000000-0000-4000-8000-000000000103";
  const cpKey1 = "cp-idem-" + evidence.run_id;
  const cpKey2 = "cp-race-a-" + evidence.run_id;
  const cpKey3 = "cp-race-b-" + evidence.run_id;
  const cpFirst = psql(`
    select public.apply_lifecycle_event_atomic(
      '${cpEvent1}','${A}','TENANT_CREATED','${cpKey1}',0,1,
      'system',null,null,null,'1','{"source":"phase2-test"}'::jsonb,now()
    )::text
  `, "control plane initial transition");
  const cpDuplicate = psql(`
    select public.apply_lifecycle_event_atomic(
      '${cpEvent1}','${A}','TENANT_CREATED','${cpKey1}',0,1,
      'system',null,null,null,'1','{"source":"phase2-test"}'::jsonb,now()
    )::text
  `, "control plane idempotent replay");
  assert(cpFirst.includes('"duplicate": false') && cpFirst.includes('"version": 1'), "initial lifecycle event must advance version to 1");
  assert(cpDuplicate.includes('"duplicate": true') && cpDuplicate.includes('"version": 1'), "lifecycle replay must be idempotent");
  evidence.checks.control_plane_idempotency = { status: "PASS", first: JSON.parse(cpFirst), replay: JSON.parse(cpDuplicate) };

  const staleCp = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `select public.apply_lifecycle_event_atomic('${cpEvent2}','${A}','DIAGNOSIS_SUBMITTED','${cpKey2}',0,2)`], {encoding:"utf8"});
  const staleCpSqlstate = staleCp.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(staleCp.status !== 0 && staleCpSqlstate === "40001", "stale lifecycle version must fail with SQLSTATE 40001");
  evidence.checks.control_plane_optimistic_lock = { status: "PASS", sqlstate: staleCpSqlstate };

  const raceResults = await Promise.allSettled([
    psqlAsync(`select public.apply_lifecycle_event_atomic('${cpEvent2}','${A}','DIAGNOSIS_SUBMITTED','${cpKey2}',1,2)`, "control plane race A"),
    psqlAsync(`select public.apply_lifecycle_event_atomic('${cpEvent3}','${A}','DIAGNOSIS_SUBMITTED','${cpKey3}',1,3)`, "control plane race B")
  ]);
  const racePassed = raceResults.filter(r => r.status === "fulfilled");
  const raceFailed = raceResults.filter(r => r.status === "rejected");
  const raceError = raceFailed.map(r => String(r.reason?.message || r.reason)).join("\n");
  assert(racePassed.length === 1 && raceFailed.length === 1 && /40001/.test(raceError),
    "concurrent lifecycle transitions with the same expected version must yield exactly one winner and one optimistic-lock conflict");
  const cpState = psql(`
    select state || '|' || version || '|' || last_event_id::text
      from public.customer_lifecycle_state
     where tenant_id='${A}'
  `, "control plane final state");
  assert(cpState.split("|")[0] === "DIAGNOSIS" && cpState.split("|")[1] === "2", "exactly one concurrent transition must advance lifecycle state");
  evidence.checks.control_plane_concurrency = {
    status: "PASS",
    winner_count: racePassed.length,
    conflict_count: raceFailed.length,
    conflict: raceError,
    final_state: cpState
  };
  const ledgerExecution1 = "a1000000-0000-4000-8000-000000000201";
  const ledgerExecution2 = "a1000000-0000-4000-8000-000000000202";
  const ledgerKey = "ledger-idem-" + evidence.run_id;
  const ledgerFailedKey = "ledger-failed-" + evidence.run_id;
  const ledgerEvent = cpEvent1;
  const ledgerFirst = psql(`
    select public.record_action_execution_atomic(
      '${ledgerExecution1}','${A}','${ledgerEvent}','START_WORKFLOW','EXECUTED','${ledgerKey}',
      1,'v1','{"result":"workflow-created"}'::jsonb,null,null,null,'${ledgerEvent}',now(),now()
    )::text
  `, "action ledger first execution");
  const ledgerDuplicate = psql(`
    select public.record_action_execution_atomic(
      '${ledgerExecution1}','${A}','${ledgerEvent}','START_WORKFLOW','EXECUTED','${ledgerKey}',
      1,'v1','{"result":"workflow-created"}'::jsonb,null,null,null,'${ledgerEvent}',now(),now()
    )::text
  `, "action ledger idempotent replay");
  const ledgerFirstJson = JSON.parse(ledgerFirst);
  assert(ledgerFirstJson.ok === true && ledgerFirstJson.duplicate === false && ledgerFirstJson.status === "EXECUTED",
    "first action ledger write must persist EXECUTED");
  const ledgerDuplicateJson = JSON.parse(ledgerDuplicate);
  assert(ledgerDuplicateJson.ok === true && ledgerDuplicateJson.duplicate === true && ledgerDuplicateJson.execution_id === ledgerExecution1,
    "same execution/idempotency replay must return duplicate without creating a second row");

  const ledgerConflict = spawnSync("psql", [dbUrl,"-X","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-c",
    `select public.record_action_execution_atomic(
      '${ledgerExecution2}','${A}','${ledgerEvent}','START_WORKFLOW','EXECUTED','${ledgerKey}',
      1,'v1','{"result":"conflict"}'::jsonb,null,null,null,'${ledgerEvent}',now(),now()
    )`], {encoding:"utf8"});
  const ledgerConflictSqlstate = ledgerConflict.stderr.match(/ERROR:\s+(\d{5}):/)?.[1];
  assert(ledgerConflict.status !== 0 && ledgerConflictSqlstate === "23505",
    "different execution id with same ledger idempotency key must fail with SQLSTATE 23505");

  const ledgerFailed = psql(`
    select public.record_action_execution_atomic(
      gen_random_uuid(),'${A}','${ledgerEvent}','START_WORKFLOW','FAILED','${ledgerFailedKey}',
      2,'v1','{"step":"payment"}'::jsonb,'TEST_FAILURE','fixture failure','${ledgerEvent}','${ledgerEvent}',now(),now()
    )::text
  `, "action ledger failed execution");
  const ledgerFailedJson = JSON.parse(ledgerFailed);
  assert(ledgerFailedJson.ok === true && ledgerFailedJson.duplicate === false && ledgerFailedJson.status === "FAILED",
    "failed action execution must persist FAILED evidence");
  const ledgerRows = psql(`
    select count(*)::text || '|' ||
           count(*) filter (where status='EXECUTED')::text || '|' ||
           count(*) filter (where status='FAILED')::text || '|' ||
           count(*) filter (where error_code='TEST_FAILURE')::text
      from public.control_plane_action_executions
     where tenant_id='${A}' and idempotency_key in ('${ledgerKey}','${ledgerFailedKey}')
  `, "action ledger evidence rows");
  assert(ledgerRows === "2|1|1|1", "ledger must contain exactly one EXECUTED and one FAILED evidence row");

  const ledgerBrowser = psql(`
    select
      has_table_privilege('anon','public.control_plane_action_executions','select')::text || '|' ||
      has_table_privilege('authenticated','public.control_plane_action_executions','select')::text || '|' ||
      has_function_privilege('authenticated','public.record_action_execution_atomic(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone)','execute')::text || '|' ||
      has_function_privilege('service_role','public.record_action_execution_atomic(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone)','execute')::text
  `, "action ledger privilege check");
  assert(ledgerBrowser === "false|true|false|true", "action ledger must be authenticated-read/service-role-write");

  evidence.checks.action_execution_ledger = {
    status: "PASS",
    first: JSON.parse(ledgerFirst),
    replay: JSON.parse(ledgerDuplicate),
    conflict_sqlstate: ledgerConflictSqlstate,
    failed: JSON.parse(ledgerFailed),
    rows: ledgerRows,
    browser_privileges: ledgerBrowser
  };
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
  evidence.checks.account_membership = "NOT_VERIFIED — migration 005 defines the Auth membership model, but authenticated JWT subject-to-tenant behavior has not been exercised against TEST";
  evidence.checks.real_api_auth = "NOT_VERIFIED — API probe tests HMAC tenant scoping only; real Supabase Auth JWT and membership enforcement remain untested";
  evidence.result = "PASS_FOR_DATABASE_CHECKS_WITH_EXPLICIT_AUTH_LIMITATIONS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  if (fixturesCreated) {
    try {
      psql(`delete from public.control_plane_action_executions where tenant_id in ('${A}','${B}');
        delete from public.diagnosis_dead_letters where tenant_id in ('${A}','${B}');
        delete from public.diagnosis_submissions where tenant_id in ('${A}','${B}');
        update public.customer_lifecycle_state set last_event_id=null where tenant_id in ('${A}','${B}');
        delete from public.control_plane_events where tenant_id in ('${A}','${B}');
        delete from public.customer_lifecycle_state where tenant_id in ('${A}','${B}');
        delete from public.tenants where id in ('${A}','${B}');`, "fixture cleanup");
      evidence.fixture_cleanup = "PASS";
    } catch (cleanupError) {
      evidence.fixture_cleanup = "FAILED: " + String(cleanupError.message || cleanupError);
      process.exitCode = 1;
    }
  }
  evidence.finished_at = new Date().toISOString();
  const out = path.join(evidenceDir, `phase2-test-${evidence.run_id}.json`);
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ result: evidence.result || "INCOMPLETE", error: evidence.error || null, evidence_file: out, checks: evidence.checks, fixture_cleanup: evidence.fixture_cleanup || null }, null, 2) + "\n");
}
