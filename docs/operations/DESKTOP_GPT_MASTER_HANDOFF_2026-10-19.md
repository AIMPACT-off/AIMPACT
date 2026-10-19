# AIMPACT — Desktop GPT Master Handoff
Last updated: 2026-10-19
Repository: https://github.com/AIMPACT-off/AIMPACT
Purpose: canonical continuity brief for Desktop ChatGPT. Treat this document as a handoff index and verified/claimed status boundary, not proof that every historical task completed.

## 0. Instructions to the receiving Desktop GPT
Take over AIMPACT as the primary operator. Read this document, then inspect the linked repository files, open PRs, workflow runs, issues, and current artifacts before making changes. Do not ask the user to repeat information already recorded here. Do not respond with plans alone: execute the next safe step, save artifacts, run tests, inspect logs, and report exact evidence.
Use formal Korean honorifics and address the user as 주인님. Do not use casual speech.
Never claim a task passed merely because code exists, a workflow is green, a secret name exists, or a specification was written. Keep these states distinct: CODE EXISTS; TEST PASSED; DEPLOYED; PRODUCTION VERIFIED; CUSTOMER USED; PAYMENT SETTLED; REVENUE RECEIVED.
Core rules: NO DATA, NO CLAIM. NO EVIDENCE, NO PASS. FACT > ASSUMPTION. Explanation is not implementation. Implementation is not deployment. Deployment is not customer use. Customer use is not payment. Payment intent is not settled revenue.
Avoid repeated apologies, generic advice, asking the user to click through screens without a precise blocker, and asking them to expose credentials in chat. Never paste secrets into artifacts or logs.
The user has explicitly changed the division of labor: Desktop GPT takes over the complete AIMPACT project; this assistant should perform supplemental/repair work only when asked, not act as the primary owner.

## 1. AIMPACT business identity and truth model
AIMPACT is an AI Business Operating Company / Central Control Tower, not an AI tools directory or generic AI-tech showcase.
Core brand phrases:
- AI CURATES THE FUTURE
- AI × BUSINESS × GROWTH
- DISCOVER → VERIFY → COMPARE → APPLY
- WE DON’T SELL AI. WE TURN BUSINESS PROBLEMS INTO MEASURABLE OUTCOMES
- FIND THE LEAK. FIX WHAT PAYS.
Canonical promise: AIMPACT is not a company that shows off technology. It finds business cost/time leakage and missed revenue opportunities and connects them to measurable, real improvements.
Sectors emphasized: E-COMMERCE, FASHION, RETAIL, MARKETING, CONTENT.
Customer loop: customer problem → audit → workflow → payment → verified entitlement/report → implementation → result → repeat.
Operating loop: SEE → FIND → DIAGNOSE → PRIORITIZE → FIX → MEASURE → GROW → REPEAT.
The sales story must show specific workflow analysis, what cost/time/revenue item changes, how it is measured, ongoing management, and concrete customer benefits. Do not use vague AI capability claims.

## 2. Company operating rules and KPIs
- Never inflate PASS or business value claims.
- Evidence must include artifacts, result IDs, PR/commit, logs, deployment URL, database rows, or reproducible tests as appropriate.
- Separate technical hold from business go.
- User expects central monitoring around 5–10 minutes and notifications/rechecks rather than repeatedly asking them to request checks manually. Existing scheduled workflows do not by themselves prove full Control Tower coverage or alert delivery.
- Report money as received only after payment settlement evidence.
- KPIs: MONEY RECEIVED #001; OUTCOME VERIFIED #001; REPEAT REVENUE #001.
- Previously reported internal progress estimates (historical, not current verified state): central automation 70%, mobile 60%, customer/AI data loop 40%, monetization 40%, pre-store 30%. Re-measure before treating these as current.
- Historical business targets previously stated: Week 1 target 2 paid customers / KRW 1,000,000 cash received; Week 2 target 5 CONTENT FLOW subscribers / KRW 750,000 starting MRR / 2 AI WORKER builds at KRW 990,000 each (KRW 1,980,000 target build value). These are targets, not actual results.

## 3. Repository and service map
- GitHub repository: https://github.com/AIMPACT-off/AIMPACT
- Netlify site: https://aimpact-ai.netlify.app
- Supabase project host previously supplied: kakrrfsyczjbddezscvk.supabase.co
- Notion CRM is the primary CRM; do not create a duplicate monday.com CRM unless explicitly requested.
- Naver Blog: https://m.blog.naver.com/aimpact-off
- Instagram is a prelaunch demand/conversion engine, not generic AI education.
Do not expose any secret values. Verify current service state live before claiming it.

