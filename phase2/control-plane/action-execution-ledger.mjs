import { randomUUID } from "node:crypto";

export const ACTION_LEDGER_STATUSES = Object.freeze([
  "EXECUTED",
  "NO_HANDLER",
  "FAILED",
  "NOT_DISPATCHED"
]);

export function createActionExecutionRecord({ tenantId, eventId = null, action, dispatch, idempotencyKey, correlationId = null, causationId = null, attempt = 1 }) {
  if (!tenantId || !action || !idempotencyKey) {
    return { ok: false, code: "ACTION_LEDGER_CONTEXT_REQUIRED" };
  }
  if (!dispatch?.status || !ACTION_LEDGER_STATUSES.includes(dispatch.status)) {
    return { ok: false, code: "INVALID_DISPATCH_RESULT" };
  }

  const status = dispatch.status;
  const result = {
    status,
    action,
    result: dispatch.result ?? null
  };

  return {
    ok: true,
    execution: {
      execution_id: randomUUID(),
      tenant_id: tenantId,
      event_id: eventId,
      action,
      status,
      idempotency_key: idempotencyKey,
      attempt,
      handler_version: "1",
      result,
      error_code: dispatch.code ?? null,
      error_message: dispatch.error ?? null,
      correlation_id: correlationId,
      causation_id: causationId,
      started_at: new Date().toISOString(),
      completed_at: status === "NOT_DISPATCHED" ? null : new Date().toISOString()
    }
  };
}

export function createActionLedgerAdapter(supabase) {
  if (!supabase?.rpc) throw new Error("SUPABASE_CLIENT_REQUIRED");

  return {
    async record(execution) {
      const e = execution;
      const { data, error } = await supabase.rpc("record_action_execution_atomic", {
        p_execution_id: e.execution_id,
        p_tenant_id: e.tenant_id,
        p_event_id: e.event_id,
        p_action: e.action,
        p_status: e.status,
        p_idempotency_key: e.idempotency_key,
        p_attempt: e.attempt,
        p_handler_version: e.handler_version,
        p_result: e.result,
        p_error_code: e.error_code,
        p_error_message: e.error_message,
        p_correlation_id: e.correlation_id,
        p_causation_id: e.causation_id,
        p_started_at: e.started_at,
        p_completed_at: e.completed_at
      });
      if (error) throw error;
      return data;
    }
  };
}
