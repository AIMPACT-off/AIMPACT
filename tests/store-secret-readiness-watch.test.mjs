import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/store-secret-recovery.yml", "utf8");

test("store secret recovery polls at five-minute intervals and supports manual observation", () => {
  assert.match(workflow, /cron: "﹡\/5 ﹡ ﹡ ﹡ ﹡"/.source.replaceAll("﹡", "\\*"));
  assert.match(workflow, /workflow_dispatch:/);
});

test("recovery checks secret presence without printing secret values", () => {
  for (const key of [
    "APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_BUNDLE_ID", "APPLE_PRIVATE_KEY",
    "APPLE_PRIVATE_KEY_BASE64", "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64", "GOOGLE_PACKAGE_NAME", "EXPO_TOKEN"
  ]) assert.ok(workflow.includes(key), "missing readiness check for " + key);
  assert.match(workflow, /STORE_CREDENTIAL_READINESS=BLOCKED/);
  assert.match(workflow, /STORE_CREDENTIAL_READINESS=PASS/);
});

test("recovery pins the successful mobile SHA and checks every release gate", () => {
  for (const gate of ["android-apk", "android-runtime", "ios-simulator", "mobile-release-gate"]) {
    assert.ok(workflow.includes(gate));
  }
  assert.match(workflow, /git merge-base --is-ancestor "\$SHA" origin\/main/);
  assert.match(workflow, /IMMUTABLE_RELEASE_TAG_SHA_MISMATCH/);
});

test("recovery avoids duplicate QA and only retries a credential-blocked failure", () => {
  assert.match(workflow, /STORE_QA_RECOVERY=BLOCKED_PREVIOUS_FAILURE_NOT_CREDENTIAL_BLOCKED/);
  assert.match(workflow, /STORE_QA_RECOVERY=NOT_NEEDED/);
  assert.match(workflow, /gh workflow run native-store-qa\.yml/);
});

test("validation runs on pull requests; recovery only runs on schedule or explicit dispatch", () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
});
