#!/usr/bin/env node
/**
 * Optional TEST/staging HTTP smoke for the diagnosis-review function.
 * Proves signed tenant-context scoping only; it does NOT prove account membership.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const required = ["TEST_API_URL", "TENANT_CONTEXT_HMAC_SECRET", "TEST_TENANT_A_ID", "TEST_TENANT_B_ID", "TEST_REPORT_ID", "TEST_DB_DISPOSABLE"];
for (const key of required) {
  if (!process.env[key]) throw new Error("FAIL-CLOSED: " + key + " is required");
}
if (process.env.TEST_DB_DISPOSABLE !== "YES") throw new Error("FAIL-CLOSED: TEST_DB_DISPOSABLE=YES required");
const base = new URL(process.env.TEST_API_URL);
if (/(prod|production|live)/i.test(base.hostname + base.pathname)) {
  throw new Error("FAIL-CLOSED: TEST_API_URL looks production-like");
}
const evidence = {
  started_at: new Date().toISOString(),
  endpoint: new URL("/.netlify/functions/diagnosis-review", base).origin + "/.netlify/functions/diagnosis-review",
  report_id: process.env.TEST_REPORT_ID,
  identity_assurance: "synthetic HMAC-signed tenant context only; NOT authenticated account membership",
  requests: {}
};
function token(tenantId) {
  const payload = Buffer.from(JSON.stringify({
    tenant_id: tenantId,
    subject: "phase2-test-fixture-user",
    exp: Math.floor(Date.now() / 1000) + 300
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.TENANT_CONTEXT_HMAC_SECRET).update(payload).digest("base64url");
  return payload + "." + signature;
}
async function call(name, tenantId, signedToken) {
  const url = new URL("/.netlify/functions/diagnosis-review", base);
  url.searchParams.set("report_id", process.env.TEST_REPORT_ID);
  const response = await fetch(url, { method: "GET", headers: { "x-aimpact-tenant-context": signedToken } });
  const body = await response.json().catch(() => ({ parse_error: true }));
  evidence.requests[name] = {
    method: "GET",
    path: url.pathname + url.search,
    status: response.status,
    response: body
  };
  return response.status;
}
try {
  const [tenantA, tenantB, invalid] = await Promise.all([
    call("tenant_a_same_tenant", process.env.TEST_TENANT_A_ID, token(process.env.TEST_TENANT_A_ID)),
    call("tenant_b_cross_tenant", process.env.TEST_TENANT_B_ID, token(process.env.TEST_TENANT_B_ID)),
    call("invalid_context", process.env.TEST_TENANT_A_ID, "invalid.invalid")
  ]);
  if (tenantA !== 200) throw new Error("Tenant A expected HTTP 200, received " + tenantA);
  if (tenantB !== 403) throw new Error("Tenant B expected HTTP 403, received " + tenantB);
  if (invalid !== 401) throw new Error("Invalid context expected HTTP 401, received " + invalid);
  evidence.result = "PASS_SIGNED_TENANT_CONTEXT_SCOPE_ONLY";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  evidence.finished_at = new Date().toISOString();
  const output = process.env.TEST_API_EVIDENCE_FILE || path.join("artifacts/phase2-test-evidence", "phase2-api-" + Date.now() + ".json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ result: evidence.result || "INCOMPLETE", evidence_file: output, requests: evidence.requests }, null, 2) + "\n");
}
