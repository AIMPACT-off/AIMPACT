import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const central = fs.readFileSync(".github/workflows/central-control.yml", "utf8");
const payment = fs.readFileSync(".github/workflows/payment-control.yml", "utf8");
const policy = JSON.parse(fs.readFileSync("control-plane/policy.json", "utf8"));

test("central control runs are isolated so later events cannot cancel earlier evidence", () => {
  assert.match(central, /aimpact-central-control-.*github\.event\.workflow_run\.id \|\| github\.run_id/);
  assert.match(central, /cancel-in-progress: false/);
});

test("skipped payment workflow events are not retried or mistaken for failed tests", () => {
  assert.match(central, /RUN_CONCLUSION" = "skipped"[\\s\\S]*CODE_GATE" = "skipped"[\\s\\S]*PAYMENT_CONTROL_RUN_NOT_EXECUTED/);
  assert.match(central, /PAYMENT_AUTORETRY=NOT_APPLICABLE/);
});

test("central payment control cannot pass without explicit E2E evidence", () => {
  assert.match(central, /grep -q 'PAYMENT_E2E=PASS'/);
  assert.match(central, /PAYMENT_E2E_NOT_VERIFIED/);
  assert.match(central, /PAYMENT_E2E=NOT_VERIFIED/);
});

test("mock provider and payment-link checks are explicitly not E2E", () => {
  assert.match(payment, /PAYMENT_PROVIDER_GATE_MODE=MOCK_ONLY/);
  assert.match(payment, /PAYMENT_PROVIDER_GATE_MODE=STRIPE_SANDBOX_VERIFIED/);
  assert.match(payment, /TOSS_SANDBOX_PAYMENT_TEST_NOT_IMPLEMENTED/);
  assert.ok((payment.match(/PAYMENT_E2E=NOT_VERIFIED/g) || []).length >= 3);
});

test("central certification requires verified payment E2E", () => {
  assert.ok(policy.certification.required.includes("payment_e2e_verified"));
  assert.equal(policy.certification.default_state, "NOT_CERTIFIED");
  assert.equal(policy.certification.completion_rule, "ALL_REQUIRED_GATES_PASS");
});
