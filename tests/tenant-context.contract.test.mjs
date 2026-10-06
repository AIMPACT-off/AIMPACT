import test from "node:test";
import assert from "node:assert/strict";
import { signTenantContext, verifyTenantContext } from "../phase2/auth/tenant-context.mjs";

const SECRET = "unit-test-secure-key-32bytes-long!";
const TENANT = "00000000-0000-0000-0000-000000000001";
const SUBJECT = "user-001";

test("HMAC tenant context signs and verifies canonical fields", () => {
  const token = signTenantContext({
    tenant_id: TENANT,
    subject: SUBJECT,
    exp: Math.floor(Date.now() / 1000) + 60
  }, SECRET);

  const verified = verifyTenantContext(token, SECRET);
  assert.deepEqual(verified, {
    tenant_id: TENANT,
    subject: SUBJECT,
    exp: verified.exp
  });
});

test("expired tenant context is rejected", () => {
  const token = signTenantContext({
    tenant_id: TENANT,
    subject: SUBJECT,
    exp: Math.floor(Date.now() / 1000) - 1
  }, SECRET);

  assert.equal(verifyTenantContext(token, SECRET), null);
});

test("tampered tenant context is rejected", () => {
  const token = signTenantContext({
    tenant_id: TENANT,
    subject: SUBJECT,
    exp: Math.floor(Date.now() / 1000) + 60
  }, SECRET);

  const [payload] = token.split(".");
  const tampered = Buffer.from(JSON.stringify({
    tenant_id: "tenant-attacker",
    subject: SUBJECT,
    exp: Math.floor(Date.now() / 1000) + 60
  })).toString("base64url") + "." + token.split(".")[1];

  assert.notEqual(tampered.split(".")[0], payload);
  assert.equal(verifyTenantContext(tampered, SECRET), null);
});
