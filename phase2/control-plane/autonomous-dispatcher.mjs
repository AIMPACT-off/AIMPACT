import { evaluateGate } from "./policy-gate.mjs";
import { createExecutionIntentRecord } from "./execution-outbox.mjs";

export const AUTONOMOUS_DISPATCH_RESULTS = Object.freeze([
  "DISPATCHED","NOT_DISPATCHED","BLOCKED","FAILED"
]);

export function dispatchEligibleEvent({ event, tenantId, evidence = {}, intentId, idempotencyKey, handlers = {} } = {}) {
  if (!event || !event.event_id) return { status:"NOT_DISPATCHED", code:"EVENT_REQUIRED" };
  if (!tenantId) return { status:"NOT_DISPATCHED", code:"TENANT_CONTEXT_REQUIRED" };

  const action = event.payload?.action ?? event.action ?? null;
  const policy = evaluateGate(action, { tenant_id: tenantId, evidence: { ...evidence, tenant_id: tenantId } });
  if (policy.decision !== "ALLOW") {
    return {
      status: policy.decision === "DENY" ? "BLOCKED" : "NOT_DISPATCHED",
      code: policy.code,
      policy,
      action
    };
  }

  if (!intentId || !idempotencyKey) {
    return { status:"NOT_DISPATCHED", code:"EXECUTION_INTENT_CONTEXT_REQUIRED", policy, action };
  }

  let intent;
  try {
    intent = createExecutionIntentRecord({
      intentId,
      tenantId,
      eventId: event.event_id,
      action,
      idempotencyKey,
      payload: event.payload ?? {},
      correlationId: event.correlation_id ?? event.event_id,
      causationId: event.causation_id ?? null
    });
  } catch (error) {
    return { status:"FAILED", code:error?.message ?? "EXECUTION_INTENT_INVALID", policy, action };
  }

  const handler = handlers[action];
  return {
    status: "DISPATCHED",
    code: "POLICY_ALLOWED_INTENT_READY",
    action,
    policy,
    intent,
    handler_registered: typeof handler === "function"
  };
}
