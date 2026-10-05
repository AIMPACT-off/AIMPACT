import { applyLifecycleEvent } from "./lifecycle-state.mjs";
import { evaluateGate } from "./policy-gate.mjs";

export const ROUTER_ACTIONS = Object.freeze({
  DIAGNOSIS_REVIEW_APPROVED: "START_WORKFLOW",
  OUTCOME_SUBMITTED: "SUBMIT_OUTCOME",
  SUBSCRIPTION_RENEWAL_REQUESTED: "RENEW_SUBSCRIPTION"
});

function validateEnvelope(event) {
  const required = ["event_id", "event_type", "tenant_id", "occurred_at", "schema_version"];
  const missing = required.filter((key) => event?.[key] == null || event[key] === "");
  if (missing.length) return { ok: false, code: "INVALID_EVENT_ENVELOPE", missing };
  return { ok: true };
}

export function routeEvent({ event, snapshot, policyContext = {}, actionMap = ROUTER_ACTIONS }) {
  const envelope = validateEnvelope(event);
  if (!envelope.ok) return envelope;

  if (!snapshot?.tenant_id || snapshot.tenant_id !== event.tenant_id) {
    return { ok: false, code: "TENANT_SCOPE_MISMATCH", event_id: event.event_id };
  }

  const lifecycle = applyLifecycleEvent(snapshot, event);
  if (!lifecycle.ok) return { ok: false, stage: "LIFECYCLE", ...lifecycle };

  const action = actionMap[event.event_type] ?? null;
  if (!action) {
    return {
      ok: true,
      event_id: event.event_id,
      lifecycle: lifecycle.snapshot,
      policy: null,
      action: null,
      status: "STATE_ONLY"
    };
  }

  const policy = evaluateGate(action, {
    ...policyContext,
    tenant_id: event.tenant_id,
    evidence: {
      ...(policyContext.evidence ?? {}),
      tenant_id: event.tenant_id
    }
  });

  if (policy.decision !== "ALLOW") {
    return {
      ok: false,
      event_id: event.event_id,
      stage: "POLICY",
      lifecycle: lifecycle.snapshot,
      policy,
      action,
      status: policy.decision
    };
  }

  return {
    ok: true,
    event_id: event.event_id,
    lifecycle: lifecycle.snapshot,
    policy,
    action,
    status: "DISPATCH"
  };
}
