import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Phase 2 integration runner is fail-closed and TEST-only", () => {
  const source = fs.readFileSync("scripts/phase2-test-db.mjs", "utf8");
  assert.match(source, /TEST_DB_DISPOSABLE/);
  assert.match(source, /FAIL-CLOSED/);
  assert.match(source, /production-like/);
  assert.match(source, /202610040002_ai_diagnosis_data_contract/);
  assert.match(source, /202610040003_diagnosis_queue_retry_dlq/);
  assert.match(source, /202610040004_review_first_access_control/);
  assert.match(source, /Promise\.all/);
  assert.match(source, /diagnosis_dead_letters/);
  assert.match(source, /record_diagnosis_review/);
  assert.match(source, /account_membership/);
  assert.match(source, /phase2-test-api[.]mjs/);
  assert.match(source, /api_requests/);
});

test("Phase 2 integration runner does not represent HMAC as tenant membership", () => {
  const source = fs.readFileSync("scripts/phase2-test-db.mjs", "utf8");
  assert.match(source, /HMAC tenant-context issuance is not proof/);
  assert.match(source, /NOT_VERIFIED/);
});

test("optional HTTP probe records signed-context scope without claiming membership", () => {
  const source = fs.readFileSync("scripts/phase2-test-api.mjs", "utf8");
  assert.match(source, /tenant_a_same_tenant/);
  assert.match(source, /tenant_b_cross_tenant/);
  assert.match(source, /invalid_context/);
  assert.match(source, /synthetic HMAC-signed tenant context only/);
  assert.match(source, /PASS_SIGNED_TENANT_CONTEXT_SCOPE_ONLY/);
});
