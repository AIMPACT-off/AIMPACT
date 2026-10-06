import test from "node:test";
import assert from "node:assert/strict";
import tenantContext from "../netlify/functions/tenant-context.mjs";
import { verifyTenantContext } from "../phase2/auth/tenant-context.mjs";

const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TENANT_CONTEXT_HMAC_SECRET"];
const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));

function configure() {
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.TENANT_CONTEXT_HMAC_SECRET = "test-hmac-secret";
}
function restore() {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
function request(token = "valid.jwt.token", body = {}) {
  return new Request("https://aimpact.test/.netlify/functions/tenant-context", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("tenant context rejects missing bearer token before network access", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  try {
    const response = await tenantContext(new Request("https://aimpact.test/.netlify/functions/tenant-context", { method: "POST" }));
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("tenant context is signed only after Supabase Auth and active membership verification", async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/v1/user")) {
      assert.equal(options.headers.Authorization, "Bearer valid.jwt.token");
      return new Response(JSON.stringify({ id: "auth-user-1" }), { status: 200 });
    }
    assert.match(String(url), /tenant_memberships/);
    assert.match(String(url), /user_id=eq\.auth-user-1/);
    assert.match(String(url), /status=eq\.active/);
    assert.equal(options.headers.Authorization, "Bearer service-test");
    return new Response(JSON.stringify([{ tenant_id: "tenant-1", role: "owner", status: "active" }]), { status: 200 });
  };
  try {
    const response = await tenantContext(request());
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.tenant.id, "tenant-1");
    assert.equal(data.tenant.role, "owner");
    const verified = verifyTenantContext(data.tenant_context, "test-hmac-secret");
    assert.equal(verified.tenant_id, "tenant-1");
    assert.equal(verified.subject, "auth-user-1");
    assert.equal(calls.length, 2);
  } finally { restore(); }
});

test("tenant context does not invent a tenant when active membership is absent", async () => {
  configure();
  globalThis.fetch = async url => String(url).endsWith("/auth/v1/user")
    ? new Response(JSON.stringify({ id: "auth-user-1" }), { status: 200 })
    : new Response("[]", { status: 200 });
  try {
    const response = await tenantContext(request());
    const data = await response.json();
    assert.equal(response.status, 404);
    assert.equal(data.code, "TENANT_SETUP_REQUIRED");
    assert.equal(data.tenant_context, undefined);
  } finally { restore(); }
});

test("tenant context requires explicit selection for multiple active memberships", async () => {
  configure();
  globalThis.fetch = async url => String(url).endsWith("/auth/v1/user")
    ? new Response(JSON.stringify({ id: "auth-user-1" }), { status: 200 })
    : new Response(JSON.stringify([
      { tenant_id: "tenant-1", role: "owner", status: "active" },
      { tenant_id: "tenant-2", role: "member", status: "active" }
    ]), { status: 200 });
  try {
    const response = await tenantContext(request());
    const data = await response.json();
    assert.equal(response.status, 409);
    assert.equal(data.code, "TENANT_SELECTION_REQUIRED");
    assert.equal(data.memberships.length, 2);
    assert.equal(data.tenant_context, undefined);
  } finally { restore(); }
});
