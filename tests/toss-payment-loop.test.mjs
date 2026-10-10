import test from "node:test";
import assert from "node:assert/strict";
import { handler as tossCheckout } from "../netlify/functions/toss-checkout.mjs";
import { handler as tossConfirm } from "../netlify/functions/toss-confirm.mjs";
import { handler as entitlement } from "../netlify/functions/entitlement.mjs";

const body = (response) => JSON.parse(response.body);
const userId = "00000000-0000-4000-8000-000000000001";
const userToken = "e2e-contract-user-token";

test("Toss Quick Audit checkout → approval → paid ledger → entitlement → duplicate-confirm idempotency", async (t) => {
  const oldFetch = globalThis.fetch;
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "PRODUCT_PRICE_QUICK_AUDIT"];
  const oldEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SUPABASE_URL: "https://supabase.contract.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-contract-only",
    TOSS_CLIENT_KEY: "test_ck_contract",
    TOSS_SECRET_KEY: "test_sk_contract",
    PRODUCT_PRICE_QUICK_AUDIT: "200000"
  });
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const key of envNames) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  });

  const order = { order_id: "", auth_user_id: userId, product_key: "AI_QUICK_AUDIT", amount: 200000, currency: "KRW", status: "pending", payment_key: null, paid_at: null };
  const calls = [];
  let providerConfirmCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    calls.push({ target, method });
    if (target.endsWith("/auth/v1/user")) {
      assert.equal(options.headers?.Authorization, "Bearer " + userToken);
      return new Response(JSON.stringify({ id: userId, email: "e2e-buyer@example.test" }), { status: 200 });
    }
    if (target.includes("/rest/v1/toss_payment_orders") && method === "POST") {
      const created = JSON.parse(options.body);
      Object.assign(order, created);
      assert.equal(order.amount, 200000);
      assert.equal(order.currency, "KRW");
      assert.equal(order.status, "pending");
      return new Response(null, { status: 201 });
    }
    if (target.includes("/rest/v1/toss_payment_orders") && method === "GET") {
      const query = new URL(target).searchParams;
      if (query.get("order_id") === "eq." + order.order_id && query.get("auth_user_id") === "eq." + userId) {
        return new Response(JSON.stringify([structuredClone(order)]), { status: 200 });
      }
      if (query.get("status") === "eq.paid" && query.get("auth_user_id") === "eq." + userId) {
        return new Response(JSON.stringify(order.status === "paid" ? [structuredClone(order)] : []), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }
    if (target.endsWith("/v1/payments/confirm") && method === "POST") {
      providerConfirmCalls += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.orderId, order.order_id);
      assert.equal(payload.amount, 200000);
      return new Response(JSON.stringify({
        paymentKey: "sandbox_payment_key_contract",
        orderId: order.order_id,
        totalAmount: 200000,
        currency: "KRW",
        status: "DONE",
        approvedAt: "2026-10-10T02:00:00+09:00",
        method: "카드"
      }), { status: 200 });
    }
    if (target.includes("/rest/v1/toss_payment_orders") && method === "PATCH") {
      const query = new URL(target).searchParams;
      assert.equal(query.get("status"), "eq.pending", "ledger update must be conditional on pending status");
      const patch = JSON.parse(options.body);
      order.status = patch.status;
      order.payment_key = patch.payment_key;
      order.paid_at = patch.paid_at;
      return new Response(JSON.stringify([structuredClone(order)]), { status: 200 });
    }
    if (target.includes("/rest/v1/payment_entitlements")) return new Response("[]", { status: 200 });
    if (target.includes("/rest/v1/store_entitlements")) return new Response("[]", { status: 200 });
    throw new Error("Unexpected contract-test request: " + method + " " + target);
  };

  const checkout = await tossCheckout({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + userToken },
    body: JSON.stringify({ amount: 200000, productKey: "AI_QUICK_AUDIT" })
  });
  assert.equal(checkout.statusCode, 200);
  const checkoutData = body(checkout);
  assert.equal(checkoutData.amount, 200000);
  assert.equal(checkoutData.currency, "KRW");
  assert.equal(checkoutData.provider, "toss");
  assert.match(checkoutData.orderId, /^toss_[a-f0-9]{32}$/);
  assert.equal(order.order_id, checkoutData.orderId);

  const confirmEvent = {
    httpMethod: "POST",
    headers: { authorization: "Bearer " + userToken },
    body: JSON.stringify({ paymentKey: "sandbox_payment_key_contract", orderId: checkoutData.orderId, amount: 200000 })
  };
  const confirmed = await tossConfirm(confirmEvent);
  assert.equal(confirmed.statusCode, 200);
  assert.equal(body(confirmed).verified, true);
  assert.equal(order.status, "paid");
  assert.equal(order.payment_key, "sandbox_payment_key_contract");
  assert.equal(providerConfirmCalls, 1);

  const entitlementResult = await entitlement({
    httpMethod: "GET",
    headers: { authorization: "Bearer " + userToken },
    queryStringParameters: { session_id: checkoutData.orderId }
  });
  assert.equal(entitlementResult.statusCode, 200);
  assert.equal(body(entitlementResult).verified, true);
  assert.equal(body(entitlementResult).source, "toss");
  assert.equal(body(entitlementResult).order_id, checkoutData.orderId);

  const duplicate = await tossConfirm(confirmEvent);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(body(duplicate).verified, true);
  assert.equal(body(duplicate).idempotent, true);
  assert.equal(providerConfirmCalls, 1, "duplicate confirmation must not call Toss again");
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1, "duplicate confirmation must not write a second paid transition");
  console.log("TOSS_PAYMENT_LOOP_CONTRACT=PASS");
  console.log("TOSS_PROVIDER_RECEIPT=MOCKED_CONTRACT_FIXTURE_NOT_REAL_SANDBOX_RECEIPT");
  console.log("TOSS_LEDGER=PAID_IN_MEMORY_FIXTURE");
  console.log("TOSS_ENTITLEMENT=VERIFIED_BY_HANDLER_CONTRACT");
  console.log("TOSS_IDEMPOTENCY=PASS");
});

test("Toss confirm rejects invalid amount before any network request", async (t) => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network must not be called for a tampered amount"); };
  t.after(() => { globalThis.fetch = oldFetch; });
  const result = await tossConfirm({
    httpMethod: "POST",
    headers: { authorization: "Bearer " + userToken },
    body: JSON.stringify({ paymentKey: "invalid", orderId: "toss_invalid", amount: 199999 })
  });
  assert.equal(result.statusCode, 400);
  assert.equal(body(result).error, "AMOUNT_MISMATCH");
});
