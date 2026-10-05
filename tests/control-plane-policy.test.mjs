import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGate } from "../phase2/control-plane/policy-gate.mjs";

const base = {
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

test("START_WORKFLOW allows only when every required gate passes", () => {
  assert.equal(evaluateGate("START_WORKFLOW", base).decision, "ALLOW");
});

test("missing evidence is NOT_VERIFIED, never ALLOW", () => {
  const result = evaluateGate("START_WORKFLOW", {
    tenant_id: "tenant-a",
    evidence: { tenant_id: "tenant-a", authenticated: true }
  });
  assert.equal(result.decision, "NOT_VERIFIED");
  assert.ok(result.missing.includes("active_entitlement"));
});

test("failed entitlement denies workflow start", () => {
  const result = evaluateGate("START_WORKFLOW", {
    ...base,
    evidence: { ...base.evidence, active_entitlement: "INACTIVE" }
  });
  assert.equal(result.decision, "DENY");
  assert.ok(result.failed.includes("active_entitlement"));
});

test("pending evidence produces HOLD", () => {
  const result = evaluateGate("START_WORKFLOW", {
    ...base,
    evidence: { ...base.evidence, active_entitlement: "PROCESSING" }
  });
  assert.equal(result.decision, "HOLD");
});

test("tenant scope mismatch fails closed", () => {
  const result = evaluateGate("START_WORKFLOW", {
    ...base,
    evidence: { ...base.evidence, tenant_id: "tenant-b" }
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.code, "TENANT_SCOPE_MISMATCH");
});

test("unsupported actions fail closed", () => {
  assert.equal(evaluateGate("DELETE_THE_BUSINESS", base).decision, "DENY");
});
