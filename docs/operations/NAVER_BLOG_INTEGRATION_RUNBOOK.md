# AIMPACT Naver Blog Integration Runbook

Last verified: 2026-10-20
Owner: AIMPACT Main Control Tower
Status: MANUAL PUBLISHING REQUIRED / AUTOMATION PREPARATION CAN PROCEED

## 1. Decision

Do not build a publisher against the retired Naver Blog Open API. Naver's official notice says the login-based Blog Open API (writing posts from external services) ended on 2020-05-06. The current documented Naver Blog Search API is for retrieving search results, not publishing posts. The Naver Blog app's writing URL scheme was also discontinued in 2022. Until Naver publishes a supported writing API and its terms are verified, publish posts manually in the Naver Blog editor.

Official sources:
- Blog Open API termination: https://developers.naver.com/notice/article/7527
- Blog Search API (search only): https://developers.naver.com/docs/serviceapi/search/blog/blog.md
- Blog app writing URL scheme termination: https://developers.naver.com/notice/article/8595
- Search API / API HUB migration notice (separate from publishing): https://developers.naver.com/notice/article/32530

## 2. Existing repository evidence

- `AIMPACT_CONTENT_ENGINE.md` defines the content evidence gate, content record fields, source-to-lead attribution, and a rule not to manufacture authority.
- `AIMPACT_SOCIAL_MEDIA_OPERATING_SYSTEM.md` defines the distribution-to-conversion loop.
- `AIMPACT_INSTAGRAM_CONVERSION_PLAYBOOK.md` has publishing quality rules and warns not to promote an unverified intake form as live.
- `package.json` currently has Node tests and audit/production scripts but no Naver Blog publishing script or Naver-specific dependency.
- Repository code search for `NAVER`, `naver blog`, `blog publish`, `m.blog.naver.com`, and `content calendar` returned no indexed matches in this check. Search indexing may be incomplete; this is not proof that no related text exists anywhere.

## 3. Responsibilities

### AIMPACT / assistant can prepare without account-owner intervention
- Research topic, current facts, primary sources, and date checked.
- Draft a complete Korean blog article with title, opening, headings, body, summary, FAQ when useful, tags, thumbnail copy, image brief, and CTA.
- Maintain a source/evidence table and remove unsupported claims.
- Prepare a manual-publishing checklist and a record template for each post.
- Propose a cadence and status tracker. Do not claim a post is published without a public URL and a visual/public-page check.
- Prepare image assets only when specifically requested and record asset rights/source.
- Avoid repetitive near-duplicate mass publishing and never fabricate personal experience, testimonials, results, or metrics.

### Account owner must do manually
1. Sign in to the correct Naver account and complete any identity/2FA prompt.
2. Confirm the target blog is `m.blog.naver.com/aimpact-off` and that the signed-in account can write to it.
3. In the Naver Blog editor, paste the prepared title/body; upload or select approved images; set categories/tags and thumbnail as available.
4. Preview mobile layout, links, image placement, spelling, and source links.
5. Press Publish and choose visibility/scheduling options in the official editor.
6. Copy the resulting public post URL and return it to the tracker; do not share passwords, session cookies, or 2FA codes.
7. If login, ownership, editor controls, or publication fails, send a screenshot with personal/security details hidden. Do not send credentials.

## 4. Per-post workflow and statuses

Use only these states:
- `IDEA`: topic proposed, not researched.
- `RESEARCHED`: evidence and primary sources collected.
- `DRAFT_READY`: article and metadata prepared.
- `NEEDS_OWNER_PUBLISH`: ready for manual editor work.
- `PUBLISHED_UNVERIFIED`: owner reports publication, public URL not checked yet.
- `PUBLISHED_VERIFIED`: public URL opens and title/body/images/links were checked.
- `BLOCKED`: missing access, source, asset rights, or required owner action.
- `REJECTED`: fails evidence, originality, privacy, or quality gate.

Never mark `PUBLISHED_VERIFIED` without a public URL and successful public-page check.

## 5. Required content record

For every post, record:
- Content ID; planned/published date (KST); status
- Topic; target reader; search intent; title; slug/short label
- Full article draft; excerpt; headings; tags; category
- Claim/evidence status; primary source URLs; date checked
- Image filenames/source/rights; thumbnail copy
- CTA and destination URL; UTM/source/medium/campaign/content_id when relevant
- Manual publisher confirmation; public URL; verification timestamp
- Follow-up metrics when available: views, comments, clicks, qualified enquiries, leads, revenue/outcome (do not infer unavailable metrics)

## 6. Secret and security policy

- Never commit Naver password, 2FA code, session cookie, browser profile, or personal tokens.
- Do not add `NAVER_CLIENT_SECRET` expecting it to enable Blog publishing; Search API credentials do not grant post-writing capability.
- If a future supported publishing API becomes available, first verify official documentation, authorization scopes, terms, account approval, and a sandbox/test path. Then add only the minimum required secret through GitHub repository Settings → Secrets and variables → Actions; never put secret values in source code or logs.
- Do not use unofficial browser automation or reverse-engineered endpoints to bypass the supported editor or platform controls.

## 7. Definition of done for initial integration

- This runbook is committed.
- A first article draft is prepared and checked against primary sources.
- Owner manually publishes it through the official editor.
- Public URL is returned and checked.
- Only then is the first blog publication marked verified.
