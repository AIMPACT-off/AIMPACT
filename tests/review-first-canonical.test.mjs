import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("PR #23 canonical migration is present and server-only", async () => {
  const sql = await fs.readFile("supabase/migrations/202610040004_review_first_access_control.sql", "utf8");
  assert.match(sql, /record_diagnosis_review/);
  assert.match(sql, /for update/i);
  assert.match(sql, /insert into public\.diagnosis_reviews[\s\S]*update public\.diagnosis_reports/);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on public\.diagnosis_reports, public\.diagnosis_reviews[\s\S]*from public, anon, authenticated/i);
});

test("customer report access checks the latest review, not any historical approval", async () => {
  const source = await fs.readFile("netlify/functions/diagnosis-review.mjs", "utf8");
  assert.match(source, /order:\s*"created_at\.desc"/);
  assert.match(source, /limit:\s*"1"/);
  assert.match(source, /reviews\[0\]\.decision===\s*"APPROVED"/);
  assert.doesNotMatch(source, /decision:"eq\.APPROVED"/);
});

test("review API remains fail-closed without signed tenant context and server credentials", async () => {
  const source = await fs.readFile("netlify/functions/diagnosis-review.mjs", "utf8");
  assert.match(source, /verifyTenantContext/);
  assert.match(source, /TENANT_CONTEXT_HMAC_SECRET/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /AUTH_REQUIRED/);
  assert.match(source, /SUPABASE_SERVER_CONFIG_REQUIRED/);
});
