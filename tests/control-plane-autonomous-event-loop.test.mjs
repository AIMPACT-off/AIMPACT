import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTONOMOUS_EVENTS,
  AUTONOMOUS_STATES,
  buildSystemEvent,
  canTransition,
  classifyCiResult,
  normalizeCiEvidence,
  transitionAutonomousState,
  verifyWebhookSignature
} from "../phase2/control-plane/autonomous-event-loop.mjs";
import crypto from "node:crypto";

test("autonomous state transition is explicit and versioned", () => {
  const result = transitionAutonomousState({ state: "OBSERVED", version: 0 }, "ELIGIBLE", "ev-1");
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.state, "ELIGIBLE");
  assert.equal(result.snapshot.version, 1);
  assert.equal(result.snapshot.last_evidence_id, "ev-1");
});

test("invalid autonomous transition fails closed", () => {
  assert.equal(canTransition("PASSED", "RUNNING"), false);
  const result = transitionAutonomousState({ state: "PASSED", version: 2 }, "RUNNING");
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_AUTONOMOUS_TRANSITION");
});

test("same-state transition is idempotent", () => {
  const snapshot = { state: "OBSERVED", version: 3 };
  const result = transitionAutonomousState(snapshot, "OBSERVED");
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.snapshot, snapshot);
});

test("CI evidence normalizes to a safe evidence record", () => {
  const evidence = normalizeCiEvidence({
    run_id: 513,
    job_id: 123,
    commit_sha: "abc",
    workflow: "Phase 1",
    status: "completed",
    conclusion: "success",
    test_summary: "11/11"
  });
  assert.equal(classifyCiResult(evidence), "TEST_PASSED");
  assert.equal(evidence.test_summary, "11/11");
});

test("missing external credentials are not classified as application failure", () => {
  const evidence = normalizeCiEvidence({
    status: "completed",
    conclusion: "failure",
    failure_class: "EXTERNAL_DEPENDENCY_BLOCKED"
  });
  assert.equal(classifyCiResult(evidence), "EXTERNAL_DEPENDENCY_BLOCKED");
});

test("GitHub webhook signature verification is constant-time and fail-closed", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ action: "completed", workflow_run: { id: 1 } });
  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, signature, "wrong"), false);
  assert.equal(verifyWebhookSignature(body, "", secret), false);
});

test("system event contract carries correlation and schema metadata", () => {
  const result = buildSystemEvent({
    eventId: "evt-ci-1",
    eventType: AUTONOMOUS_EVENTS.CI_RUN_COMPLETED,
    source: "github",
    repository: "AIMPACT-off/AIMPACT",
    ref: "phase2-execution/product-portal-v1",
    commitSha: "abc",
    payload: { conclusion: "success" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.event_type, "CI_RUN_COMPLETED");
  assert.equal(result.event.correlation_id, "evt-ci-1");
  assert.equal(result.event.schema_version, "1");
  assert.equal(result.event.payload.conclusion, "success");
});
