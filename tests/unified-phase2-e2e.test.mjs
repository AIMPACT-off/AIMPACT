import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("unified Phase 2 integration runner is TEST-only and fail-closed", () => {
  const source = fs.readFileSync("scripts/phase2-test-db.mjs", "utf8");
  assert.match(source, /TEST_DB_DISPOSABLE/);
  assert.match(source, /FAIL-CLOSED/);
  assert.match(source, /production-like/);
  assert.match(source, /202610040002_ai_diagnosis_data_contract/);
  assert.match(source, /202610040003_diagnosis_queue_retry_dlq/);
  assert.match(source, /202610040004_review_first_access_control/);
  assert.match(source, /Promise\\.all/);
  assert.match(source, /diagnosis_dead_letters/);
  assert.match(source, /record_diagnosis_review/);
});

test("unified Phase 2 integration runner separates membership from HMAC", () => {
  const source = fs.readFileSync("scripts/phase2-test-db.mjs", "utf8");
  assert.match(source, /HMAC tenant-context issuance is not proof/);
  assert.match(source, /NOT_VERIFIED/);
  assert.match(source, /NOT_RUN/);
});
