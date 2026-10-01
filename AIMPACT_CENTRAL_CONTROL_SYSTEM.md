# AIMPACT CENTRAL CONTROL SYSTEM

## Purpose
AIMPACT operates as one company, not a collection of disconnected tools.

The Central Control System is the control plane for company state, product state, data quality, tool verification, deployments, automations, incidents, customer operations, revenue, content/distribution, security, KPI and decision records.

The objective is controlled autonomy: automation performs approved, reversible, evidence-backed operations; high-impact decisions remain explicitly authorized.

## Authority Model
### Human Principal
**Kim Hyung Nam (김형남)** is the sole human business authority and final decision-maker for AIMPACT.

The system must never infer, fabricate, or silently transfer this authority to an AI agent, employee, automation, vendor, connected application, workflow, or customer.

AI may analyze, recommend, detect, prepare, test, and execute pre-authorized operational actions. AI does not become the legal/business principal.

### Decision classes
**D0 — Autonomous / reversible**
- retries, cache refresh, health checks, duplicate-safe synchronization
- indexing, logging, alerting, report generation, non-destructive validation

**D1 — Autonomous within approved policy**
- routine data normalization
- approved workflow execution
- scheduled content distribution
- approved tool re-checks
- routine reversible incident containment

**D2 — Human approval required**
- production changes with material risk
- canonical business-data changes
- customer-impacting changes
- pricing/offer changes
- external commitments
- destructive operations
- security-policy changes
- financial actions

**D3 — Principal-only decision**
- ownership/governance changes
- legal commitments
- billing/plan changes
- material capital allocation
- strategic direction
- new revenue model
- acquisition/partnership commitments
- transfer of authority

D2/D3 actions must stop and request explicit authorization rather than guessing.

## Central State
The control plane should expose one consistent company state:

COMPANY → PRODUCT → DATA → AUTOMATION → INCIDENT → CUSTOMER → REVENUE → OUTCOME

Required state categories:
- FACT
- HYPOTHESIS
- VERIFIED
- BLOCKED
- APPROVAL_REQUIRED
- FAILED
- RECOVERING
- LIVE

No component may claim VERIFIED from an unverified dependency.

## Control Loop
Every important automated operation follows:

INTENT → POLICY CHECK → PRECONDITION CHECK → EXECUTE → OBSERVE → VALIDATE → LOG → UPDATE STATE → ALERT IF EXCEPTION → ROLLBACK/CONTAIN IF SAFE → HUMAN APPROVAL IF REQUIRED

No silent failure.

## Error Control
Errors are central-system signals, not isolated tickets.

DETECT → CLASSIFY → CORRELATE → ROOT CAUSE → CONTAIN → FIX → REGRESSION TEST → DEPLOY → VERIFY → CLOSE → KNOWLEDGE

Root cause labels:
- VERIFIED
- HYPOTHESIS
- UNKNOWN

A hypothesis must never be presented as a verified cause.

## Single Control Principles
1. One canonical identity per business entity.
2. Every sync is idempotent.
3. No blind overwrite.
4. No destructive operation without policy authorization.
5. No production claim without production evidence.
6. No verified tool without current evidence.
7. No revenue claim without a recorded transaction.
8. No customer claim without an actual customer record.
9. No case study without documented outcome evidence.
10. Every material change creates an audit record.
11. Every automation has an owner, trigger, permission scope, timeout, failure path, and observable result.
12. Every external dependency has health monitoring.
13. Every critical path has a fallback or explicit BLOCKED state.

## System-of-Record Direction
The control plane must distinguish:
- Source of truth: authoritative record for a domain
- Operational mirror: synchronized copy
- Derived metric: calculated state
- External dependency: vendor/runtime state

No system should silently become a second source of truth.

## Security
Least privilege is mandatory. Credentials and service-role secrets must never be exposed to browser code.

Automation permissions must be scoped to the minimum action set.

Sensitive operations require authenticated principal, explicit authorization, audit log, and result verification.

## Recovery
Safe autonomous recovery may include retry, backoff, refresh, re-index, re-run validation, and restart of an approved idempotent job.

If recovery could cause financial loss, destructive data mutation, customer harm, security exposure, or legal/contractual commitment, the system must enter APPROVAL_REQUIRED.

## Certification Gate
AIMPACT is not CERTIFIED merely because components exist.

Certification requires evidence that:
1. central state is internally consistent
2. production is reachable
3. core customer flow works
4. data lineage is traceable
5. automation failure paths are observable
6. incident handling is connected to remediation
7. security controls are verified
8. KPI values derive from controlled data
9. high-impact actions enforce authorization
10. recovery and regression verification work

Until then, state remains NOT_CERTIFIED.

## North Star
One company. One control plane. Observable automation. Explicit authority. Evidence before claims.

The engineering goal is not an impossible promise of zero errors. It is:

prevent → detect → contain → recover → learn → prevent recurrence.
