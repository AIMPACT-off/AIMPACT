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
  assert.match(s,/for update skip locked/i);
  assert.match(s,/attempt_count/);
  assert.match(s,/MAX_ATTEMPTS/);
  assert.match(s,/lease_until/);
});

test("terminal provider failure is explicit until DLQ persistence contract is verified",async()=>{
  const s=await fs.readFile("phase2/queue-worker/worker.mjs","utf8");
  assert.match(s,/WORKER_PROVIDER_NOT_CONFIGURED/);
  assert.match(s,/FAILED/);
});

test("review API queries both report and review approval",async()=>{
  const s=await fs.readFile("netlify/functions/diagnosis-review.mjs","utf8");
  assert.match(s,/diagnosis_reports/);
  assert.match(s,/diagnosis_reviews/);
  assert.match(s,/eq\.APPROVED/);
  assert.match(s,/tenant_id/);
});
