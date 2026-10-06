import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("canonical queue/DLQ migration is present and RPC contract is enforced", async()=>{
  const s=await fs.readFile("supabase/migrations/202610040003_diagnosis_queue_retry_dlq.sql","utf8");
  assert.match(s,/diagnosis_dead_letters/);
  assert.match(s,/claim_diagnosis_jobs/);
  assert.match(s,/fail_diagnosis_job/);
  assert.match(s,/complete_diagnosis_job/);
  assert.match(s,/for update skip locked/i);
  assert.match(s,/security definer/i);
  assert.match(s,/grant execute .*service_role/i);
  assert.match(s,/least\(3600/);
  assert.match(s,/on conflict \(tenant_id, job_id\) do nothing/i);
});
test("worker delegates claim/failure transitions to canonical RPCs", async()=>{
  const s=await fs.readFile("phase2/queue-worker/worker.mjs","utf8");
  assert.match(s,/claim_diagnosis_jobs/);
  assert.match(s,/fail_diagnosis_job/);
  assert.doesNotMatch(s,/status='PENDING'/);
  assert.doesNotMatch(s,/status='PROCESSING'/);
});