## 4. Current multi-agent Control Tower handoff — verified 2026-10-19
PR #67 is open, draft, not merged; title: “Define AIMPACT multi-agent Control Tower operating contract”.
PR: https://github.com/AIMPACT-off/AIMPACT/pull/67
Base branch: main; base SHA: 9119eef3be3056b4361f2df0491243a2fb2b6ded
Head branch: feat/multi-agent-control-tower
Head SHA: a4f398350167d028aecfbeb682ac85f00502442d
One documentation file changed, 95 additions, 0 deletions. PR body explicitly says it defines eight specialist roles, evidence-based verification, catalog reconciliation, P0 payment gates, safe automation boundaries, and truthful reporting; it does NOT claim an autonomous scheduler or production integration has been deployed.
Eight roles recorded by the user:
1. CEO Advisor
2. Business Validator
3. Pricing Strategist
4. Sales Rep
5. Marketing Lead
6. Bookkeeper
7. Contract Reviewer
8. Operations Manager
User-reported Airtable AIMPACT HQ record: recOWh9ZYZqLPl77i, status IN PROGRESS. This is a user-reported record reference; recheck via connected Airtable/tool if available.
Do not confuse a written role specification with an actual runtime agent engine. Runtime binding, scheduler, execution traces, error recovery, and outcome verification still require evidence.

## 5. Verified current workflow observations
### Payment Control
File: https://github.com/AIMPACT-off/AIMPACT/blob/main/.github/workflows/payment-control.yml
Verified main blob SHA at last inspection: 846646cd905a89d0f3ea43c28d3f5dd1547575f1.
Workflow includes code-level checks for Stripe/Toss functions, SQL migration, JS syntax, tests/toss-payment.test.mjs, and entitlement logic.
Provider integration logic currently has explicit blockers:
- If no provider secret is detected, it logs MOCK_ONLY, skips provider integration, and reports PAYMENT_E2E=NOT_VERIFIED while exiting 0.
- If Toss is selected and a secret exists, it explicitly emits TOSS_SANDBOX_PAYMENT_TEST_NOT_IMPLEMENTED and PAYMENT_E2E=NOT_VERIFIED, then exits 1.
- Stripe branch checks a payment link is active and livemode=false, but still explicitly reports PAYMENT_E2E=NOT_VERIFIED. This is not a completed payment E2E.
### Central Control
File: https://github.com/AIMPACT-off/AIMPACT/blob/main/.github/workflows/central-control.yml
Verified main blob SHA at last inspection: 123e436a361ed4402ff00b35b9901c1e753f3ecb.
Workflow triggers on main push, PR, workflow_dispatch, completed mobile/payment workflows, and every 30 minutes. Scheduled watchdog inspects active Mobile Build and Payment Control runs and may cancel/rerun runs older than 2400 seconds. It validates release-gate workflow structure and policy. This does not prove the eight-agent runtime exists, that 5–10-minute monitoring is active, or that email/push alerts are delivered.
### Latest truth boundary
At last inspection, no Toss sandbox payment was executed by this assistant, no Supabase paid ledger row was verified, no entitlement replay/idempotency result was verified, and no production revenue was proven. Do not report those as done.
The current payment-control workflow itself proves Toss sandbox E2E is not implemented in that workflow. This is the highest-priority technical blocker for monetization.
Do not initiate any live charge. Use sandbox/test credentials only and verify the environment is sandbox before executing payment tests.

## 6. Toss Quick Audit payment acceptance criteria
Price: KRW 200,000 for Quick Audit.
Required end-to-end evidence:
1. Generate a dynamic orderId (not a hard-coded reusable order).
2. Create a Toss sandbox payment and obtain the real test paymentKey.
3. Confirm the provider-side approval response is DONE and amount is exactly 200000 KRW.
4. Persist a paid ledger/order row in Supabase with the correct orderId/paymentKey and idempotent state transitions.
5. Verify entitlement/report unlock is granted only after server-side verified payment.
6. Replay confirmation/webhook and prove no duplicate charge, ledger row, entitlement, or revenue.
7. Verify failed/cancelled/mismatched-amount/signature-invalid cases do not grant entitlement.
8. Store redacted evidence: workflow run URL/ID, test assertions, database row identifiers and status, no secrets.
Previous user-reported GitHub Actions secret/variable setup had repeatedly failed to satisfy the workflow; past central runs logged missing Toss/Supabase/AIMPACT_E2E_BASE_URL/test-auth variables. This is historical and must be rechecked rather than assumed current.
Do not ask the user to paste any secret into chat. If a secret is absent, name the exact GitHub repository Settings → Secrets and variables → Actions path and exact required key name, and distinguish repository secrets from repository variables.

