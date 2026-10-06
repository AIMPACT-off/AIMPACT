import test from "node:test";
import assert from "node:assert/strict";
import { routeEvent } from "../phase2/control-plane/event-router.mjs";
import { executeRoutedAction } from "../phase2/control-plane/action-dispatcher.mjs";

const evidence = {
  authenticated: true,
  active_membership: true,
  approved_report: true,
  approved_review: true,
  active_entitlement: true,
  lifecycle_ready: true
};

const event = {
  event_id: "evt-1",
  event_type: "DIAGNOSIS_REVIEW_APPROVED",
  tenant_id: "tenant-a",
  occurred_at: "2026-10-05T00:00:00Z",
  schema_version: 1,
  sequence: 3
};

test("router advances lifecycle, evaluates policy, and reaches dispatch", () => {
  const result = routeEvent({
    event,
    snapshot: { tenant_id: "tenant-a", state: "DIAGNOSIS", version: 2 },
    policyContext: { evidence }
  });
  assert.equal(result.ok, true);
  assert.equal(result.lifecycle.state, "APPROVED");
  assert.equal(result.policy.decision, "ALLOW");
  assert.equal(result.action, "START_WORKFLOW");
  assert.equal(result.status, "DISPATCH");
});

test("router never dispatches when policy is NOT_VERIFIED", () => {
  const result = routeEvent({
    event,
    snapshot: { tenant_id: "tenant-a", state: "DIAGNOSIS", version: 2 },
    policyContext: { evidence: { authenticated: true } }
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "POLICY");
  assert.equal(result.policy.decision, "NOT_VERIFIED");

  const dispatch = executeRoutedAction(result, {}, {
    START_WORKFLOW: () => "must-not-run"
  });
  assert.equal(dispatch.status, "NOT_DISPATCHED");
});

test("router fails closed on tenant mismatch", () => {
  const result = routeEvent({
    event: { ...event, tenant_id: "tenant-b" },
    snapshot: { tenant_id: "tenant-a", state: "DIAGNOSIS", version: 2 },
    policyContext: { evidence }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "TENANT_SCOPE_MISMATCH");
});

test("dispatcher executes only a routed ALLOW action", () => {
  const result = routeEvent({
    event,
    snapshot: { tenant_id: "tenant-a", state: "DIAGNOSIS", version: 2 },
    policyContext: { evidence }
  });
  const dispatch = executeRoutedAction(result, { tenant_id: "tenant-a" }, {
    START_WORKFLOW: (payload) => ({ accepted: true, tenant_id: payload.tenant_id })
  });
  assert.deepEqual(dispatch, {
    status: "EXECUTED",
    action: "START_WORKFLOW",
    result: { accepted: true, tenant_id: "tenant-a" }
  });
});
