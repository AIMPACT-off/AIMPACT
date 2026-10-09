import test from "node:test";
import assert from "node:assert/strict";
import { QUICK_AUDIT_PRICE_KRW, QUICK_AUDIT_CURRENCY, QUICK_AUDIT_PRODUCT_KEY } from "../mobile/product-catalog.mjs";
import { handler as tossCheckout } from "../netlify/functions/toss-checkout.mjs";
import { handler as tossConfirm } from "../netlify/functions/toss-confirm.mjs";
import { handler as tossWebhook } from "../netlify/functions/toss-webhook.mjs";
import { handler as entitlement } from "../netlify/functions/entitlement.mjs";

const responseBody = (response) => JSON.parse(response.body);

test("Quick Audit catalog fixes the commercial contract at KRW 200000", () => {
  assert.equal(QUICK_AUDIT_PRICE_KRW, 200000);
  assert.equal(QUICK_AUDIT_CURRENCY, "KRW");
  assert.equal(QUICK_AUDIT_PRODUCT_KEY, "AI_QUICK_AUDIT");
});

test("Toss checkout rejects unauthenticated callers before creating an order", async () => {
  const response = await tossCheckout({ httpMethod: "POST", headers: {}, body: JSON.stringify({ amount: 200000 }) });
  assert.equal(response.statusCode, 401);
  assert.equal(responseBody(response).verified, false);
});

test("Toss confirm rejects unauthenticated callers", async () => {
  const response = await tossConfirm({ httpMethod: "POST", headers: {}, body: JSON.stringify({ paymentKey: "pk_test", orderId: "order_test", amount: 200000 }) });
  assert.equal(response.statusCode, 401);
  assert.equal(responseBody(response).verified, false);
});

test("Toss confirm rejects amount tampering before contacting providers", async () => {
  const response = await tossConfirm({
    httpMethod: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({ paymentKey: "pk_test", orderId: "order_test", amount: 199999 })
  });
  assert.equal(response.statusCode, 400);
  assert.equal(responseBody(response).error, "AMOUNT_MISMATCH");
  assert.equal(responseBody(response).verified, false);
});

test("Toss webhook rejects non-POST requests", async () => {
  const response = await tossWebhook({ httpMethod: "GET", headers: {}, body: "" });
  assert.equal(response.statusCode, 405);
});

test("Toss confirm grants the paid state only after provider verification and conditional ledger update", async (t) => {
  const previousFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOSS_SECRET_KEY", "PRODUCT_PRICE_QUICK_AUDIT"];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  process.env.TOSS_SECRET_KEY = "toss-test-secret";
  process.env.PRODUCT_PRICE_QUICK_AUDIT = "200000";
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  });

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, method: options.method || "GET" });
    if (target.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", email: "buyer@example.com" }), { status: 200 });
    }
    if (target.includes("/rest/v1/toss_payment_orders?") && (options.method || "GET") === "GET") {
      return new Response(JSON.stringify([{
        order_id: "toss_test_order",
        auth_user_id: "00000000-0000-4000-8000-000000000001",
        product_key: "AI_QUICK_AUDIT",
        amount: 200000,
        currency: "KRW",
        status: "pending",
        payment_key: null
      }]), { status: 200 });
    }
    if (target.endsWith("/v1/payments/confirm")) {
      return new Response(JSON.stringify({
        paymentKey: "payment_test_key",
        orderId: "toss_test_order",
        totalAmount: 200000,
        currency: "KRW",
        status: "DONE",
        approvedAt: "2026-10-09T09:00:00+09:00",
        method: "카드"
      }), { status: 200 });
    }
    if (target.includes("/rest/v1/toss_payment_orders?") && options.method === "PATCH") {
      const patch = JSON.parse(options.body);
      assert.equal(patch.status, "paid");
      assert.equal(patch.payment_key, "payment_test_key");
      assert.equal(patch.amount, undefined);
      return new Response(JSON.stringify([{ order_id: "toss_test_order", status: "paid", payment_key: "payment_test_key" }]), { status: 200 });
    }
    throw new Error("Unexpected mocked network call: " + target);
  };

  const response = await tossConfirm({
    httpMethod: "POST",
    headers: { authorization: "Bearer user-access-token" },
    body: JSON.stringify({ paymentKey: "payment_test_key", orderId: "toss_test_order", amount: 200000 })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(responseBody(response).verified, true);
  assert.equal(responseBody(response).provider, "toss");
  assert.ok(calls.some((call) => call.url.endsWith("/v1/payments/confirm")));
  assert.ok(calls.some((call) => call.method === "PATCH"));
});


test("Toss entitlement lookup preserves the complete order ID returned to the customer", async (t) => {
  const previousFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  });

  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    requestedUrls.push(target);
    if (target.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), { status: 200 });
    }
    if (target.includes("/rest/v1/payment_entitlements?")) return new Response("[]", { status: 200 });
    if (target.includes("/rest/v1/toss_payment_orders?")) {
      assert.match(target, /order_id=eq\.toss_order_123/);
      return new Response(JSON.stringify([{
        order_id: "toss_order_123",
        auth_user_id: "00000000-0000-4000-8000-000000000001",
        product_key: "AI_QUICK_AUDIT",
        amount: 200000,
        currency: "KRW",
        status: "paid",
        payment_key: "payment_test_key",
        paid_at: "2026-10-09T09:00:00+09:00"
      }]), { status: 200 });
    }
    if (target.includes("/rest/v1/store_entitlements?")) return new Response("[]", { status: 200 });
    throw new Error("Unexpected mocked network call: " + target);
  };

  const response = await entitlement({
    httpMethod: "GET",
    headers: { authorization: "Bearer user-access-token" },
    queryStringParameters: { session_id: "toss_order_123" }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(responseBody(response).verified, true);
  assert.equal(responseBody(response).source, "toss");
  assert.equal(responseBody(response).order_id, "toss_order_123");
  assert.ok(requestedUrls.some(url => url.includes("order_id=eq.toss_order_123")));
});