## 7. Mobile / store release
- App bundle/package identity reported: ai.aimpact.app
- iOS: user previously reported Apple Developer membership active after KRW 129,000 fee; App Store Connect API key named AIMPACT with Admin role; relevant Apple credentials, EXPO_TOKEN, and Google service-account secrets were reportedly added to GitHub. These are user-reported historical states, not proof they remain valid.
- Android build run previously reported: 38126565192; Android APK + iOS simulator + runtime diagnostics passed; tag mobile-38126565192. Simulator pass is not an installable iPhone device build.
- iOS device release workflow: .github/workflows/ios-device-release.yml; Android store release workflow: .github/workflows/android-store-release.yml; native store QA workflow: .github/workflows/native-store-qa.yml. Inspect current versions before use.
- A prior Central Control run #1397 reported payment/store configuration false. Treat store publication as blocked until an actual device build artifact and store submission evidence are verified.
- User priority is an installable iPhone test build before review, not simulator-only proof. Do not claim an iOS app is published without TestFlight/App Store Connect evidence and an actual installable build.
- IAP product ID reported: ai.aimpact.quick_audit. Verify the current commercial design and Apple rules before implementing purchases.

## 8. Product and technical architecture history (historical; revalidate)
- Phases 1–4.5 previously described as build complete: dispatcher, lock/heartbeat/isolation, preflight/prod smoke, tenant isolation, circuit breaker, RLS Catalog, Universal DLQ.
- Phase 5 was previously frozen due to production credentials/database NOT_VERIFIED and EXECUTION_MODE=OFF.
- Phase 6: revenue architecture.
- PR #45 was previously reported merged (commit 3272fe9…); PR #56 Toss E2E; PR #57 subscription draft; PR #58 Instagram prelaunch QA; PR #59 preflight; PR #61/#62 central-control merges. Verify each PR/commit before relying on status.
- A prior tenant-context API change on a Phase 2 branch was reported with auth/membership/multi-tenant tests passing; it was not merged to main at that time. Recheck branch/PR state.
- Existing customer portal areas previously observed: Overview, Diagnosis, Reports, Workflows, ROI, Billing. An earlier blocker was mismatch between diagnosis submission payload and authenticated server API. Re-test current integration.

## 9. Catalog / data integrity
Historical correction: public_tools was changed from “101 VERIFIED” to “0 Production Verified / all 101 NEEDS_REVIEW” because production evidence was absent. A prior snapshot reported dashboard Customers 0, Leads 0, Revenue KRW 0, Production UNVERIFIED, Verification 0/101. These are historical snapshots and must be refreshed before presenting as current.
Prior audit had 18 real leads (2 QA excluded); Proposal Status “Not Sent”; follow-up date standardized to 2026-10-05. Verify in Notion CRM before action.
Rule: catalog listing or source availability is not proof of production readiness. Every tool requires reproducible evidence, last verification time, owner, integration state, and business outcome.

## 10. Instagram / marketing execution brief
Purpose: prelaunch demand engine and conversion path for AIMPACT, continuously supporting Android/iPhone release.
Required content: AIMPACT identity, operating structure, lead/contact link, Control Tower automation, measurable business value, practical CTA.
Quality target: premium fashion-magazine editorial visual language; single-image storytelling when appropriate; complete carousels with clear page labels and no vague/missing slide content; Reels with voiceover and music (silent stills alone are insufficient).
Characters:
- JOHN: professional, sharp, accessible; diagnoses business problems and solution direction.
- LEAK: mischievous troublemaker representing repetitive work, customer churn, inventory issues, and content delays.
- CONTROL TOWER: central stage for evidence confirmation, prioritization, and result measurement.
Use a consistent character appearance/expression/voice/clothing/action guide across AI video.
Existing campaign concept: “AIMPACT Pilot 01 — Find the Leak”, vertical 9:16, 30-second edit project. User previously said project/background edits were complete and wanted it posted; verify current actual file and publication state.
User values practical posting cadence, exact schedule, visual layouts, Reels specs, voice/music, and no broken/credit-failed AI videos. If one generation service fails, switch to an available alternative without degrading brand trust.
Instagram reference quality mentioned: ahntax_insight / 안택스 인사이트 (profile trust signals, CTA links, high-performing Reel thumbnails).
An Instagram Conversion Playbook was reported created; issue #63 was reported to track web inquiries, media, and iOS launch. Verify current artifact and issue.
A 10-minute central-control PR #64 (commit 523d40d) was reported created but not merged; email alerting was not implemented/verified at that time. Verify current status.

