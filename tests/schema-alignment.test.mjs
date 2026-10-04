import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("canonical diagnosis schema and worker state machine are aligned", async () => {
  const migration = await fs.readFile("supabase/migrations/202610040002_ai_diagnosis_data_contract.sql","utf8");
  const worker = await fs.readFile("phase2/queue-worker/worker.mjs","utf8");
  assert.match(migration,/status text not null default 'PENDING'/);
  assert.match(migration,/check \(status in \('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'\)\)/);
  assert.match(migration,/available_at timestamptz/);
  assert.match(migration,/locked_at timestamptz/);
  assert.match(migration,/last_error_code text/);
  assert.match(worker,/status='PENDING'/);
  assert.doesNotMatch(worker,/status in \('QUEUED','RETRY'\)/);
  assert.doesNotMatch(worker,/lease_until/);
  assert.match(worker,/last_error_code/);
});

test("diagnosis intake writes only canonical submission columns", async () => {
  const intake = await fs.readFile("netlify/functions/diagnosis-intake.mjs","utf8");
  assert.match(intake,/schema_version:body\.schema_version/);
  assert.match(intake,/raw_answers:body\.answers/);
  assert.match(intake,/consent_notice_version/);
  assert.match(intake,/submitted_by:ctx\.subject/);
  assert.doesNotMatch(intake,/problem_statement:/);
  assert.doesNotMatch(intake,/solution_candidates:/);
});
