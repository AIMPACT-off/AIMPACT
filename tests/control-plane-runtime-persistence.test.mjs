import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimePersistenceBridge } from "../phase2/control-plane/runtime-persistence.mjs";

const baseEvent = (overrides = {}) => ({
  event_id: "evt-0001",
  event_type: "DIAGNOSIS_REVIEW_APPROVED",
  tenant_id: "tenant-a",
  idempotency_key: "idem-0001",
  occurred_at: "2026-10-05T00:00:00.000Z",
  schema_version: "1",
  ...overrides
});

const readyPolicy = {
  tenant_id: "tenant-a",
  evidence: {
    tenant_id: "tenant-a",
    authenticated: true,
    active_membership: true,
    approved_report: true,
    approved_review: true,
    active_entitlement: true,
    lifecycle_ready: true
  }
};

function fakePersistence(state = { tenant_id: "tenant-a", state: "DIAGNOSIS", version: 0 }) {
  const calls = [];
  return {
    calls,
    async getLifecycleState() { return state; },
    async getEventByIdempotencyKey() { return null; },
    async applyLifecycleEvent(event, expectedVersion) {
      calls.push({ event, expectedVersion });
      return {
        ok: true,
        duplicate: false,
        event_id: event.event_id,
        tenant_id: event.tenant_id,
        from_state: state.state,
        to_state: "APPROVED",
        version: expectedVersion + 1
      };
    }
  };
}

test("runtime bridge persists the routed lifecycle event before dispatch", async () => {
  const persistence = fakePersistence();
  let executed = 0;
  const bridge = createRuntimePersistenceBridge({
    persistence,
    handlers: { START_WORKFLOW: () => { executed += 1; return { workflow_id: "wf-1" }; } }
  });

  const result = await bridge.process(baseEvent(), readyPolicy, { tenant_id: "tenant-a" });

  assert.equal(result.ok, true);
  assert.equal(result.status, "EXECUTED");
  assert.equal(persistence.calls.length, 1);
  assert.equal(persistence.calls[0].expectedVersion, 0);
  assert.equal(executed, 1);
});

test("runtime bridge never persists when policy is NOT_VERIFIED", async () => {
  const persistence = fakePersistence();
  const bridge = createRuntimePersistenceBridge({ persistence });

  const result = await bridge.process(baseEvent(), {
    tenant_id: "tenant-a",
    evidence: { tenant_id: "tenant-a" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "NOT_VERIFIED");
  assert.equal(persistence.calls.length, 0);
});

test("runtime bridge rejects duplicate persistence without replaying side effects", async () => {
  const persistence = fakePersistence();
  persistence.getEventByIdempotencyKey = async () => ({ event_id: "evt-0001" });
  let executed = 0;
  const bridge = createRuntimePersistenceBridge({
    persistence,
    handlers: { START_WORKFLOW: () => { executed += 1; } }
  });

  const result = await bridge.process(baseEvent(), readyPolicy);

  assert.equal(result.status, "DUPLICATE_PERSISTED");
  assert.equal(result.dispatch.status, "NOT_DISPATCHED");
  assert.equal(executed, 0);
});

test("runtime bridge rejects idempotency conflicts fail-closed", async () => {
  const persistence = fakePersistence();
  persistence.getEventByIdempotencyKey = async () => ({ event_id: "evt-other" });
  const bridge = createRuntimePersistenceBridge({ persistence });

  const result = await bridge.process(baseEvent(), readyPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(persistence.calls.length, 0);
});

test("runtime bridge propagates persistence concurrency rejection without dispatch", async () => {
  const persistence = fakePersistence();
  persistence.applyLifecycleEvent = async () => ({ ok: false, code: "OPTIMISTIC_CONFLICT" });
  let executed = 0;
  const bridge = createRuntimePersistenceBridge({
    persistence,
    handlers: { START_WORKFLOW: () => { executed += 1; } }
  });

  const result = await bridge.process(baseEvent(), readyPolicy);

  assert.equal(result.ok, false);
  assert.equal(result.stage, "PERSISTENCE");
  assert.equal(result.code, "PERSISTENCE_REJECTED");
  assert.equal(executed, 0);
});
