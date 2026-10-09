import crypto from "node:crypto";
import { QUICK_AUDIT_PRICE_KRW, QUICK_AUDIT_CURRENCY } from "../../lib/product-catalog.mjs";

const PAYMENT_LINK_ID = process.env.AIMPACT_QUICK_AUDIT_PAYMENT_LINK_ID || "plink_1UNpJEGeNSkj4zfGecYTrM3u";
const QUICK_AUDIT_AMOUNT = Number(process.env.PRODUCT_PRICE_QUICK_AUDIT || QUICK_AUDIT_PRICE_KRW);
const QUICK_AUDIT_CURRENCY = QUICK_AUDIT_CURRENCY.toLowerCase();

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

export function verifyStripeSignature(rawBody, signature, secret, toleranceSeconds = 300) {
  if (!signature || !secret) return false;
  const parts = Object.fromEntries(signature.split(",").map(part => {
    const [key, value] = part.split("=", 2);
    return [key, value];
  }));
  const timestamp = Number(parts.t);
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp) + "." + rawBody, "utf8").digest("hex");
  const supplied = parts.v1 || "";
  const valid = supplied.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  return valid && Number.isFinite(timestamp) && Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= toleranceSeconds;
}

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const rawBody = event.body || "";
  const signature = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  if (!verifyStripeSignature(rawBody, signature, env("STRIPE_WEBHOOK_SECRET"))) {
    return json(400, { error: "invalid_signature" });
  }

  let stripeEvent;
  try { stripeEvent = JSON.parse(rawBody); }
  catch { return json(400, { error: "invalid_json" }); }

  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true, ignored: stripeEvent.type });
  }

  const session = stripeEvent.data?.object || {};
  const paymentLink = session.payment_link || "";
  const paid = session.payment_status === "paid";
  const amount = Number(session.amount_total);
  const currency = String(session.currency || "").toLowerCase();

  const productKey = String(session.metadata?.product_key || "").trim();
  const eligibleProduct = paymentLink === PAYMENT_LINK_ID || productKey === "AI_QUICK_AUDIT";
  if (!eligibleProduct || !paid || amount !== QUICK_AUDIT_AMOUNT || currency !== QUICK_AUDIT_CURRENCY) {
    return json(400, {
      error: "payment_not_eligible",
      payment_link: paymentLink || null,
      payment_status: session.payment_status || null,
      amount,
      currency
    });
  }

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const rpcName = process.env.AIMPACT_PAYMENT_RPC || "aimpact_record_verified_payment";

  const authUserId = String(session.client_reference_id || session.metadata?.auth_user_id || "").trim() || null;

  const response = await fetch(supabaseUrl + "/rest/v1/rpc/" + rpcName, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_stripe_event_id: stripeEvent.id,
      p_checkout_session_id: session.id,
      p_payment_link_id: paymentLink || "checkout_session",
      p_amount: amount,
      p_currency: currency,
      p_customer_email: session.customer_details?.email || null,
      p_customer_name: session.customer_details?.name || null,
      p_customer_id: session.customer || null,
      p_paid_at: session.created ? new Date(session.created * 1000).toISOString() : null,
      p_metadata: session.metadata || {},
      p_auth_user_id: authUserId
    })
  });

  if (!response.ok) return json(503, { error: "entitlement_store_unavailable" });

  return json(200, { received: true, verified: true, entitlement: "AI_QUICK_AUDIT" });
}
