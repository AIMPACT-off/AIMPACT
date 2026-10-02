# AIMPACT Audit Bot — P0 Product Specification

## User flow
1. Customer submits industry, company size, current tools, workflow bottleneck, monthly volume, current labor time/cost, error baseline, desired outcome and contact/consent.
2. Intake validator checks required fields, units, data minimization and consent.
3. Analysis maps the problem to verified AI capabilities and reviewed workflow templates only. Unverified catalog records are excluded from recommendations.
4. ROI engine produces scenario ranges only when baseline inputs and assumptions are supplied. Unknown values remain NOT_MEASURED; no fabricated savings.
5. Report generator creates a web report first; PDF export and email delivery are subsequent adapters. Human review is required before external delivery in P0.
6. CTA offers a scoped paid pilot with baseline, success criteria, data access and approval boundaries.

## Report contract
- Customer/problem summary and source inputs
- Current-state baseline and data-quality warnings
- Candidate workflow, required integrations and verification evidence
- T_saved_hours, C_saved with currency, E_reduced_pct with denominator
- Low/base/high scenarios, explicit assumptions, confidence and exclusions
- Security/privacy risks, human approval points and rollback plan
- Pilot scope, duration, fees and measurable acceptance criteria

## P0 non-goals
- No autonomous production changes, payments, refunds, customer messaging or destructive actions.
- No claim that the report is a fully automated five-minute service until latency and quality tests demonstrate it.
- No use of unverified AI Tool records as proven capabilities.
- No email/Slack dispatch before sender identity, consent, tenant authorization and delivery logging are implemented.

## Acceptance tests
- Required-field and consent validation
- Deterministic ROI fixtures including zero baseline, missing values and currency mismatch
- Provenance attached to every recommendation
- Unknown/unverified capability excluded
- Human approval required for report delivery
- Report reproducible from stored input/versioned assumptions
