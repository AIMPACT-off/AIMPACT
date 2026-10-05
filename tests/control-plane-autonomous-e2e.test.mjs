import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemEvent, normalizeCiEvidence } from "../phase2/control-plane/autonomous-event-loop.mjs";
import { dispatchEligibleEvent } from "../phase2/control-plane/autonomous-dispatcher.mjs";

test("autonomous control plane closes event -> persistence -> gate -> policy -> dispatcher -> outbox intent", async () => {
  const tenantId = "tenant-e2e";
  const built = buildSystemEvent({
    eventId: "00000000-0000-4000-8000-000000000101",
    eventType: "GATE_RECHECK_REQUESTED",
    source: "test",
    repository: "AIMPACT-off/AIMPACT",
    ref: "phase2-execution/product-portal-v1",
    commitSha: "test-commit",
    payload: { action: "START_WORKFLOW" }
  });
  assert.equal(built.ok, true);

  const persisted = { ...built.event, tenant_id: tenantId, idempotency_key: "e2e-key-1", sequence: 1 };
  assert.equal(persisted.tenant_id, tenantId);
  assert.equal(persisted.sequence, 1);

  const evidence = {
    tenant_id: tenantId,
    authenticated: true,
    active_membership: true,
    approved_report: true,
    approved_review: true,
    active_entitlement: true,
    lifecycle_ready: true
  };
  const normalized = normalizeCiEvidence({ run_id: 142, conclusion: "success", commit_sha: "test-commit" });
  assert.equal(normalized.conclusion, "success");

  const dispatched = dispatchEligibleEvent({
    event: persisted,
    tenantId,
    evidence,
    intentId: "00000000-0000-4000-8000-000000000102",
    idempotencyKey: "e2e-intent-1"
  });

  assert.equal(dispatched.status, "DISPATCHED");
  assert.equal(dispatched.policy.decision, "ALLOW");
  assert.equal(dispatched.intent.status, "PENDING");
  assert.equal(dispatched.intent.tenant_id, tenantId);
  assert.equal(dispatched.intent.event_id, persisted.event_id);
  assert.equal(dispatched.intent.action, "START_WORKFLOW");
  assert.equal(normalized.conclusion, "success");
});

test("autonomous control plane stops before outbox on tenant mismatch", () => {
  const event = {
    event_id: "00000000-0000-4000-8000-000000000103",
    payload: { action: "START_WORKFLOW" }
  };
  const result = dispatchEligibleEvent({
    event,
    tenantId: "tenant-a",
    evidence: {
      tenant_id: "tenant-b",
      authenticated: true,
      active_membership: true,
      approved_report: true,
      approved_review: true,
      active_entitlement: true,
      lifecycle_ready: true
    },
    intentId: "00000000-0000-4000-8000-000000000104",
    idempotencyKey: "e2e-intent-2"
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "TENANT_SCOPE_MISMATCH");
  assert.equal(result.intent, undefined);
});
