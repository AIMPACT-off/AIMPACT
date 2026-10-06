import crypto from "node:crypto";

export const LEARNING_SIGNAL_TYPES = Object.freeze([
  "ACTION_OUTCOME",
  "ACTION_FAILURE",
  "ACTION_REPLAY",
  "POLICY_BLOCK"
]);

function requireTenant(value) {
  if (!value) throw new Error("LEARNING_TENANT_REQUIRED");
  return value;
}

export function deriveLearningSignal({ tenantId, eventId=null, executionId=null, signalType, dispatchStatus, duplicate=false, policyDecision=null, result={}, correlationId=null, causationId=null }) {
  requireTenant(tenantId);
  if (!LEARNING_SIGNAL_TYPES.includes(signalType)) throw new Error("LEARNING_SIGNAL_TYPE_INVALID");
  if (signalType === "POLICY_BLOCK") {
    return { tenant_id:tenantId, execution_id:executionId, event_id:eventId, signal_type:signalType, outcome:"BLOCKED", features:{ policy_decision:policyDecision }, correlation_id:correlationId, causation_id:causationId };
  }
  if (duplicate) {
    return { tenant_id:tenantId, execution_id:executionId, event_id:eventId, signal_type:"ACTION_REPLAY", outcome:"DUPLICATE", features:{ dispatch_status:dispatchStatus }, correlation_id:correlationId, causation_id:causationId };
  }
  const positive = dispatchStatus === "EXECUTED";
  return {
    tenant_id:tenantId, execution_id:executionId, event_id:eventId,
    signal_type: positive ? "ACTION_OUTCOME" : "ACTION_FAILURE",
    outcome: positive ? "POSITIVE" : "NEGATIVE",
    features:{ dispatch_status:dispatchStatus, result },
    correlation_id:correlationId, causation_id:causationId
  };
}

export function createLearningSignalRecord(input) {
  const signal=deriveLearningSignal(input);
  return { signal_id: crypto.randomUUID(), ...signal, created_at:new Date().toISOString() };
}

export function createLearningAdapter(supabase) {
  if (!supabase?.rpc) throw new Error("LEARNING_SUPABASE_CLIENT_REQUIRED");
  return {
    async record(signal) {
      return supabase.rpc("record_learning_signal_atomic", {
        p_signal_id:signal.signal_id, p_tenant_id:signal.tenant_id, p_execution_id:signal.execution_id,
        p_event_id:signal.event_id, p_signal_type:signal.signal_type, p_outcome:signal.outcome,
        p_features:signal.features, p_correlation_id:signal.correlation_id, p_causation_id:signal.causation_id
      });
    }
  };
}
