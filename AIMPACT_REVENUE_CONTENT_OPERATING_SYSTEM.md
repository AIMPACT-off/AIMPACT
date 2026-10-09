# AIMPACT Revenue & Content Operating System
Version: 1.0
Status: PROPOSED STANDARD — operational claims require live evidence

## 0. Commercial promise
**WE DON'T SELL AI. WE TURN BUSINESS PROBLEMS INTO MEASURABLE OUTCOMES.**

AIMPACT sells a structured business-workflow diagnosis and, only where appropriate, implementation and ongoing measurement. It does not promise savings before baseline measurement.

## 1. One funnel, one source of truth
`RESEARCH → EVIDENCE → BUSINESS PROBLEM → CONTENT/DECK → LANDING → LEAD → QUALIFICATION → QUICK AUDIT → IMPLEMENTATION → MEASURED OUTCOME → RETAINER/SUBSCRIPTION`

- GitHub: product source, versioned operating standards and code.
- Supabase: production product data, authenticated customer/payment/entitlement records and event data.
- Airtable: internal research, review and operating pipeline unless an explicitly approved sync establishes another owner.
- Notion CRM: sales source of truth only if the actual workspace/database is connected and verified. Until then, no claim that CRM was updated.
- Payment provider: payment status source for its transaction; Supabase records the verified, idempotent business ledger and entitlement result.
- Content platform: actual post/reel status and analytics source. Drafting is not publishing; scheduled is not published.

## 2. Premium Company Deck — buyer decision sequence
Recommended 10-slide order:
1. **Cover:** AIMPACT / AI CURATES THE FUTURE / business outcomes, not AI hype.
2. **The operating problem:** manual work, fragmented tools, slow handoffs, inconsistent reporting. Present as hypotheses until client-confirmed.
3. **Cost of the current state:** baseline hours × loaded hourly cost + rework cost + documented lost contribution. Mark unknown inputs as unknown.
4. **Workflow diagnosis:** trigger → people/tools → handoffs → bottlenecks → exceptions → control points.
5. **Opportunity map:** automate / assist / keep human-controlled, with confidence and risk.
6. **Target workflow:** current vs proposed flow, integrations, approval points, exception handling and audit trail.
7. **Measurement plan:** baseline, pilot period, owner, data source, success threshold agreed before implementation.
8. **Delivery plan:** discover → map → prioritize → prototype → test → controlled rollout → monitor.
9. **Governance:** privacy, access, human review, failure recovery, rollback and change log.
10. **Offer / CTA:** Quick Audit KRW 200,000; deliverables, exclusions, input requirements and next decision.

### Required ROI model (no invented benchmark)
- Monthly labor cost exposed = tasks/month × minutes/task ÷ 60 × loaded hourly cost.
- Recoverable labor value = monthly labor cost exposed × measured automation coverage × measured adoption rate.
- Rework cost = monthly rework count × average minutes/rework ÷ 60 × loaded hourly cost.
- Net monthly benefit = measured recoverable labor value + measured rework reduction value − recurring automation cost.
- Payback months = one-time implementation cost ÷ net monthly benefit, only if net monthly benefit > 0.
- ROI over period = (verified benefit − total cost) ÷ total cost × 100%.
Show assumptions and range; do not label recoverable labor as cash savings unless payroll, capacity use, or avoided spend evidence supports it.

## 3. Quick Audit offer control
- Canonical price: **KRW 200,000** (confirm provider/catalog at runtime before accepting payment).
- Deliverables: current-workflow map; top automation candidates ranked by impact, feasibility, risk; data/access requirements; recommended pilot; baseline/measurement plan.
- Not included unless separately agreed: production integration, guaranteed savings, legal/medical decisions, or unlimited implementation.
- Sales stages: Prospect → Contact Ready → Contacted → Responded → Discovery Booked → Proposal Sent → Won/Lost.
- Payment stages: Unpaid → Pending → Paid → Refunded/Disputed. Only verified provider confirmation can mark Paid.

