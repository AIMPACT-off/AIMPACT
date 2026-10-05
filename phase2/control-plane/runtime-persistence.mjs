import { routeEvent } from "./event-router.mjs";
import { executeRoutedAction } from "./action-dispatcher.mjs";

function validateRuntimeEvent(event) {
  const required = ["event_id", "event_type", "tenant_id", "occurred_at", "schema_version"];
  const missing = required.filter((key) => event?.[key] == null || event[key] === "");
  if (missing.length) return { ok: false, code: "INVALID_EVENT_ENVELOPE", missing };
  return { ok: true };
}

/**
 * Persistence contract deliberately uses an injected adapter.
 * The bridge is server-side only; callers must supply a service-role-scoped adapter.
 */
export function createRuntimePersistenceBridge({ persistence, handlers = {}, actionMap } = {}) {
  if (!persistence?.getLifecycleState || !persistence?.getEventByIdempotencyKey || !persistence?.applyLifecycleEvent) {
    throw new Error("PERSISTENCE_ADAPTER_REQUIRED");
  }

  return {
    async process(event, policyContext = {}, payload = {}) {
      const envelope = validateRuntimeEvent(event);
      if (!envelope.ok) return envelope;

      const existing = await persistence.getEventByIdempotencyKey(event.tenant_id, event.idempotency_key);
      if (existing) {
        if (existing.event_id !== event.event_id) {
          return { ok: false, stage: "PERSISTENCE", code: "IDEMPOTENCY_CONFLICT", event_id: event.event_id };
        }
        return {
          ok: true,
          status: "DUPLICATE_PERSISTED",
          event_id: event.event_id,
          persisted_event_id: existing.event_id,
          dispatch: { status: "NOT_DISPATCHED", code: "DUPLICATE_PERSISTED" }
        };
      }

      const snapshot = await persistence.getLifecycleState(event.tenant_id);
      const normalizedSnapshot = snapshot ?? {
        tenant_id: event.tenant_id,
        state: "LEAD",
        version: 0,
        last_event_id: null,
        last_event_at: null
      };

      if (normalizedSnapshot.tenant_id !== event.tenant_id) {
        return { ok: false, stage: "PERSISTENCE", code: "TENANT_SCOPE_MISMATCH" };
      }

      const expectedVersion = normalizedSnapshot.version ?? 0;
      const nextSequence = event.sequence ?? expectedVersion + 1;
      if (nextSequence !== expectedVersion + 1) {
        return {
          ok: false,
          stage: "PERSISTENCE",
          code: "SEQUENCE_GAP",
          expected_sequence: expectedVersion + 1,
          received_sequence: nextSequence
        };
      }

      const route = routeEvent({
        event: { ...event, sequence: nextSequence },
        snapshot: normalizedSnapshot,
        policyContext,
        actionMap
      });

      if (!route.ok) {
        return { ...route, status: route.status ?? "NOT_DISPATCHED" };
      }

      const persisted = await persistence.applyLifecycleEvent({
        ...event,
        sequence: nextSequence
      }, expectedVersion);

      if (!persisted?.ok) {
        return {
          ok: false,
          stage: "PERSISTENCE",
          code: "PERSISTENCE_REJECTED",
          persistence: persisted ?? null
        };
      }

      const dispatch = executeRoutedAction(route, payload, handlers);
      return {
        ok: dispatch.status === "EXECUTED",
        status: dispatch.status === "EXECUTED" ? "EXECUTED" : "EXECUTION_FAILED",
        event_id: event.event_id,
        lifecycle: route.lifecycle,
        policy: route.policy,
        action: route.action,
        persistence: persisted,
        dispatch,
        learning: {
          correlation_id: event.correlation_id ?? null,
          causation_id: event.causation_id ?? null,
          outcome: dispatch.status
        }
      };
    }
  };
}

/**
 * Adapter factory for a Supabase service-role client.
 * No credentials are read here; callers own secret injection and client construction.
 */
export function createSupabasePersistenceAdapter(supabase) {
  if (!supabase?.from || !supabase?.rpc) throw new Error("SUPABASE_CLIENT_REQUIRED");

  return {
    async getLifecycleState(tenantId) {
      const { data, error } = await supabase
        .from("customer_lifecycle_state")
        .select("tenant_id,state,version,last_event_id,last_event_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getEventByIdempotencyKey(tenantId, idempotencyKey) {
      if (!idempotencyKey) return null;
      const { data, error } = await supabase
        .from("control_plane_events")
        .select("event_id,tenant_id,event_type,idempotency_key,sequence")
        .eq("tenant_id", tenantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async applyLifecycleEvent(event, expectedVersion) {
      const { data, error } = await supabase.rpc("apply_lifecycle_event_atomic", {
        p_event_id: event.event_id,
        p_tenant_id: event.tenant_id,
        p_event_type: event.event_type,
        p_idempotency_key: event.idempotency_key,
        p_expected_version: expectedVersion,
        p_next_sequence: event.sequence,
        p_actor_type: event.actor_type ?? "system",
        p_actor_id: event.actor_id ?? null,
        p_correlation_id: event.correlation_id ?? null,
        p_causation_id: event.causation_id ?? null,
        p_schema_version: event.schema_version ?? "1",
        p_payload: event.payload ?? {},
        p_occurred_at: event.occurred_at
      });
      if (error) throw error;
      return data;
    }
  };
}
