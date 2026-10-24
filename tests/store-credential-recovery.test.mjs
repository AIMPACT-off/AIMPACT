import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/store-credential-recovery.yml", "utf8");

test("store credential recovery polls every five minutes and is manually diagnosable", () => {
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
});

test("credential readiness checks names only and supports either Apple private-key encoding", () => {
  for (const name of ["EXPO_TOKEN", "APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_BUNDLE_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64", "GOOGLE_PACKAGE_NAME"]) {
    assert.ok(workflow.includes(name), "missing credential check: " + name);
  }
  assert.match(workflow, /APPLE_PRIVATE_KEY_BASE64/);
  assert.match(workflow, /MISSING_CREDENTIAL_NAMES/);
  assert.doesNotMatch(workflow, /echo "\$EXPO_TOKEN|echo "\$APPLE_PRIVATE_KEY|echo "\$GOOGLE_SERVICE_ACCOUNT_KEY_BASE64/);
});

test("recovery requires the immutable successful mobile build source and only retries credential-gate failures", () => {
  assert.match(workflow, /ci\/mobile-\$mobile_run_id/);
  assert.match(workflow, /MOBILE_SHA/);
  assert.match(workflow, /STORE_RELEASE_BLOCKED_CREDENTIALS/);
  assert.match(workflow, /SKIPPED_FAILURE_NOT_CREDENTIAL_GATE/);
  assert.match(workflow, /SKIPPED_ALREADY_ACTIVE/);
  assert.match(workflow, /SKIPPED_QA_ALREADY_PASSED/);
  assert.match(workflow, /gh workflow run native-store-qa\.yml --ref "\$release_ref"/);
});
test("recovery dispatches first QA when no prior QA exists, but fails closed on unrelated QA failures", () => {
  assert.match(workflow, /qa_count=.*jq 'length'/);
  assert.match(workflow, /FIRST_ATTEMPT_NO_PRIOR_QA/);
  assert.match(workflow, /RETRY_CREDENTIAL_GATE_FAILURE/);
  assert.match(workflow, /BLOCKED_UNEXPECTED_QA_HISTORY/);
  assert.match(workflow, /SKIPPED_FAILURE_NOT_CREDENTIAL_GATE/);
});
