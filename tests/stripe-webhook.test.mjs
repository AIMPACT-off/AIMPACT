import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature, isEligiblePaidSession } from "../netlify/functions/stripe-webhook.mjs";

function signed(body, secret = "whsec_test") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  return "t=" + timestamp + ",v1=" + signature;
}

test("accepts a correctly signed Stripe webhook", () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  assert.equal(verifyStripeSignature(body, signed(body), "whsec_test"), true);
});

test("rejects a tampered Stripe webhook", () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  assert.equal(verifyStripeSignature(body + "x", signed(body), "whsec_test"), false);
});

test("rejects an expired Stripe webhook signature", () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000) - 301;
  const signature = crypto.createHmac("sha256", "whsec_test").update(timestamp + "." + body).digest("hex");
  assert.equal(verifyStripeSignature(body, "t=" + timestamp + ",v1=" + signature, "whsec_test"), false);
});


test("accepts a paid AI_QUICK_AUDIT session by product metadata", () => {
  assert.equal(isEligiblePaidSession({
    payment_status: "paid",
    amount_total: 99000,
    currency: "krw",
    payment_link: null,
    metadata: { product_key: "AI_QUICK_AUDIT", e2e: "true" }
  }), true);
});

test("rejects a paid session for another product", () => {
  assert.equal(isEligiblePaidSession({
    payment_status: "paid",
    amount_total: 99000,
    currency: "krw",
    payment_link: null,
    metadata: { product_key: "OTHER_PRODUCT" }
  }), false);
});
