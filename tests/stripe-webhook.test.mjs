import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature } from "../netlify/functions/stripe-webhook.mjs";

test("accepts a correctly signed Stripe webhook", () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "whsec_test";
  const signature = crypto.createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  assert.equal(verifyStripeSignature(body, "t=" + timestamp + ",v1=" + signature, secret), true);
});

test("rejects a tampered Stripe webhook", () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "whsec_test";
  const signature = crypto.createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  assert.equal(verifyStripeSignature(body + "x", "t=" + timestamp + ",v1=" + signature, secret), false);
});
