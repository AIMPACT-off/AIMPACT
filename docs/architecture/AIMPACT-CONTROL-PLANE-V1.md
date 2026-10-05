# AIMPACT Control Plane V1 — Customer State & Lifecycle Contract

Status: ARCHITECTURE BASELINE / CODE NOT YET EXECUTED
Scope: Phase 2+ internal architecture. Production remains FROZEN.

## 1. Objective

AIMPACT is operated as a centralized AI Business Operating System.

Core loop:

EVENT -> STATE -> POLICY/GATE -> ACTION -> RESULT -> LEARNING

Portal, Auth, Diagnosis, Billing, Workflow, Outcome and ROI are modules under one Control Plane. A blocked external integration test must never become a reason to stop unrelated deterministic development.

## 2. Canonical Customer State

The Control Plane owns the authoritative lifecycle projection for each tenant/customer.

~~~text
identity
  user_id
  tenant_id
  membership_role
  membership_status

lifecycle
  stage
  stage_status
  stage_updated_at

diagnosis
  submission_id
  review_status
  report_status

commercial
  plan
  entitlement_status
  current_period_end

execution
  workflow_id
  workflow_status
  current_step
  retry_count
  dlq_status

outcome
  outcome_status
  verification_status
  baseline
  current
  roi_status

system
  last_event_id
  last_event_at
  version
  health
~~~

This projection is a control/read model. Existing domain tables remain the source of record until an explicit migration proves otherwise.

## 3. Lifecycle State Machine

Canonical customer stages:

~~~text
LEAD -> ONBOARDING -> DIAGNOSIS -> REVIEW -> APPROVED -> READY -> ACTIVE -> OUTCOME -> RENEWAL -> COMPLETED

Terminal/exception states:
BLOCKED | SUSPENDED | CANCELED | FAILED
~~~

State transitions must be explicit. No UI-only transition may create a business state that the server cannot reproduce or validate.

### Required transition examples

~~~text
tenant.created
  ONBOARDING

diagnosis.submitted
  ONBOARDING -> DIAGNOSIS

diagnosis.review.approved
  DIAGNOSIS/REVIEW -> APPROVED

entitlement.active + approved diagnosis
  APPROVED -> READY

workflow.started
  READY -> ACTIVE

outcome.submitted
  ACTIVE -> OUTCOME

outcome.verified
  OUTCOME -> RENEWAL

subscription.canceled
  any eligible commercial state -> CANCELED
~~~

## 4. Event Contract

Every Control Plane event must have:

~~~text
event_id
event_type
occurred_at
tenant_id
actor_type
actor_id (nullable for system events)
correlation_id
causation_id (nullable)
schema_version
payload
~~~

Rules:
1. event_id is idempotency key for event processing.
2. tenant_id is mandatory for tenant-scoped events.
3. payload never contains secrets.
4. events are append-oriented; corrections are new events.
5. consumers must be safe to retry.
6. stale/out-of-order events must not regress authoritative state.
7. every action must be auditable.

## 5. Policy / Gate Engine

Policies decide whether an action is allowed.

Example:

~~~text
START_WORKFLOW =
  authenticated
  AND active_membership
  AND approved_report
  AND approved_review
  AND active_entitlement
  AND lifecycle_state in {READY}
~~~

Gate result vocabulary:

ALLOW | DENY | HOLD | NOT_VERIFIED

`NOT_VERIFIED` is not `DENY`; it means required evidence is absent.

This preserves the existing fail-closed security model without conflating external-test availability with business state.

## 6. Execution Model

All asynchronous business work follows:

~~~text
COMMAND -> IDEMPOTENCY -> JOB -> CLAIM -> EXECUTE -> RETRY -> SUCCESS | FAILED -> DLQ -> OUTCOME
~~~

Existing idempotency, retry and DLQ mechanisms become Control Plane execution infrastructure.

## 7. Module Boundaries

### Identity
Auth, tenant, membership, role and permission.

### Diagnosis Engine
Submission, review, approval and report.

### Revenue Engine
Stripe events, billing ledger and entitlement.

### Workflow Engine
Workflow definition, run state, step execution and retry.

### Outcome Engine
Baseline/current metrics, verification and ROI.

### Intelligence Loop
Aggregated permissioned outcomes -> learning signals -> better diagnosis/workflow recommendations.

No module may bypass Control Plane policy for a protected business action.

## 8. Control Plane Invariants

1. Browser clients never hold service-role credentials.
2. Production secrets never enter source, fixtures or chat.
3. Tenant isolation is enforced server-side and at DB/RLS boundaries.
4. Payment events never directly grant browser permissions; they update trusted entitlement state.
5. Workflow execution requires policy evaluation.
6. Outcome data is unverified until an explicit verification path marks it verified.
7. Idempotent events/actions must be safe to replay.
8. stale events cannot roll state backward.
9. every protected transition produces auditable evidence.
10. Production remains independently gated from TEST evidence.

## 9. Development Strategy

Workstreams are independently executable:

~~~text
A  Control Plane / State Model
B  Identity + Tenant
C  Diagnosis + Review
D  Billing + Entitlement
E  Workflow + Execution
F  Outcome + ROI
G  Observability + Audit
H  External Auth/Billing Verification
~~~

H may be BLOCKED by external test infrastructure without blocking A, E, F, or deterministic portions of G.

## 10. Evidence Discipline

Use four distinct labels:

CODE EXISTS
TEST EXECUTED
TEST PASSED
PRODUCTION VERIFIED

Architecture/specification is not runtime verification.

Current external secret state remains:
G1-A NOT VERIFIED.

Production remains:
FROZEN.

## 11. V1 Acceptance Shape

AIMPACT V1 is operationally coherent when one tenant can move through:

CUSTOMER -> TENANT -> AUTH -> DIAGNOSIS -> REVIEW -> APPROVAL -> PAYMENT -> ENTITLEMENT -> WORKFLOW -> OUTCOME -> ROI -> RENEWAL

with the Control Plane able to answer at every point:

1. Who is this?
2. Which tenant?
3. What state are they in?
4. What evidence exists?
5. What action is allowed?
6. What is executing?
7. What happened?
8. What is the next action?

This document defines the architecture contract. It does not by itself claim any runtime or production PASS.