## 11. Naver Blog
Blog: https://m.blog.naver.com/aimpact-off
User wants broader factual/current-interest coverage, not only AIMPACT technology: health, beauty/skin, stocks, crypto, accounting, real estate, child education, entertainment, performances, sports, etc.
Use detailed, non-obvious information, real locations/images where relevant, current topic research, and a month-long Control Tower schedule based on topic heat and likely audience interest. User is willing to post manually if automation or approval blocks.
Blog/app identity request: “AIMPACT Blog”, site URL https://aimpact-ai.netlify.app. Verify current Naver registration/publication state.

## 12. Commercial model / user constraints
- Korea-first Quick Audit price: KRW 200,000 (replaces earlier USD 150 concept).
- User later defined post-free-diagnostic subscription tiers: BEIGE / PREMIUM / VIP / PLATINUM. Do not invent current prices or promise benefits not implemented.
- User is concerned about recurring platform costs before product proof: Apple Developer KRW 129,000/year and Google Play registration KRW 44,000 (historical amounts reported by user; verify before current financial statements).
- “Premium” is not to be represented as currently available unless implementation and entitlement are verified. User prioritizes limited version / launch test app first.

## 13. Sales / CRM and external outreach
- CRM of record: Notion, not a duplicate monday board.
- Sales assets should be high-quality, visually persuasive decks/content showing specific customer outcomes, not generic low-effort proposal copy.
- Never send outreach, publish content, create charges, or change production data without explicit authorization and a verified target/environment.
- A previous business partnership reply needed a warmer, more respectful and structured tone; user dislikes messages that look perfunctory.
- NON select shop is a separate business context: user represents the distributor in Gwangju; concept is non-brand men/women/unisex; possible Suwan second store. NUYH consignment terms previously given: standard 33%, collab 30%, settlement next-next month day 10. Event copy should avoid “90% discount” and prefer max 80%. Do not mix NON operations into AIMPACT unless asked.

## 14. Other creative projects (separate from AIMPACT)
- Suno music projects are separate. Modern emotional trot for older listeners, contemporary feel rather than old-fashioned; one earlier test track “당신의 손을 놓지 않으리” was reviewed. User dislikes cliché repetition, long intros, default female voice, and heavy piano/guitar/pads/cinematic sound.
- Separate 10-song autumn R&B/café pop project: sophisticated melodic pop suited to cafés/reading; provide lyrics and music prompts separately, avoid reusing same title/words and keep story-specific songs.
Do not divert AIMPACT execution into these projects unless asked.

## 15. User communication requirements
- Korean formal honorifics only; address as 주인님.
- User is frustrated by repeated explanation, apologies, and “I will do it” statements without artifacts.
- When blocked, identify the exact cause, show the relevant file/path/log, implement a fallback or fix where possible, and state the one specific action that is truly required from the user.
- Do not say “done”, “published”, “deployed”, “verified”, or “PASS” without corresponding evidence.
- Do not ask for information already contained here or the linked repository.
- Provide concise result reports with changed files, commit/PR/run IDs, actual test output, remaining blocker, and next action.
- The user now asks Desktop GPT to own the full AIMPACT project and this assistant to handle only supplemental work.

## 16. Required Desktop GPT takeover sequence
1. Read this document end-to-end.
2. Fetch PR #67 metadata and diff; leave draft/open until reviewing whether to merge. Do not confuse a contract document with deployed runtime.
3. Inventory main workflows, open PRs, issues, branches, current run history, and artifacts. Verify current repo truth, not old chat claims.
4. Read required architecture documents referenced by central-control.yml, including AIMPACT_CENTRAL_CONTROL_SYSTEM.md, AIMPACT_DECISION_AUTHORITY.md, AIMPACT_CORE_TECHNOLOGY_AND_MONETIZATION.md, AIMPACT_DATA_LINEAGE.md, AIMPACT_VERIFICATION_SPEC.md, AIMPACT_SYNC_SPEC.md, RELEASE_CREDENTIALS_AND_BLOCKERS.md.
5. P0: implement and run Toss sandbox E2E safely, only if sandbox credentials/environment are confirmed; produce dynamic order/payment IDs, provider approval, Supabase ledger, entitlement, idempotency, negative-case evidence. If blocked by missing configuration, report exact secret/variable names and Settings path, never ask for secret values in chat.
6. P1: establish actual agent runtime binding for the eight specialist roles, with orchestrator, bounded permissions, input/output schemas, execution ledger, retries/dead-letter handling, safe side-effect gates, and evidence links. Tests must show actual invocation, not just prompts stored as docs.
7. P1: verify installable iOS device build and Android artifact; store submission is separate from build.
8. P2: verify customer diagnosis payload/auth integration, catalog evidence status, Notion CRM state, Instagram assets/publication, Naver blog, and monitoring/alert delivery.
9. Report actual facts only; do not mark production or revenue outcomes PASS before evidence.
