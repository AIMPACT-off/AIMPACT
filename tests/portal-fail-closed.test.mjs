import test from "node:test";
import assert from "node:assert/strict";

test("portal contract keeps browser customer-data path fail-closed", async () => {
  const source = await import("node:fs/promises").then(fs=>fs.readFile("netlify/functions/diagnosis-portal.mjs","utf8"));
  assert.match(source,/DIAGNOSIS_PORTAL_ENABLED/);
  assert.match(source,/PORTAL_DISABLED/);
  assert.match(source,/SUPABASE_AUTH_JWT_REQUIRED|INVALID_OR_EXPIRED_AUTH|AUTH_SUBJECT_MISSING/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY.*Response/);
});
