import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTION_OUTBOX_STATUSES,
  createExecutionIntentRecord,
} from "../phase2/control-plane/execution-outbox.mjs";

test("execution outbox exposes explicit recovery states", () => {
  assert.deepEqual([...EXECUTION_OUTBOX_STATUSES], [
    "PENDING","CLAIMED","COMPLETED","FAILED","CANCELED"
  ]);
});

test("execution intent requires tenant, action, idempotency and intent identity", () => {
  assert.throws(() => createExecutionIntentRecord({}), /EXECUTION_INTENT_CONTEXT_REQUIRED/);
  assert.throws(() => createExecutionIntentRecord({
    tenantId:"tenant-a", action:"START_WORKFLOW", idempotencyKey:"key-123456"
  }), /EXECUTION_INTENT_ID_REQUIRED/);
});

test("execution intent starts recoverable and preserves causal context", () => {
  const record = createExecutionIntentRecord({
    intentId:"intent-1",
    tenantId:"tenant-a",
    eventId:"event-1",
    action:"START_WORKFLOW",
    idempotencyKey:"key-123456",
    payload:{workflow_id:"wf-1"},
    correlationId:"corr-1",
    causationId:"cause-1",
  });
  assert.equal(record.status, "PENDING");
  assert.equal(record.attempt, 0);
  assert.equal(record.payload.workflow_id, "wf-1");
  assert.equal(record.correlation_id, "corr-1");
  assert.equal(record.causation_id, "cause-1");
});
