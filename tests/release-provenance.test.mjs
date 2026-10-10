import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const central = read(".github/workflows/central-control.yml");
const mobile = read(".github/workflows/mobile-build.yml");
const qa = read(".github/workflows/native-store-qa.yml");
const android = read(".github/workflows/android-store-release.yml");
const ios = read(".github/workflows/ios-device-release.yml");
const eas = JSON.parse(read("mobile/eas.json"));
const credentials = read("RELEASE_CREDENTIALS_AND_BLOCKERS.md");

test("superseded mobile builds are cancelled so current SHA is not queued behind stale work", () => {
  assert.match(mobile, /group: aimpact-mobile-build-\$\{\{ github\.ref \}\}/);
  assert.match(mobile, /cancel-in-progress: true/);
});

test("central control pins successful main mobile builds to immutable tags", () => {
  assert.match(central, /git merge-base --is-ancestor "\$RUN_SHA" origin\/main/);
  assert.match(central, /RELEASE_REF="ci\/mobile-\$RUN_ID"/);
  assert.match(central, /IMMUTABLE_RELEASE_TAG_SHA_MISMATCH/);
  assert.match(central, /MOBILE_BUILD_SHA_PRECEDES_IMMUTABLE_RELEASE_PIPELINE/);
  assert.match(central, /git show "\$RUN_SHA:\$required_file"/);
  assert.match(central, /native-store-qa\.yml --ref "\$RELEASE_REF".*source_ref="\$RELEASE_REF"/);
});

test("native store QA checks out the pinned source and validates all required jobs", () => {
  assert.match(qa, /source_ref:[\s\S]*required: true/);
  assert.match(qa, /ref: \$\{\{ inputs\.source_ref \}\}/);
  assert.match(qa, /SOURCE_REF_CONTEXT_MISMATCH/);
  assert.match(qa, /CHECKED_OUT_SOURCE_SHA_MISMATCH/);
  for (const job of ["android-apk", "android-runtime", "ios-simulator", "mobile-release-gate"]) {
    assert.match(qa, new RegExp("for job in [^\\n]*" + job));
  }
});

test("store release workflows preserve the same source tag and SHA", () => {
  for (const workflow of [android, ios]) {
    assert.match(workflow, /source_ref:[\s\S]*required: true/);
    assert.match(workflow, /ref: \$\{\{ inputs\.source_ref \}\}/);
    assert.match(workflow, /SOURCE_REF_CONTEXT_MISMATCH/);
    assert.match(workflow, /WORKFLOW_REF_SHA_MISMATCH/);
    assert.match(workflow, /STORE_QA_SOURCE_REF_MISMATCH/);
    assert.match(workflow, /MOBILE_AND_STORE_QA_SHA_MISMATCH/);
  }
  assert.match(qa, /ios-device-release\.yml --ref "\$SOURCE_REF"/);
  assert.match(qa, /android-store-release\.yml --ref "\$SOURCE_REF"/);
});

test("Android submission uses a specific EAS build and protected Play credentials", () => {
  assert.match(android, /eas build --platform android --profile production --non-interactive --wait --json/);
  assert.match(android, /eas submit --platform android --profile production --non-interactive --id "\$EAS_ANDROID_BUILD_ID" --wait/);
  assert.doesNotMatch(android, /eas submit[^\n]*--latest/);
  assert.match(android, /GOOGLE_SERVICE_ACCOUNT_KEY_BASE64/);
  assert.match(android, /rm -f credentials\/google-service-account\.json/);
  assert.equal(eas.submit.production.android.serviceAccountKeyPath, "./credentials/google-service-account.json");
  assert.match(read("mobile/.gitignore"), /credentials\/google-service-account\.json/);
});

test("credential matrix distinguishes configured credentials from actual provider proof", () => {
  for (const name of ["EXPO_TOKEN", "APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_BUNDLE_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64", "GOOGLE_PACKAGE_NAME", "TOSS_SECRET_KEY"]) {
    assert.ok(credentials.includes(name), "missing credential documentation: " + name);
  }
  assert.match(credentials, /Secret presence is not payment integration proof/);
});

test("five-minute store credential recovery is fail-closed and idempotent", () => {
  const recovery = read(".github/workflows/store-credential-recovery.yml");
  assert.ok(recovery.includes('cron: "*/5 * * * *"'));
  assert.match(recovery, /workflow_dispatch:/);
  for (const name of ["EXPO_TOKEN", "APPLE_ISSUER_ID", "APPLE_KEY_ID", "APPLE_BUNDLE_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY_BASE64", "GOOGLE_PACKAGE_NAME"]) {
    assert.ok(recovery.includes(name), "missing credential check: " + name);
  }
  assert.match(recovery, /APPLE_PRIVATE_KEY_BASE64/);
  assert.match(recovery, /MISSING_CREDENTIAL_NAMES/);
  assert.match(recovery, /STORE_RELEASE_BLOCKED_CREDENTIALS/);
  assert.match(recovery, /SKIPPED_FAILURE_NOT_CREDENTIAL_GATE/);
  assert.match(recovery, /SKIPPED_ALREADY_ACTIVE/);
  assert.match(recovery, /SKIPPED_QA_ALREADY_PASSED/);
  assert.ok(recovery.includes('gh workflow run native-store-qa.yml --ref "$release_ref"'));
  assert.doesNotMatch(recovery, /echo "\\$EXPO_TOKEN|echo "\\$APPLE_PRIVATE_KEY|echo "\\$GOOGLE_SERVICE_ACCOUNT_KEY_BASE64/);
});

test("central-control automated dependency repair must use a PR, never push directly to main", () => {
  assert.match(central, /Open guarded repair pull request instead of writing to main/);
  assert.match(central, /pull-requests: write/);
  assert.match(central, /gh pr create/);
  assert.match(central, /MOBILE_AUTOREPAIR_PULL_REQUEST=/);
  assert.doesNotMatch(central, /git push origin HEAD:main/);
});
