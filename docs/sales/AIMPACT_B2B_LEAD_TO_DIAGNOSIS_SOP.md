# AIMPACT B2B Lead → Diagnosis → Sales SOP

**Version:** 1.0 · 2026-10-04  
**Operating status:** Internal draft. Do not promise an automated response until a tested intake endpoint and mail delivery service are live.

## 1. Pipeline

1. **Lead received** — only after the intake endpoint is formally enabled; capture consent version/time and approved fields.
2. **Acknowledgement (target: within 10 business minutes)** — send the approved receipt email manually until automation is tested.
3. **Triage** — classify the request by business function, frequency, pain severity, systems involved, data sensitivity and decision owner.
4. **Async Audit** — send the questionnaire below; do not request passwords, API keys, payment data, employee/customer records or confidential source files.
5. **Discovery review** — map current steps, exceptions, systems, human approvals and baseline measures.
6. **Opportunity brief** — return 1–3 prioritized opportunities, assumptions, risks, estimated effort bands and a measurement plan. Do not invent ROI.
7. **Commercial proposal** — define scope, exclusions, deliverables, client responsibilities, timeline, price and acceptance criteria.
8. **Paid pilot** — execute only after written approval, access authorization and agreed data-processing/security controls.
9. **Outcome review** — compare actual baseline and post-implementation results; record evidence and lessons.

## 2. Acknowledgement email (manual until mail automation is verified)

**Subject:** [AIMPACT] Early Access request received — next steps

Hello {{first_name}},

Thank you for sharing your business challenge with AIMPACT.

We use a four-step approach:

- **DISCOVER** — understand the process and the actual operational constraint.
- **VERIFY** — check feasibility, data requirements and business fit.
- **COMPARE** — evaluate suitable AI tools and workflow options.
- **APPLY** — define a practical implementation path and success measures.

Our next step is to review the information you provided. If a deeper review is appropriate, we will send a short asynchronous questionnaire and arrange a conversation where useful.

AIMPACT is currently preparing its formal service launch. This acknowledgement does not constitute acceptance of a project, a delivery commitment or a paid-service agreement. We will confirm scope, timing and fees separately before any work begins.

Kind regards,  
AIMPACT  
AI × Business × Growth  
AIMPACT-off@gmail.com

## 3. Async Audit questionnaire

Ask the applicant to answer in general terms. Do not ask them to upload personal, regulated, confidential or customer-level data at this stage.

1. **Outcome:** What business outcome are you trying to improve?
2. **Current workflow:** What are the main steps from start to finish?
3. **Frequency & volume:** How often does this happen, and approximately how many cases/items per week or month?
4. **Time & cost:** Roughly how much staff time does the process take? What costs or rework are visible?
5. **Bottleneck:** Which step causes the greatest delay, error rate or frustration?
6. **Systems:** Which software categories or business systems are involved? Product names are sufficient; do not share credentials.
7. **Inputs & outputs:** What information goes in, and what result should come out?
8. **Exceptions:** Which cases require judgment or human approval?
9. **Data sensitivity:** Does the process involve personal, financial, health, children’s, confidential or otherwise restricted information? Answer yes/no and describe only the category.
10. **Current AI use:** Which AI tools, if any, are already being used?
11. **Success measure:** What would make a pilot successful (e.g. minutes saved, turnaround time, error reduction, throughput)?
12. **Stakeholders:** Who owns the process and who approves a pilot?
13. **Timing:** Is there a target date or operational deadline?
14. **Budget range:** Optional planning range; no commitment is implied.

## 4. First-pass diagnostic rubric

Score each dimension 1–5 and record evidence:
- Repetition / volume
- Rule clarity / process stability
- Digital input availability
- Measurable time or cost burden
- Integration feasibility
- Risk / sensitivity (reverse-scored: higher risk lowers priority)
- Human review feasibility

Output: problem statement, current-state map, candidate workflow, required integrations, human-in-the-loop checkpoints, risk register, effort band, baseline metric and proposed pilot acceptance criteria.

## 5. Response-time and ownership

- Target acknowledgement: within 10 business minutes during staffed hours; otherwise next business window.
- Triage owner: AIMPACT operations.
- No auto-response claim until SMTP/provider delivery and failure handling are tested.
- Escalate security-sensitive or regulated-data cases before requesting access.
- Never collect credentials through email or forms.
- Never activate production integrations without explicit client authorization and a documented rollback path.

## 6. Commercial boundary

The first review is qualification, not a promise of free implementation. Paid discovery, pilot scope, SaaS subscription and ongoing operations must each have explicit deliverables, pricing, cancellation terms and client responsibilities. Report measured outcomes only when evidence exists.
