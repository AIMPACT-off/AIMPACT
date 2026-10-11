import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appConfig = readFileSync(new URL("../mobile/app.config.js", import.meta.url), "utf8");
const eas = JSON.parse(readFileSync(new URL("../mobile/eas.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../.github/workflows/mobile-test-app.yml", import.meta.url), "utf8");

test("test variant has a distinct application identity and keeps production identity unchanged", () => {
  assert.match(appConfig, /process\.env\.APP_VARIANT === "test"/);
  assert.match(appConfig, /AIMPACT TEST/);
  assert.match(appConfig, /ai\.aimpact\.app\.test/);
  assert.match(appConfig, /ai\.aimpact\.app"/);
  assert.match(appConfig, /aimpact-test/);
  assert.match(appConfig, /isTestBuild: testBuild/);
  const appSource = readFileSync(new URL("../mobile/App.js", import.meta.url), "utf8");
  assert.match(appSource, /EXPO_PUBLIC_APP_VARIANT === "test"/);
  assert.match(appSource, /TEST BUILD · NOT FOR PRODUCTION/);
});

test("EAS exposes separate internal Android and iOS simulator test profiles", () => {
  assert.equal(eas.build["test-android"].env.APP_VARIANT, "test");
  assert.equal(eas.build["test-android"].env.EXPO_PUBLIC_APP_VARIANT, "test");
  assert.equal(eas.build["test-android"].distribution, "internal");
  assert.equal(eas.build["test-android"].android.buildType, "apk");
  assert.equal(eas.build["test-ios-simulator"].env.APP_VARIANT, "test");
  assert.equal(eas.build["test-ios-simulator"].env.EXPO_PUBLIC_APP_VARIANT, "test");
  assert.equal(eas.build["test-ios-simulator"].ios.simulator, true);
  assert.equal(eas.build.production.autoIncrement, true);
});

test("test workflow verifies test bundle IDs and uploads installable artifacts", () => {
  assert.match(workflow, /APP_VARIANT=test/);
  assert.match(workflow, /ai\.aimpact\.app\.test/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(workflow, /AIMPACT-TEST-Android-APK/);
  assert.match(workflow, /AIMPACT-TEST-iOS-Simulator/);
  assert.match(workflow, /AIMPACT_TEST_APP_BUILD=PASS/);
});
