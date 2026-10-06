import test from "node:test";
import assert from "node:assert/strict";
import { applyLifecycleEvent, canTransition, transitionLifecycle } from "../phase2/control-plane/lifecycle-state.mjs";

test("canonical lifecycle permits diagnosis to approval", () => {
  assert.deepEqual(transitionLifecycle("DIAGNOSIS", "DIAGNOSIS_REVIEW_APPROVED"), {
    ok: true, from: "DIAGNOSIS", to: "APPROVED", eventType: "DIAGNOSIS_REVIEW_APPROVED"
  });
});

test("policy rejects invalid lifecycle transitions", () => {
  assert.equal(canTransition("LEAD", "WORKFLOW_STARTED"), false);
  assert.equal(transitionLifecycle("LEAD", "WORKFLOW_STARTED").code, "TRANSITION_NOT_ALLOWED");
});

test("tenant scope mismatch fails closed", () => {
  const result = applyLifecycleEvent({ tenant_id: "tenant-a", state: "READY", version: 2 }, {
    tenant_id: "tenant-b", event_id: "e1", event_type: "WORKFLOW_STARTED", sequence: 3
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "TENANT_SCOPE_MISMATCH");
});

test("stale events cannot regress state", () => {
  const result = applyLifecycleEvent({ tenant_id: "tenant-a", state: "ACTIVE", version: 5 }, {
    tenant_id: "tenant-a", event_id: "old", event_type: "OUTCOME_SUBMITTED", sequence: 4
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "STALE_EVENT");
});

test("valid events advance the immutable projection", () => {
  const result = applyLifecycleEvent({ tenant_id: "tenant-a", state: "READY", version: 7 }, {
    tenant_id: "tenant-a", event_id: "wf-1", event_type: "WORKFLOW_STARTED", sequence: 8, occurred_at: "2026-10-05T00:00:00Z"
  });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.state, "ACTIVE");
  assert.equal(result.snapshot.version, 8);
  assert.equal(result.snapshot.last_event_id, "wf-1");
});