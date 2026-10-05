import test from "node:test";
import assert from "node:assert/strict";
import { createActionExecutionRecord } from "../phase2/control-plane/action-execution-ledger.mjs";

test("ledger records successful execution", () => {
  const r = createActionExecutionRecord({
    tenantId: "tenant-a",
    eventId: "evt-1",
    action: "START_WORKFLOW",
    idempotencyKey: "action-idem-1",
    dispatch: { status: "EXECUTED", result: { workflow_id: "wf-1" } }
  });
  assert.equal(r.ok, true);
  assert.equal(r.execution.status, "EXECUTED");
  assert.equal(r.execution.result.result.workflow_id, "wf-1");
});

test("ledger preserves failed execution evidence", () => {
  const r = createActionExecutionRecord({
    tenantId: "tenant-a",
    action: "START_WORKFLOW",
    idempotencyKey: "action-idem-2",
    dispatch: { status: "FAILED", code: "ACTION_EXECUTION_FAILED", error: "handler failed" }
  });
  assert.equal(r.ok, true);
  assert.equal(r.execution.status, "FAILED");
  assert.equal(r.execution.error_code, "ACTION_EXECUTION_FAILED");
});

test("ledger rejects missing tenant/action context", () => {
  const r = createActionExecutionRecord({
    tenantId: null,
    action: "START_WORKFLOW",
    idempotencyKey: "action-idem-3",
    dispatch: { status: "EXECUTED" }
  });
  assert.equal(r.ok, false);
});

test("ledger rejects unknown dispatcher result", () => {
  const r = createActionExecutionRecord({
    tenantId: "tenant-a",
    action: "START_WORKFLOW",
    idempotencyKey: "action-idem-4",
    dispatch: { status: "UNKNOWN" }
  });
  assert.equal(r.ok, false);
});
