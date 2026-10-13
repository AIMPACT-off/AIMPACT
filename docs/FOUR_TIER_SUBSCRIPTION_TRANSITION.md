# AIMPACT Four-Tier Subscription & Existing-Customer Transition
Version: 1.0
Status: PROPOSED — documentation only; production billing behavior is unchanged
Owner: AIMPACT principal
Last updated: 2026-10-11

## 1. Decision
Keep the existing AIMPACT product and customer/payment records as the source of truth. Introduce four planned subscription levels:
1. BEIGE
2. PREMIUM
3. VIP
4. PLATINUM

Do not create duplicate customers, reset existing entitlements, or change a customer's paid plan without an approved migration and clear customer notice/consent where required.

## 2. Existing-subscriber transition
- Offer existing subscribers a one-time **30-calendar-day complimentary diagnostic period** after the transition launch date is explicitly approved and recorded.
- The complimentary period covers diagnosis and a written findings report, not unlimited implementation, third-party usage fees, or a promise of savings.
- Keep each customer's current paid subscription and renewal settings unchanged during the transition unless the customer affirmatively selects a new plan or applicable terms require otherwise.
- Before the complimentary period begins, record the customer/tenant ID, current plan, start/end dates, eligible deliverables, consent/notice status, and responsible reviewer.
- At least 7 days before the complimentary period ends, notify the customer of the proposed tier, price, included limits, renewal date, and cancellation/change path.
- Do not automatically charge a new or higher price based solely on the end of the complimentary period. Require an explicit plan selection/approval and provider-confirmed billing state.
- If a customer is not mapped to a verified customer and payment record, mark the case NEEDS_REVIEW; do not guess.

## 3. Planned tier packaging
Prices are intentionally **TBD** until unit costs, actual delivery scope, payment-provider configuration, and target margins are reviewed. Never display a placeholder as a live price.

### BEIGE — Essentials
- Initial business/workflow diagnosis.
- Basic findings report and prioritized improvement opportunities.
- Defined usage limits and standard turnaround to be set before launch.
- No production implementation included unless separately quoted.

### PREMIUM — Growth
- Everything in BEIGE.
- Recurring workflow review and an improvement-priority plan.
- Measurement plan for time, rework, operating cost, and adoption.
- Automation usage and support limits must be defined before launch.

### VIP — Advanced Operations
- Everything in PREMIUM.
- More frequent review, prioritized recommendations, and operational follow-up.
- Named support/response expectations must be staffed and verified before being advertised.
- No guaranteed savings or unmeasured outcomes.

### PLATINUM — Enterprise Control
- Tailored multi-workflow assessment and governance review.
- Agreed measurement cadence, exception review, and implementation roadmap.
- Integrations, service levels, data retention, security scope, and human support must be contractually scoped.
- No 24/7 support, unlimited implementation, or guaranteed business outcomes unless explicitly resourced, contracted, and measured.

## 4. Price-setting gate
Before publishing any tier prices, record and approve:
- Monthly delivery cost per tier, including AI/API, hosting, payment fees, support labor, and monitoring.
- Included audits, workflows, seats, usage caps, support response, and overage policy.
- Gross-margin target and minimum viable price.
- Monthly vs annual billing, taxes, cancellation, refund, and renewal terms.
- Existing-customer mapping and grandfathering rules.
- Payment provider product/price IDs and successful sandbox checkout → verified webhook → ledger → entitlement → cancellation/refund tests.

No cost data means no margin claim. No provider verification means no live-billing claim.

## 5. Product and entitlement model
Recommended stable plan keys:
- `beige`
- `premium`
- `vip`
- `platinum`

Every entitlement must be linked to a verified customer/tenant and a provider-confirmed subscription or an explicitly approved complimentary grant. Store plan key, status, start/end, source transaction/grant ID, policy version, idempotency key, and audit timestamps.

Suggested states:
`PENDING → ACTIVE → PAST_DUE / CANCELED / EXPIRED`
Complimentary access must be separately labeled `COMPLIMENTARY_DIAGNOSTIC`; it must not masquerade as a paid subscription.

## 6. Release and safety gates
1. Inventory existing plans, customer IDs, payment records, entitlement rows, and current product/price IDs.
2. Add the tier catalog and migration tests without changing live customer billing.
3. Verify tenant isolation and that one tenant cannot see another tenant's diagnostics or entitlements.
4. Test complimentary grant expiry, duplicate webhook/idempotency, upgrade/downgrade, failed payment, cancellation, and refund.
5. Test end-to-end using a disposable test tenant and provider sandbox.
6. Obtain explicit approval for launch date, final prices, customer notice, and production migration.
7. Deploy only after CI, payment E2E, and rollback checks pass; then verify production records.

## 7. Truth labels
- This file is a proposed policy, not a deployed subscription feature.
- A successful build is not proof of checkout or entitlement behavior.
- A mock payment is not a provider-confirmed transaction.
- Do not claim customers received free diagnostics, plan prices changed, or billing was updated until the corresponding production event and audit record exist.