## 4. Instagram content system
### Roles
- Profile/pinned company post: positioning, proof standard, offer/CTA.
- Carousel: diagnose one real business pain; show method and calculation; finish with an audit CTA.
- Reel: screen capture of the actual running product/workflow, with narration and visible test context. No fabricated dashboard, fake notifications, fake analytics or simulated customer results.
- Stories: process notes, questions, qualification and link clicks; no claim of 1M views or other performance without platform analytics evidence.

### Repeatable carousel skeleton (7 panels)
1. Specific problem in a business process.
2. Where the work enters the system.
3. Where time/errors/rework may accumulate.
4. What data is needed to verify the loss.
5. Proposed AI-assisted workflow and human checkpoint.
6. How success will be measured.
7. CTA: request a KRW 200,000 Quick Audit.

### Publishing quality gate
Check factual source, recency, permission/privacy, product build/commit, claim type (FACT/HYPOTHESIS/MEASURED), CTA destination, mobile legibility, captions/accessibility, UTM and approval. Draft → Reviewed → Approved → Scheduled → Published → Analytics captured. No state skipping.

## 5. Brand film (45–60 seconds)
- 0–5s: real business work queues and fragmented handoffs; on-screen: “Business problems are rarely solved by adding another tool.”
- 5–15s: identify a workflow and baseline. Use anonymized/sample data clearly labeled as sample.
- 15–30s: show the actual AIMPACT app or a verified running workflow; record build SHA and environment. Show input, decision, approval and result.
- 30–42s: show the measurement view only if that metric exists and is verified. Otherwise show the measurement plan, not invented results.
- 42–52s: show exception/human review and audit trail.
- 52–60s: “WE DON'T SELL AI. WE TURN BUSINESS PROBLEMS INTO MEASURABLE OUTCOMES.” CTA: Quick Audit — KRW 200,000.
Production rule: footage must be captured from the actual running version. Store capture date, app version/commit, environment and consent/privacy checklist. A simulator build is not proof of a live production dashboard.

## 6. Revenue attribution events
Minimum event names:
`page_view, content_click, workflow_start, audit_start, lead_submit, external_click, discovery_booked, proposal_sent, pilot_started, payment_confirmed, entitlement_granted, outcome_recorded, subscription_started, refund_recorded`.

Each event should include event_id (idempotency), timestamp, anonymous/session or authenticated user identifier where lawful, source, medium, campaign, content_id, product/offer ID, and correlation/order ID where relevant. Never put payment secrets or unnecessary personal data in analytics.

## 7. Automation contract
Every automation needs: owner, trigger, input schema, allowed actions, approval class, idempotency key, timeout, retry/backoff, failure state, alert destination, audit log and test evidence.
- D0/D1 reversible routine operations may run under approved policy.
- D2 customer-impacting changes, pricing, external commitments and financial actions require explicit approval.
- D3 governance/legal/strategic commitments require principal-only authorization.
- Posting, sending outbound sales messages, charging customers, issuing refunds, changing plans and granting production access are never inferred from a draft.

## 8. KPI definitions
- Content output: approved/published pieces, separately.
- Qualified lead: prospect meeting documented target and problem criteria, not a view or click.
- Proposal sent: delivery/send event or manually verified record.
- Paid audit: provider-confirmed payment and matching ledger record.
- Revenue: confirmed transaction net of refunds; never a target or forecast.
- Outcome: measured before/after with dates, data source, methodology and owner.
- Conversion: numerator/denominator and time window always shown.

## 9. Current readiness labels
Use one of: DRAFT, READY_FOR_REVIEW, APPROVAL_REQUIRED, SCHEDULED, PUBLISHED_VERIFIED, BLOCKED, FAILED, NOT_VERIFIED.
A document, plan, PR or mock test is not a live integration. A successful build is not a store release. A successful payment-control test is not a completed sandbox transaction.
