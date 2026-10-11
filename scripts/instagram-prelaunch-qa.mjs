import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "content", "INSTAGRAM_QUICK_AUDIT_CAROUSEL_01.md");
const text = fs.readFileSync(file, "utf8");
const failures = [];
const warnings = [];

if (!/^Status:\s*DRAFT\b/m.test(text)) failures.push("CONTENT_STATUS_MUST_BE_EXPLICIT");
if (!/₩200,000/.test(text)) failures.push("QUICK_AUDIT_PRICE_MISSING");
if (!/실제 절감 효과는 기준값과 운영 데이터로 검증/.test(text)) failures.push("OUTCOME_EVIDENCE_DISCLAIMER_MISSING");
if (!/UTM:.*source=instagram.*medium=organic_social/m.test(text)) failures.push("UTM_TRACKING_MISSING");

const slideSection = text.split("## Slide copy")[1]?.split("## Caption")[0] || "";
const slides = [...slideSection.matchAll(/^\s*\d+\.\s+/gm)];
if (slides.length !== 7) failures.push(`EXPECTED_7_SLIDES_FOUND_${slides.length}`);

const risky = [
  /guaranteed savings/i,
  /100x productivity/i,
  /100배 생산성/,
  /무조건 절감/,
  /매출\s*\d+\s*%\s*증가/,
  /고객사\s*\d+\s*곳/
];
for (const pattern of risky) {
  if (pattern.test(text)) failures.push("UNSUPPORTED_CLAIM_PATTERN:" + pattern);
}

const cta = text.match(/CTA destination:\s*(.+)/)?.[1]?.trim() || "";
if (!cta || /required before publishing/i.test(cta) || /승인된 신청\/결제 링크 연결 후 게시/.test(text)) {
  warnings.push("PUBLISH_BLOCKED_UNTIL_APPROVED_LANDING_OR_CHECKOUT_URL_IS_CONFIGURED");
}
if (/Status:\s*PUBLISHED\b/m.test(text)) {
  warnings.push("PUBLISHED_STATUS_REQUIRES_PLATFORM_POST_URL_AND_ANALYTICS_EVIDENCE");
}

console.log("AIMPACT_INSTAGRAM_PRELAUNCH_QA=START");
console.log("CONTENT_FILE=" + path.relative(root, file));
console.log("SLIDES_FOUND=" + slides.length);
for (const warning of warnings) console.log("WARNING=" + warning);
for (const failure of failures) console.log("FAIL=" + failure);
if (failures.length) {
  console.log("AIMPACT_INSTAGRAM_PRELAUNCH_QA=FAIL");
  process.exitCode = 1;
} else {
  console.log("AIMPACT_INSTAGRAM_PRELAUNCH_QA=PASS_WITH_GATES");
}
