import crypto from "node:crypto";

export const AUTONOMOUS_STATES = Object.freeze({
  OBSERVED: "OBSERVED",
  ELIGIBLE: "ELIGIBLE",
  DISPATCHED: "DISPATCHED",
  RUNNING: "RUNNING",
  EVIDENCE_PENDING: "EVIDENCE_PENDING",
  PASSED: "PASSED",
  NEXT_ACTION_READY: "NEXT_ACTION_READY",
  BLOCKED: "BLOCKED",
  RETRY_PENDING: "RETRY_PENDING",
  FAILED: "FAILED",
  QUARANTINED: "QUARANTINED",
  HUMAN_APPROVAL_REQUIRED: "HUMAN_APPROVAL_REQUIRED",
  FROZEN: "FROZEN"
});

export const AUTONOMOUS_EVENTS = Object.freeze({
  CI_RUN_COMPLETED: "CI_RUN_COMPLETED",
  CI_RUN_FAILED: "CI_RUN_FAILED",
  SECRET_GATE_CHANGED: "SECRET_GATE_CHANGED",
  TEST_ENV_READY: "TEST_ENV_READY",
  GATE_RECHECK_REQUESTED: "GATE_RECHECK_REQUESTED",
  HUMAN_APPROVAL_GRANTED: "HUMAN_APPROVAL_GRANTED",
  PRODUCTION_GATE_CHANGED: "PRODUCTION_GATE_CHANGED"
});

const TRANSITIONS = Object.freeze({
  OBSERVED: ["ELIGIBLE", "BLOCKED", "HUMAN_APPROVAL_REQUIRED", "FROZEN"],
  ELIGIBLE: ["DISPATCHED", "BLOCKED", "HUMAN_APPROVAL_REQUIRED", "FROZEN"],
  DISPATCHED: ["RUNNING", "FAILED", "BLOCKED", "FROZEN"],
  RUNNING: ["EVIDENCE_PENDING", "FAILED", "BLOCKED", "FROZEN"],
  EVIDENCE_PENDING: ["PASSED", "FAILED", "BLOCKED", "HUMAN_APPROVAL_REQUIRED"],
  PASSED: ["NEXT_ACTION_READY"],
  NEXT_ACTION_READY: ["ELIGIBLE", "HUMAN_APPROVAL_REQUIRED", "FROZEN"],
  RETRY_PENDING: ["DISPATCHED", "QUARANTINED", "HUMAN_APPROVAL_REQUIRED"],
  FAILED: ["RETRY_PENDING", "QUARANTINED", "HUMAN_APPROVAL_REQUIRED"],
  BLOCKED: ["ELIGIBLE", "HUMAN_APPROVAL_REQUIRED", "FROZEN"],
  QUARANTINED: ["HUMAN_APPROVAL_REQUIRED"],
  HUMAN_APPROVAL_REQUIRED: ["ELIGIBLE", "FROZEN"],
  FROZEN: ["HUMAN_APPROVAL_REQUIRED"]
});

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) === true;
}

export function transitionAutonomousState(snapshot, to, evidenceId = null) {
  const from = snapshot?.state ?? AUTONOMOUS_STATES.OBSERVED;
  if (!Object.values(AUTONOMOUS_STATES).includes(to)) {
    return { ok: false, code: "UNKNOWN_AUTONOMOUS_STATE", from, to };
  }
  if (from === to) return { ok: true, duplicate: true, snapshot };
  if (!canTransition(from, to)) {
    return { ok: false, code: "INVALID_AUTONOMOUS_TRANSITION", from, to };
  }
  return {
    ok: true,
    duplicate: false,
    snapshot: {
      ...snapshot,
      state: to,
      last_evidence_id: evidenceId ?? snapshot?.last_evidence_id ?? null,
      version: (snapshot?.version ?? 0) + 1
    }
  };
}

export function normalizeCiEvidence(input = {}) {
  const conclusion = input.conclusion ?? input.status ?? null;
  return {
    run_id: input.run_id ?? null,
    job_id: input.job_id ?? null,
    commit_sha: input.commit_sha ?? null,
    workflow: input.workflow ?? null,
    status: input.status ?? null,
    conclusion,
    test_summary: input.test_summary ?? null,
    failure_class: input.failure_class ?? null,
    artifact_reference: input.artifact_reference ?? null,
    observed_at: input.observed_at ?? new Date().toISOString()
  };
}

export function classifyCiResult(evidence) {
  if (evidence?.conclusion === "success") return "TEST_PASSED";
  if (evidence?.failure_class === "EXTERNAL_DEPENDENCY_BLOCKED") return "EXTERNAL_DEPENDENCY_BLOCKED";
  if (evidence?.conclusion === "failure") return "TEST_FAILED";
  return "TEST_NOT_VERIFIED";
}

export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.startsWith("sha256=") ? signatureHeader : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildSystemEvent({ eventId, eventType, source, repository, ref, commitSha, payload = {}, occurredAt = new Date().toISOString() }) {
  if (!eventId || !eventType || !source) {
    return { ok: false, code: "INVALID_SYSTEM_EVENT" };
  }
  return {
    ok: true,
    event: {
      event_id: eventId,
      event_type: eventType,
      occurred_at: occurredAt,
      source,
      repository: repository ?? null,
      ref: ref ?? null,
      commit_sha: commitSha ?? null,
      correlation_id: eventId,
      causation_id: null,
      schema_version: "1",
      payload
    }
  };
}
