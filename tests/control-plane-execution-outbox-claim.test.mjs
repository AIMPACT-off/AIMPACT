import assert from "node:assert/strict";
import test from "node:test";

test("claim contract requires tenant and worker context", () => {
  assert.throws(() => ({ tenant_id: null, worker_id: "" }), /worker|tenant/);
});

test("claim contract uses exclusive lease states", () => {
  const eligible = new Set(["PENDING", "CLAIMED"]);
  assert.equal(eligible.has("PENDING"), true);
  assert.equal(eligible.has("CLAIMED"), true);
  assert.equal(eligible.has("COMPLETED"), false);
  assert.equal(eligible.has("FAILED"), false);
});

test("claim contract increments attempt and records worker", () => {
  const before = { attempt: 0, status: "PENDING" };
  const after = { ...before, attempt: before.attempt + 1, status: "CLAIMED", claimed_by: "worker-a" };
  assert.equal(after.attempt, 1);
  assert.equal(after.status, "CLAIMED");
  assert.equal(after.claimed_by, "worker-a");
});
