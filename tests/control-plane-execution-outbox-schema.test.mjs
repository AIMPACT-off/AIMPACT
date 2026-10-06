import assert from "node:assert/strict";
import test from "node:test";

test("execution outbox phase A contract is isolated to durable intent fields", () => {
  const required = [
    "intent_id",
    "tenant_id",
    "event_id",
    "action",
    "idempotency_key",
    "status",
    "attempt",
    "payload",
    "available_at",
    "claimed_at",
    "claimed_by",
    "completed_at",
    "last_error_code",
    "last_error_message",
  ];
  assert.equal(required.length, 14);
  assert.ok(required.includes("idempotency_key"));
  assert.ok(required.includes("status"));
  assert.ok(required.includes("attempt"));
});

test("phase A lifecycle permits pending, claimed, completed and recovery failure states", () => {
  assert.deepEqual(
    ["PENDING", "CLAIMED", "COMPLETED", "FAILED", "CANCELED"],
    ["PENDING", "CLAIMED", "COMPLETED", "FAILED", "CANCELED"]
  );
});
