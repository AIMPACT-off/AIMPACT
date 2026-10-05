export const LIFECYCLE_STATES = Object.freeze([
  "LEAD", "ONBOARDING", "DIAGNOSIS", "REVIEW", "APPROVED", "READY",
  "ACTIVE", "OUTCOME", "RENEWAL", "COMPLETED", "BLOCKED", "SUSPENDED",
  "CANCELED", "FAILED"
]);

const transitions = {
  LEAD: { TENANT_CREATED: "ONBOARDING" },
  ONBOARDING: { DIAGNOSIS_SUBMITTED: "DIAGNOSIS" },
  DIAGNOSIS: { DIAGNOSIS_REVIEW_STARTED: "REVIEW", DIAGNOSIS_REVIEW_APPROVED: "APPROVED" },
  REVIEW: { DIAGNOSIS_REVIEW_APPROVED: "APPROVED", DIAGNOSIS_REVIEW_REJECTED: "DIAGNOSIS" },
  APPROVED: { ENTITLEMENT_ACTIVE: "READY" },
  READY: { WORKFLOW_STARTED: "ACTIVE" },
  ACTIVE: { OUTCOME_SUBMITTED: "OUTCOME", WORKFLOW_FAILED: "FAILED" },
  OUTCOME: { OUTCOME_VERIFIED: "RENEWAL", OUTCOME_REJECTED: "ACTIVE" },
  RENEWAL: { SUBSCRIPTION_RENEWED: "ACTIVE", SUBSCRIPTION_CANCELED: "CANCELED" },
  COMPLETED: {},
  BLOCKED: { BLOCK_RESOLVED: "READY" },
  SUSPENDED: { SUSPENSION_RESOLVED: "READY", SUBSCRIPTION_CANCELED: "CANCELED" },
  CANCELED: {},
  FAILED: { RETRY_APPROVED: "READY", WORKFLOW_RESTARTED: "ACTIVE" }
};

export function transitionLifecycle(state, eventType) {
  const next = transitions[state]?.[eventType];
  if (!next) return { ok: false, code: "TRANSITION_NOT_ALLOWED", state, eventType };
  return { ok: true, from: state, to: next, eventType };
}

export function canTransition(state, eventType) {
  return Boolean(transitions[state]?.[eventType]);
}

export function applyLifecycleEvent(snapshot, event) {
  if (!snapshot || !event?.event_id || !event?.event_type) {
    return { ok: false, code: "INVALID_EVENT" };
  }
  if (event.tenant_id && snapshot.tenant_id && event.tenant_id !== snapshot.tenant_id) {
    return { ok: false, code: "TENANT_SCOPE_MISMATCH" };
  }
  if (event.sequence != null && snapshot.version != null && event.sequence <= snapshot.version) {
    return { ok: false, code: "STALE_EVENT", state: snapshot.state, version: snapshot.version };
  }
  const result = transitionLifecycle(snapshot.state, event.event_type);
  if (!result.ok) return result;
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      state: result.to,
      version: event.sequence ?? ((snapshot.version ?? 0) + 1),
      last_event_id: event.event_id,
      last_event_at: event.occurred_at ?? null
    }
  };
}