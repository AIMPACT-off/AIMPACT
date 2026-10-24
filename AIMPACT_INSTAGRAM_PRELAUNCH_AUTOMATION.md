# AIMPACT Instagram Prelaunch Automation
Status: PRELAUNCH TEST VERSION — not a live publisher
Owner: AIMPACT
Date: 2026-10-11

## Purpose
Create a repeatable path from verified business insight to Instagram-ready creative/copy, quality review, approval, publishing evidence, and conversion measurement. Do not equate draft generation with publication.

## Current verified starting point
- Existing draft: `content/INSTAGRAM_QUICK_AUDIT_CAROUSEL_01.md`.
- Offer currently represented in product catalog: AI Quick Audit, KRW 200,000.
- Existing repository standards define research/evidence, claim review, CTA, UTM, and post-publication analytics.
- No evidence in this repository alone proves Instagram Graph API credentials are connected or that a post has been published.

## Automated flow
1. **Brief** — define audience, one business pain, desired action, format, and source cutoff date.
2. **Research** — save source URL, publisher, publication/update date, access date, key claim, and quoted/paraphrased notes. Health, infant/child, and senior topics require heightened source review and must not provide individualized medical advice.
3. **Claim ledger** — label each claim FACT, HYPOTHESIS, or MEASURED. FACT requires a source; MEASURED requires a data source, period, calculation, and reproducible evidence.
4. **Draft** — create slide-by-slide copy, caption, alt text, CTA, and UTM campaign identifiers.
5. **Creative** — generate a unique visual concept for each slide, export each slide as a separate image, validate dimensions/legibility/contrast, and inspect the full set for repeated compositions or accidental text artifacts.
6. **Automated QA** — run `npm run test:instagram-prelaunch`. Any unsupported claim, missing slide, price mismatch, or absent disclaimer blocks approval.
7. **Human approval** — named reviewer approves copy, visuals, destination URL, rights/privacy, and offer terms. Automation may not approve its own unsupported claims.
8. **Publish** — publish only through an authorized Instagram professional account integration with valid permissions. Until credentials, account linkage, media-container upload, publish response, and post ID are verified, remain in READY_FOR_APPROVAL; do not claim auto-publishing works.
9. **Evidence** — record approved content version/hash, reviewer, timestamps, platform post ID/URL, status, and any errors. Never store access tokens in content files or logs.
10. **Attribution** — use unique UTM values and record profile visits, reach, saves, shares, link clicks, qualified leads, checkout starts, verified payments, and audit delivery where available. Do not infer revenue from views.

## Initial campaign — Quick Audit
- Format: 7-panel carousel.
- Audience: small and medium business operators who have repetitive manual work.
- Core message: diagnose the workflow before buying another AI tool.
- Offer: AI Quick Audit, KRW 200,000; confirm current price and checkout destination at release time.
- CTA: request a workflow diagnosis through the approved landing/checkout path.
- Tracking: `utm_source=instagram&utm_medium=organic_social&utm_campaign=quick_audit_01&utm_content=ig_carousel_01`.
- No customer results, ROI, testimonials, follower/view claims, or screenshots unless real, authorized, and documented.

## Prelaunch gates
- [ ] Landing/checkout URL tested on mobile and matches the offer.
- [ ] Actual account is a professional account and API permissions are confirmed.
- [ ] Brand fonts/assets and image usage rights are cleared.
- [ ] Seven separate slide images render and remain legible on a phone.
- [ ] Caption, alt text, UTM, and price match current product settings.
- [ ] Reviewer approval is recorded.
- [ ] Publishing returns a real platform post ID and URL.
- [ ] Analytics/lead/payment attribution is tested end-to-end.
- [ ] Rollback path: pause queued posts, revoke compromised tokens, and correct/remove inaccurate content.

## Honest status labels
`DRAFT → QA_PASS → NEEDS_APPROVAL → APPROVED → READY_TO_PUBLISH → PUBLISHED → ANALYTICS_CAPTURED`.
A workflow can move to PUBLISHED only after a successful platform response and stored post ID/URL. If any credential or API step is absent, report the exact blocker; never simulate success.
