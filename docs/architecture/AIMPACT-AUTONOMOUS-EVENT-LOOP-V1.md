# AIMPACT Autonomous Event Loop V1 — Session-Independent Control Plane

Status: ARCHITECTURE PROPOSAL / CODE NOT YET EXECUTED
Scope: Development branch only. Production remains FROZEN.

## 1. Purpose
AIMPACT evolves from a session-driven workflow into an event-driven operating system.
Target loop: GITHUB WEBHOOK / SYSTEM EVENT -> EVENT INGESTION -> STATE DETECTION -> POLICY / GATE -> SAFE ACTION -> TEST / CI -> EVIDENCE -> STATE UPDATE -> NEXT ELIGIBLE ACTION.
The ChatGPT session is not the source of truth. Durable system state and CI evidence are.

## 2. Control Plane Responsibilities
- ingest signed events
- normalize and deduplicate events
- resolve repository, environment and gate state
- execute only allowlisted actions
- persist intent before asynchronous execution
- collect durable evidence
- update gate state only from verified evidence
- stop at HUMAN_APPROVAL_REQUIRED boundaries
Never print or persist secrets, infer PASS from code existence, bypass failed gates, or modify Production while FROZEN.

## 3. Event Contract
Minimum envelope: event_id, event_type, occurred_at, source, repository, ref, commit_sha, correlation_id, causation_id, schema_version, payload.
Event classes: CI_RUN_COMPLETED, CI_RUN_FAILED, SECRET_GATE_CHANGED, TEST_ENV_READY, GATE_RECHECK_REQUESTED, HUMAN_APPROVAL_GRANTED, PRODUCTION_GATE_CHANGED.
Webhook signatures must be verified before acceptance.

## 4. State Machine
OBSERVED -> ELIGIBLE -> DISPATCHED -> RUNNING -> EVIDENCE_PENDING -> PASSED -> NEXT_ACTION_READY.
Failure states: BLOCKED, RETRY_PENDING, FAILED, QUARANTINED, HUMAN_APPROVAL_REQUIRED, FROZEN.
State transitions require an event plus policy evaluation. Chat messages cannot directly promote a gate.

## 5. Gate Model
Each gate contains gate_id, scope, required_evidence, policy, status, version, last_evidence_id and updated_at.
Statuses: NOT_READY, READY, RUNNING, PASSED, BLOCKED, NOT_VERIFIED, HUMAN_APPROVAL_REQUIRED, FROZEN.
Secret values are never stored in Control Plane state; only safe readiness metadata may be recorded.

## 6. Action Policy
Allowlisted actions include RUN_CI, RETRY_CI, COLLECT_EVIDENCE, RECHECK_GATE, CREATE_EXECUTION_INTENT, CLAIM_EXECUTION_INTENT, COMPLETE_EXECUTION_INTENT, RETRY_EXECUTION_INTENT and QUARANTINE_DLQ.
Secret creation, Production activation, live payment, Production migration/deploy and authority-expanding policy changes require human approval.

## 7. CI as Evidence Source
CI is an evidence producer, not an authority by itself.
Evidence should normalize run_id, job_id, commit_sha, workflow, status, conclusion, test_summary, failure_class, artifact_reference and observed_at.
Promotion: CODE EXISTS -> TEST EXECUTED -> TEST PASSED -> INTEGRATED -> COMMERCIAL LOOP VERIFIED -> PRODUCTION VERIFIED.
Missing external credentials are classified as EXTERNAL_DEPENDENCY_BLOCKED, not APPLICATION_FAILURE.

## 8. Autonomous Recovery
Retryable failure: FAILED -> POLICY CHECK -> RETRY_PENDING -> EXECUTION_OUTBOX -> CLAIM / LEASE -> CI -> EVIDENCE.
After the configured attempt limit: FAILED -> DLQ -> HUMAN_REVIEW_REQUIRED.
Existing Outbox, Claim, Retry, DLQ, Action Ledger and Learning Loop components are the durability layer.

## 9. Human Boundary
Human intervention is required only for secret creation/rotation, Production activation, live financial actions, authority-expanding policy changes, and quarantined failures requiring business judgment.
The Control Plane emits one durable HUMAN_APPROVAL_REQUIRED state rather than repeatedly asking the same question.

## 10. Learning
Completed actions produce ACTION_OUTCOME, ACTION_FAILURE, ACTION_REPLAY or POLICY_BLOCK signals.
Learning improves failure classification, retry policy, evidence collection, action selection and operational prioritization. Learning never mutates gate status directly.

## 11. Security Invariants
1. Webhook signatures are verified before ingestion.
2. Secrets never enter source, event payloads, logs, fixtures or learning signals.
3. Service-role credentials remain server-side.
4. Tenant-scoped events require tenant identity.
5. Idempotency is mandatory for event and action processing.
6. Production is a separate authority domain.
7. TEST evidence cannot promote Production automatically.
8. Every autonomous action is auditable.
9. Unknown events fail closed.
10. Policy errors fail closed.

## 12. Commercial Orchestration Target
SECRET_GATE_CHANGED -> RECHECK_AUTH_G1 -> AUTH_G1 PASSED -> RECHECK_BILLING_G1 -> BILLING_G1 PASSED -> TENANT_ISOLATION_FINAL -> COMMERCIAL_LOOP_READY.
Commercial Loop remains blocked until every required gate has explicit evidence.

## 13. Implementation Sequence
Phase A — Event ingestion contract
Phase B — Gate state persistence
Phase C — Evidence collector
Phase D — Autonomous dispatcher
Phase E — Human approval boundary
Phase F — GitHub webhook integration
Phase G — Commercial-loop orchestration
Phase H — Production gate integration

This document is an architecture baseline. It does not claim runtime or production verification.