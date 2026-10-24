import test from "node:test";
import assert from "node:assert/strict";

const originalEnv = { ...process.env };
process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.AIMPACT_AUDIT_MODEL = "test-model";
const { handler } = await import("../netlify/functions/audit.mjs?payment-gate-test");
const realFetch = globalThis.fetch;
const authUserId = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function requestEvent() {
  return {
    httpMethod: "POST",
    headers: { authorization: "Bearer test-user-token" },
    body: JSON.stringify({ company: "Example Co", email: "owner@example.com", industry: "Retail", problem: "Manual inventory reporting consumes 20 hours per month." })
  };
}
function installFetch({ entitled }) {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, method: options.method || "GET" });
    if (url.endsWith("/auth/v1/user")) return jsonResponse({ id: authUserId, email: "owner@example.com" });
    if (url.includes("/rest/v1/store_entitlements?")) return jsonResponse(entitled ? [{ product_id: "ai.aimpact.quick_audit", status: "active" }] : []);
    if (url.includes("/rest/v1/toss_payment_orders?") || url.includes("/rest/v1/payment_entitlements?")) return jsonResponse([]);
    if (url.endsWith("/rest/v1/rpc/aimpact_get_or_create_tenant")) return jsonResponse("22222222-2222-4222-8222-222222222222");
    if (url === "https://api.openai.com/v1/chat/completions") {
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ score: 71, category: "Operations", summary: "Evidence summary", conclusion: "Review the workflow", workflow: "Map, automate, review", confidence: "low" }) } }] });
    }
    if (url.includes("/rest/v1/execution_logs") || url.includes("/rest/v1/audit_logs")) return new Response(null, { status: 201 });
    throw new Error("UNEXPECTED_TEST_FETCH: " + url);
  };
  return calls;
}

test.after(() => {
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("unpaid authenticated audit is rejected before tenant creation and billable AI", async () => {
  const calls = installFetch({ entitled: false });
  const response = await handler(requestEvent());
  assert.equal(response.statusCode, 402);
  assert.equal(JSON.parse(response.body).error, "PAYMENT_REQUIRED");
  assert.equal(calls.some(call => call.url.includes("api.openai.com")), false);
  assert.equal(calls.some(call => call.url.includes("aimpact_get_or_create_tenant")), false);
});

test("verified Quick Audit entitlement permits one audit generation", async () => {
  const calls = installFetch({ entitled: true });
  const response = await handler(requestEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).generationStatus, "generated");
  assert.equal(JSON.parse(response.body).paymentStatus, "verified");
  assert.equal(calls.filter(call => call.url.includes("api.openai.com")).length, 1);
  assert.equal(calls.filter(call => call.url.includes("/rest/v1/audit_logs")).length, 1);
});