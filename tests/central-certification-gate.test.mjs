import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCertification, REQUIRED_GATES } from "../control-plane/gatekeeper.mjs";

test("payment E2E is an explicit required certification gate", () => {
  assert.ok(REQUIRED_GATES.includes("payment_e2e_verified"));
  const all = Object.fromEntries(REQUIRED_GATES.map(name => [name, true]));
  all.payment_e2e_verified = false;
  const result = evaluateCertification(all);
  assert.equal(result.state, "NOT_VERIFIED_COMPLETE");
  assert.ok(result.failed.includes("payment_e2e_verified"));
});

test("central control cannot report completed while any certification gate is false", () => {
  const all = Object.fromEntries(REQUIRED_GATES.map(name => [name, true]));
  assert.equal(evaluateCertification(all).state, "COMPLETED");
  all.live_entitlement_verified = false;
  const result = evaluateCertification(all);
  assert.equal(result.state, "NOT_VERIFIED_COMPLETE");
  assert.equal(result.verified, false);
  assert.ok(result.failed.includes("live_entitlement_verified"));
});
