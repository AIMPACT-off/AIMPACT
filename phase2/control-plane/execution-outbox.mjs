export const EXECUTION_OUTBOX_STATUSES = Object.freeze([
  "PENDING",
  "CLAIMED",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);

export function createExecutionIntentRecord({
  intentId,
  tenantId,
  eventId = null,
  action,
  idempotencyKey,
  payload = {},
  correlationId = null,
  causationId = null,
} = {}) {
  if (!tenantId || !action || !idempotencyKey) {
    throw new Error("EXECUTION_INTENT_CONTEXT_REQUIRED");
  }
  if (!intentId) {
    throw new Error("EXECUTION_INTENT_ID_REQUIRED");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("EXECUTION_INTENT_PAYLOAD_INVALID");
  }
  return {
    intent_id: intentId,
    tenant_id: tenantId,
    event_id: eventId,
    action,
    idempotency_key: idempotencyKey,
    status: "PENDING",
    attempt: 0,
    payload,
    correlation_id: correlationId,
    causation_id: causationId,
  };
}

export function createExecutionOutboxAdapter(supabase) {
  if (!supabase?.rpc) throw new Error("SUPABASE_RPC_REQUIRED");
  return {
    async createIntent(record) {
      const { data, error } = await supabase.rpc("create_execution_intent_atomic", {
        p_intent_id: record.intent_id,
        p_tenant_id: record.tenant_id,
        p_event_id: record.event_id,
        p_action: record.action,
        p_idempotency_key: record.idempotency_key,
        p_payload: record.payload,
        p_correlation_id: record.correlation_id,
        p_causation_id: record.causation_id,
      });
      if (error) throw error;
      return data;
    },
    async claim(tenantId, workerId, leaseSeconds = 60) {
      const { data, error } = await supabase.rpc("claim_execution_intent_atomic", {
        p_tenant_id: tenantId,
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return data;
    },
    async complete(intentId, status, errorCode = null, errorMessage = null) {
      const { data, error } = await supabase.rpc("complete_execution_intent_atomic", {
        p_intent_id: intentId,
        p_status: status,
        p_error_code: errorCode,
        p_error_message: errorMessage,
      });
      if (error) throw error;
      return data;
    },
    async retry(intentId, maxAttempts = 3, backoffSeconds = 30) {
      const { data, error } = await supabase.rpc("retry_execution_intent_atomic", {
        p_intent_id: intentId,
        p_max_attempts: maxAttempts,
        p_backoff_seconds: backoffSeconds,
      });
      if (error) throw error;
      return data;
    },
  };
}
