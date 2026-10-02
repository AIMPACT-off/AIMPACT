import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("tenant isolation CLI fails closed when credentials and fixtures are absent", () => {
  const result = spawnSync(process.execPath, ["scripts/test-tenant-isolation.mjs"], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_ANON_KEY: "", TENANT_A_JWT: "", TENANT_B_JWT: "", RLS_TEST_CASES: "" }
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing SUPABASE_URL/);
});
