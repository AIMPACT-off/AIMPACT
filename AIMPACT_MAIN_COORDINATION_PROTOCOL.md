# AIMPACT MAIN COORDINATION PROTOCOL
Last reviewed: 2026-10-20
Repository: https://github.com/AIMPACT-off/AIMPACT
Branch: main

## Authority and roles
- Main coordinator (this ChatGPT conversation): owns priorities, system-level decisions, cross-workstream state, evidence review, blocker resolution, and final status reporting.
- Desktop ChatGPT/Codex: execution partner for repository-local work, local files, terminal runs, builds, tests, and desktop-only actions when the user has granted access.
- User: only performs account-owner actions that require their authentication, private credentials, explicit approval, payment, or a human decision.
- This coordinator cannot directly send messages into a separate desktop conversation. Transfer work through this file, a linked GitHub artifact/PR, or a user-pasted desktop result.

## Non-negotiable execution rules
1. Never restart from generic instructions. Read this protocol and the latest master state/handoff first.
2. Reconcile documents against live repository/runtime evidence; do not trust stale documents over current evidence.
3. Separate PLAN, CODE WRITTEN, TEST PASSED, DEPLOYED, PRODUCTION VERIFIED, CUSTOMER USED, PAYMENT RECEIVED, and OUTCOME VERIFIED.
4. Use only these task statuses: PASS, FAIL, BLOCKED, NOT VERIFIED. Every PASS requires an artifact, run ID, URL, log, or reproducible test evidence.
5. When blocked, identify the exact failing dependency and perform all possible safe remediation before asking the user. User requests must include exact UI path, exact field/action, why it is required, and how success will be verified.
6. Do not repeatedly rerun a known blocked test when its prerequisite is unchanged.
7. Record meaningful decisions, commits, run IDs, failures, recovery steps, and next action in the repository so the next session resumes from the last real state.
8. Do not expose secrets or claim to have read GitHub secret values. Verify presence only through safe workflow probes/logical checks that do not print values.
9. No fabricated customers, tool verification, deployment, revenue, or business outcomes.

## AIMPACT operating truth
- Positioning: AI Business Operating Company / Control Tower, not an AI-tool directory.
- Promise: find business cost/time leakage and missed revenue opportunities, then connect fixes to measurable outcomes.
- Core loop: SEE → FIND → DIAGNOSE → PRIORITIZE → FIX → MEASURE → GROW → REPEAT.
- Business loop: customer problem → audit → workflow → payment → verified entitlement/report → implementation → result → repeat.
- NO DATA, NO CLAIM; NO EVIDENCE, NO PASS; FACT > ASSUMPTION.
- Initial paid offer: Korea-first Quick Audit at ₩200,000. Do not claim revenue until payment ledger and provider evidence confirm it.

## Repository evidence captured 2026-10-20
- Current GitHub repository is accessible: AIMPACT-off/AIMPACT, main.
- The current live repository tree contains package.json, .github/workflows/, scripts/, and many operating docs. This conflicts with older handoff text that said no package.json/package-lock or framework build configuration was established. Reconcile before relying on that older statement.
- Current workflows include central-control.yml, production-smoke.yml, payment-control.yml, ios-device-release.yml, android-store-release.yml, mobile-build.yml, and related QA workflows.
- Current docs include AIMPACT_MASTER_HANDOFF.md, AIMPACT_MASTER_SYSTEM_STATE.md, AIMPACT_CONTENT_ENGINE.md, AIMPACT_SOCIAL_MEDIA_OPERATING_SYSTEM.md, and AIMPACT_INSTAGRAM_CONVERSION_PLAYBOOK.md.
- The package.json inspected in the current session includes test/production-check scripts but no explicit Naver Blog publishing script or Naver-specific dependency.
- Initial GitHub code searches for NAVER/blog terms returned no matches. This alone is not sufficient proof that every possible integration path is absent; inspect the full tree and relevant workflows/config before concluding.
- Naver Blog direct publishing is not verified. Treat content preparation and actual publishing as separate states. Never claim a post is published without a public URL or equivalent evidence.

## Handoff template for every substantial task
- Goal / business impact:
- Current status (PASS / FAIL / BLOCKED / NOT VERIFIED):
- Source of truth checked:
- Changes made (file paths + commit/PR):
- Tests executed (exact command/workflow + run ID):
- Runtime/deployment evidence:
- What remains and why:
- User-only action (only if unavoidable; exact steps):
- Next action that can proceed without user:
- Resume point for the next session:

## Current next action
Continue the user's active request to establish a reliable Naver Blog operating path:
1. Finish repository tree/config/workflow inspection for any Naver publishing or content automation.
2. Check available connected tools/platforms and official Naver API constraints.
3. If no supported direct-publishing route exists, prepare the content and a minimal, clear manual publishing procedure; request user interaction only for authenticated account actions.
4. Keep content preparation, draft creation, manual publication, and verified public publication as separate statuses.
