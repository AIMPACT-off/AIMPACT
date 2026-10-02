# AIMPACT Enterprise Architecture & Risk Controls

Implementation companion to AIMPACT_CORE_TECHNOLOGY_AND_MONETIZATION.md. This specification converts enterprise risks into mandatory controls, acceptance evidence, and release gates.



---

## 15. Enterprise Architecture Safeguards — Mandatory From Day One

The following controls are architecture requirements, not optional future enhancements.

### 15.1 Customer Execution Boundary, Legacy Integration & Human Approval

AIMPACT must not assume unrestricted access to a customer's ERP, CRM, HR, payment, inventory, or internal databases.

- Support API-first integration, plus webhook, controlled file exchange, and approved RPA adapters where APIs are unavailable.
- Provide sandbox and test-mode execution before production access.
- Default consequential actions to Human-in-the-loop approval: payments, refunds, price changes, customer-facing commitments, employee decisions, and destructive data operations.
- Use least-privilege scoped credentials, secret rotation, audit logs, idempotency keys, rate limits, and explicit customer authorization.
- Separate read, propose, approve, and execute permissions.
- Provide pause/kill switch, rollback or compensation path, retry policy, and dead-letter handling.
- Never call an integration supported until tested against the customer's actual environment.

Acceptance evidence: integration test, permission matrix, approval trace, rollback test, and customer sign-off for production activation.

### 15.2 AI Capability Verification & Freshness Automation

Every volatile capability record must include source/provider, evidence capture time, last verified and next due times, model/API version, region, pricing unit/tier/currency/effective date, quotas, rate limits, context limits, API availability, integration method, commercial-use terms, benchmark method/results, latency/failure observations, confidence, and reviewer status.

Automated checks should monitor provider status, documentation/pricing changes, endpoint health, version deprecations, and quota changes where technically and legally permitted. Monitoring is a signal, not proof of suitability. Material changes require evidence review and regression benchmarks. Expired or conflicting evidence must become stale/needs-review and block unsupported recommendations.

Acceptance evidence: timestamped source snapshots, scheduled health checks, change alerts, benchmark runs, and stale-record gating tests.

### 15.3 Productized AI Audit — Prevent the Consulting Trap

Standardize intake, process maps, stakeholder roles, baseline KPI and data quality, opportunity scoring, AI readiness, security/integration/risk checks, workflow and human-control map, implementation effort and TCO, pilot charter, and final evidence pack.

Automate intake normalization, document extraction, process classification, draft analysis, and report assembly. Keep expert review for assumptions, risk, feasibility, and customer-facing conclusions. Do not claim an 80% labor reduction until measured across a documented sample.

Acceptance evidence: versioned templates, time-on-task baseline, repeatability test across multiple cases, and reviewer sign-off.

### 15.4 Outcome Measurement, Safety, SLA & Liability

Agree measurement before each pilot: baseline and post period, source, numerator/denominator, units, exclusions, calculation, time/cost saved, error/exception rate, throughput, revenue/conversion where relevant, human review/override/failure rates, attribution limits, owner, cadence, and acceptance threshold.

Do not publish improvements without reproducible calculations and source evidence. Distinguish observed correlation from causal impact.

Require risk-tiered approvals, validation thresholds, human/deterministic fallback, pre-production and regression tests, monitoring, incident response, fail-closed behavior for high-impact ambiguity, rollback/compensation, and contract-specific service hours, response targets, recovery objectives, escalation and exclusions. Contractual responsibility and liability terms require qualified legal review.

Acceptance evidence: signed KPI charter, test results, incident playbook, fallback/rollback exercise, and approved service terms.

### 15.5 Control Plane / Customer Data & Execution Plane Separation

Separate AIMPACT's internal control plane from each customer's data and execution plane logically and, where required, physically.

Control Plane: AIMPACT operations, product catalogue, tenant provisioning, policy, billing, approvals, incident coordination, aggregate health. No routine raw customer payload access.

Customer Plane: tenant-isolated data stores, credentials, workflow runtime, logs and customer-specific decision context; customer-controlled deployment/data residency where required; encryption, tenant-scoped authorization, audit, retention/deletion, backup and incident containment.

Privacy controls: data minimization, purpose limitation, explicit authorization, tenant-isolation tests, access audit, retention and verified deletion, de-identification risk assessment (pseudonymization is not anonymization), and no cross-tenant training/reuse of identifiable data without explicit legal basis and authorization. Only approved minimized outcome metadata may enter shared learning.

Acceptance evidence: threat model, data-flow diagram, tenant isolation tests, access audit, deletion test, and data-processing terms.

---

## 16. Revised Build Sequence & Release Gates

### Phase 0 — Existing-System & Architecture Audit
Inventory code, data, integrations, secrets, workflows, deployment and actual runtime behavior. Reuse working components.

Gate: verified architecture map, risk register, evidence-backed baseline.

### Phase 1 — Control Plane + Standardized Audit Kit
Establish tenant/permission boundaries, approval/audit trail, operational state model, and repeatable diagnostic intake.

Gate: tenant and role tests, audit repeatability, baseline measurement.

### Phase 2 — AI Capability Auto-Verification
Implement provenance, freshness lifecycle, provider health/pricing monitoring, benchmarks, and stale-evidence gating.

Gate: change detection, provider failure handling, traceability, recommendation-blocking tests.

### Phase 3 — Customer-Isolated Human-in-the-Loop Runtime
Build sandbox-first integrations, scoped credentials, approval gates, risk tiers, retries, rollback/fallback and incident controls.

Gate: sandbox integration, approval trace, kill-switch/recovery exercise, customer production authorization.

### Phase 4 — Outcome Metric Standard & Privacy-Preserving Learning
Implement KPI contracts, before/after measurement, attribution notes, minimized outcome events, tenant isolation and approved aggregate learning.

Gate: reproducible metric calculation, privacy review, access/deletion tests, no cross-tenant leakage.

### Phase 5 — Decision Engine & Productization
Only after verified capability, safe execution, and measured outcome data exist, improve recommendations and productize repeatable delivery.

Gate: benchmarked decision quality, explainable evidence, measured customer value, repeatable delivery economics.

### Non-Negotiable Release Rules
- No production write access without explicit customer authorization and scoped credentials.
- No high-impact autonomous action without approved risk policy and human gate.
- No capability marked verified without current, traceable evidence.
- No ROI claim without agreed baseline and reproducible measurement.
- No shared learning from customer data without approved purpose, privacy controls, and contractual/legal basis.
- No paid infrastructure/API usage or production-risk change without Principal approval.
- A phase is complete only when acceptance evidence exists and tests pass; documentation alone is not implementation.
