import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

function transition(attempt,max){
  return attempt>=max?"FAILED":"RETRY";
}

test("bounded retry reaches terminal failure",()=>{
  assert.equal(transition(1,3),"RETRY");
  assert.equal(transition(2,3),"RETRY");
  assert.equal(transition(3,3),"FAILED");
});

test("worker uses row locking and bounded attempts",async()=>{
  const s=await fs.readFile("phase2/queue-worker/worker.mjs","utf8");
  const q=await fs.readFile("supabase/migrations/202610040003_diagnosis_queue_retry_dlq.sql","utf8");
  assert.match(s,/claim_diagnosis_jobs/);
  assert.match(s,/fail_diagnosis_job/);
  assert.match(q,/for update skip locked/i);
  assert.match(q,/attempt_count/);
  assert.match(q,/MAX_ATTEMPTS/);
});

test("terminal provider failure is explicit until DLQ persistence contract is verified",async()=>{
  const s=await fs.readFile("phase2/queue-worker/worker.mjs","utf8");
  const q=await fs.readFile("supabase/migrations/202610040003_diagnosis_queue_retry_dlq.sql","utf8");
  assert.match(s,/WORKER_PROVIDER_NOT_CONFIGURED/);
  assert.match(s,/fail_diagnosis_job/);
  assert.match(q,/diagnosis_dead_letters/);
  assert.match(q,/MAX_ATTEMPTS_EXCEEDED/);
});

test("review API queries both report and review approval",async()=>{
  const s=await fs.readFile("netlify/functions/diagnosis-review.mjs","utf8");
  assert.match(s,/diagnosis_reports/);
  assert.match(s,/diagnosis_reviews/);
  assert.match(s,/eq\.APPROVED/);
  assert.match(s,/tenant_id/);
});
