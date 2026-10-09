import test from "node:test";
import assert from "node:assert/strict";
import { QUICK_AUDIT_PRICE_KRW, QUICK_AUDIT_CURRENCY, QUICK_AUDIT_PRODUCT_KEY } from "../mobile/product-catalog.mjs";
import { handler as tossCheckout } from "../netlify/functions/toss-checkout.mjs";
import { handler as tossConfirm } from "../netlify/functions/toss-confirm.mjs";
import { handler as tossWebhook } from "../netlify/functions/toss-webhook.mjs";

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
