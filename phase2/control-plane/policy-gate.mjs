export const GATE_DECISIONS = Object.freeze(["ALLOW","DENY","HOLD","NOT_VERIFIED"]);

const REQUIRED = Object.freeze({
  START_WORKFLOW: ["authenticated","active_membership","approved_report","approved_review","active_entitlement","lifecycle_ready"],
  SUBMIT_OUTCOME: ["authenticated","active_membership","active_workflow","lifecycle_active"],
  RENEW_SUBSCRIPTION: ["authenticated","active_membership","renewal_state"]
});

function normalizeEvidence(evidence = {}) {
  return Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, value === true ? "PASS" : value]));
}

export function evaluateGate(action, context = {}) {
  if (!action || !REQUIRED[action]) return { decision: "DENY", code: "ACTION_NOT_SUPPORTED", action };

  if (!context.tenant_id) return { decision: "DENY", code: "TENANT_CONTEXT_REQUIRED", action };
  if (context.tenant_id !== context.evidence?.tenant_id) {
    return { decision: "DENY", code: "TENANT_SCOPE_MISMATCH", action };
  }

  const evidence = normalizeEvidence(context.evidence);
  const missing = REQUIRED[action].filter(key => evidence[key] == null);
  if (missing.length) return { decision: "NOT_VERIFIED", code: "EVIDENCE_MISSING", action, missing };

  const denied = REQUIRED[action].filter(key => ["FAIL", "DENY", "INACTIVE", "REJECTED", false].includes(evidence[key]));
  if (denied.length) return { decision: "DENY", code: "POLICY_REQUIREMENT_FAILED", action, failed: denied };

  const held = REQUIRED[action].filter(key => ["PENDING", "PROCESSING", "HOLD"].includes(evidence[key]));
  if (held.length) return { decision: "HOLD", code: "POLICY_REQUIREMENT_PENDING", action, pending: held };

  return { decision: "ALLOW", code: "POLICY_SATISFIED", action, satisfied: REQUIRED[action] };
}

export function canExecute(action, context = {}) {
  return evaluateGate(action, context).decision === "ALLOW";
}
