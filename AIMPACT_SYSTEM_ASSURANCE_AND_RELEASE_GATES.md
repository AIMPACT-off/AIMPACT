# AIMPACT System Assurance & Release Gates
Date: 2026-10-02
Status: normative engineering contract; implementation status is tracked separately.

## 1. Product invariant
AIMPACT is an evidence-led business intelligence and execution system. It must connect:
Business problem -> evidence -> capability selection -> decision -> policy authorization -> workflow execution -> measured outcome -> controlled learning.
A directory listing, generated workflow draft, successful unit test, or architecture document is not proof that this loop works.

## 2. Truthful release states
Every capability must carry one state:
- SPECIFIED: requirements and acceptance tests exist.
- IMPLEMENTED: production-path code exists.
- UNIT_VERIFIED: deterministic tests pass.
- INTEGRATION_VERIFIED: real service/database/provider integration tests pass.
- STAGING_VERIFIED: end-to-end staging test and operational telemetry pass.
- PRODUCTION_ENABLED: explicitly enabled with owner, rollback, monitoring and incident runbook.
Never promote a state based on documentation or mocks alone.

## 3. Mandatory execution contract
Every workflow execution must have:
- authenticated actor, tenant, purpose, workflow/version and correlation ID;
- validated, versioned input/output schemas and bounded payload sizes;
- policy decision with rule/version and approval evidence;
- durable idempotency key with atomic uniqueness at the persistence layer;
- explicit dry-run/sandbox/production mode;
- durable state transitions and lease/lock semantics;
- bounded retries, exponential backoff with jitter, deadline, circuit breaker and dead-letter handling;
- compensation or documented irreversibility for each side effect;
- append-only audit record, redacted inputs/outputs and secret-free logs;
- postcondition verification, outcome measurement and failure classification.
A process-local map, in-memory limiter, callback stub, or client-side draft is not a production execution guarantee.

## 4. Decision and AI evidence contract
Every decision record must capture:
- business problem and measurable objective;
- candidate models/providers/capabilities and version/region;
- evidence source, observed timestamp, freshness and provenance;
- price/quota/latency/terms/retention constraints where relevant;
- evaluation dataset/version, benchmark method, limitations and uncertainty;
- selected option and rejected alternatives with reasons;
- calibrated confidence or explicit abstention;
- policy result and human approval where required.
LLM self-reported confidence is not calibration. Production routing must be evaluated against held-out, representative tasks and observed outcomes. Insufficient or stale evidence must trigger abstention or human review.

## 5. Security and privacy gates
- Tenant isolation must be tested with adversarial cross-tenant read/write attempts for every exposed table, view, RPC, storage bucket and execution endpoint.
- Verify RLS policies, grants, SECURITY DEFINER functions, search_path, FK ownership and service-role boundaries from the live schema.
- No service-role credential in browser bundles, client storage, URLs or logs.
- Enforce least privilege, purpose limitation, retention/deletion, encryption in transit/at rest and audited secret access.
- Tenant data must never enter shared training or cross-tenant retrieval without explicit lawful basis, authorization and documented controls.
- Prompt injection is handled through trust-boundary separation, constrained tools, schema validation and authorization—not keyword filters alone.
- External side effects require policy authorization, replay protection, idempotency and audit.
- Threat model covers account compromise, confused deputy, SSRF, injection, data exfiltration, replay, race conditions, provider compromise and supply-chain risk.

## 6. Audit and evidence integrity
- Audit events are append-only at the application/database permission layer.
- Hash-chain verification is continuously tested; chain sequence and concurrency behavior are tested under parallel inserts.
- Hash chaining alone is not immutable storage. Periodically anchor signed checkpoints to independently administered retention-locked storage; verify restore and tamper detection.
- Every evidence item has source, timestamp, actor/system, version, integrity digest and retention classification.
- Clock skew, missing events, duplicate events and partial failure have explicit handling.

## 7. Outcome and learning gates
- Baseline, measurement window, sample size, metric definition, attribution method and evidence reference are mandatory for measured ROI.
- Estimates must remain visibly distinct from measured outcomes; missing values are unknown, never zero.
- Outcome records are tenant-scoped and independently reviewable.
- Learning pipeline must reject poisoned, duplicate, low-quality and unauthorized records.
- Model changes require offline evaluation, regression and subgroup checks, canary/shadow evaluation, rollback and human release approval.
- No online self-modification of production decision policy or model weights without an approved release process.

## 8. Operational resilience gates
- Durable queue/outbox, worker leases, idempotent handlers and dead-letter replay.
- Per-tenant and global concurrency/rate limits backed by shared durable storage.
- Circuit breakers and provider health are distributed, observable and tested under partial outage.
- SLOs for availability, latency, correctness, cost and recovery are defined before production.
- Alerts cover queue age, failure rate, provider drift, policy denials, tenant-isolation anomalies, audit-chain failures and outcome-quality degradation.
- Kill switch, rollback, backup/restore and incident drills are demonstrated in staging.

## 9. Required end-to-end acceptance scenario
In an isolated staging tenant:
1. Submit a real business problem with explicit consent and measurable baseline.
2. Generate an evidence-backed recommendation from current provider capability records.
3. Reject stale/insufficient evidence and require review.
4. Produce a dry-run with a complete plan, cost bound and side-effect inventory.
5. Require human approval for a high-impact action.
6. Execute a sandbox workflow through a durable queue and provider adapter.
7. Replay the same request and prove no duplicate side effect.
8. Inject provider timeout, worker crash and partial completion; prove retry/compensation and recovery.
9. Verify tenant B cannot read or mutate tenant A records.
10. Verify audit chain, external checkpoint and tamper detection.
11. Measure outcome against baseline and preserve provenance.
12. Show dashboard status from persisted records, not hard-coded or client-derived values.

## 10. Current repository facts at adoption
The inspected frontend is a static client that queries Supabase, displays verified tools/workflows, creates client-side workflow drafts and submits leads/events. No real provider execution dispatcher or workflow runtime was found in the inspected app entry point.
Existing guard modules (decision guard, idempotency/saga, circuit breaker, model router, rate limiter, ROI evaluator and audit anchor) are foundations only until bound to durable adapters and the real execution path.
Supabase schema sync and tenant-isolation workflows are gated by repository variables/secrets; a workflow file existing does not mean the check has run.
The execution/outcome/audit migrations have not been verified as applied to the live database. Live workflow definitions and current RLS/grants remain unverified.
Do not enable production execution until the gates above are evidenced.

## 11. Release decision
A release is blocked if any critical gate is untested, any tenant boundary is uncertain, any external side effect can bypass policy/idempotency/audit, or rollback/recovery is not demonstrated. Record exceptions with owner, expiry, compensating control and explicit approval.
