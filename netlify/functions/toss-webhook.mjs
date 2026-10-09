import { QUICK_AUDIT_PRICE_KRW } from "../../lib/product-catalog.mjs";

const PRODUCT_KEY = "AI_QUICK_AUDIT";
const PRODUCT_AMOUNT = Number(process.env.PRODUCT_PRICE_QUICK_AUDIT || QUICK_AUDIT_PRICE_KRW);

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function env(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error("Missing required environment variable: " + name);
  return String(value).trim();
}
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json" }); }
  const paymentKey = String(body.paymentKey || body.data?.paymentKey || "").trim();
  const orderId = String(body.orderId || body.data?.orderId || "").trim();
  if (!paymentKey || !orderId) return json(400, { error: "missing_payment_reference" });
  if (!Number.isSafeInteger(PRODUCT_AMOUNT) || PRODUCT_AMOUNT !== 200000) return json(503, { error: "PRODUCT_PRICE_CONFIGURATION_INVALID" });

  let url, key, secret;
  try {
    url = env("SUPABASE_URL").replace(/\/$/, "");
    key = env("SUPABASE_SERVICE_ROLE_KEY");
    secret = env("TOSS_SECRET_KEY");
  } catch { return json(503, { error: "payment_provider_not_configured" }); }

  const auth = Buffer.from(secret + ":", "utf8").toString("base64");
  let paymentResponse;
  try {
    paymentResponse = await fetch("https://api.tosspayments.com/v1/payments/" + encodeURIComponent(paymentKey), {
      headers: { Authorization: "Basic " + auth }
    });
  } catch { return json(503, { error: "toss_api_unavailable" }); }
  if (!paymentResponse.ok) return json(400, { error: "toss_payment_unverified" });
  const payment = await paymentResponse.json();
  if (payment.orderId !== orderId || Number(payment.totalAmount) !== PRODUCT_AMOUNT || payment.status !== "DONE" || (payment.currency && payment.currency !== "KRW")) {
    return json(200, { received: true, verified: false, ignored: "payment_not_eligible" });
  }

  const lookup = new URLSearchParams({ select: "order_id,product_key,amount,currency,status,payment_key", order_id: "eq." + orderId, limit: "1" });
  const orderResponse = await fetch(url + "/rest/v1/toss_payment_orders?" + lookup, { headers: { apikey: key, Authorization: "Bearer " + key } });
  if (!orderResponse.ok) return json(503, { error: "payment_order_lookup_failed" });
  const orders = await orderResponse.json();
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order || order.product_key !== PRODUCT_KEY || Number(order.amount) !== PRODUCT_AMOUNT || order.currency !== "KRW") return json(404, { error: "payment_order_not_found" });
  if (order.status === "paid") {
    return order.payment_key === paymentKey ? json(200, { received: true, verified: true, idempotent: true }) : json(409, { error: "payment_key_conflict" });
  }
  if (order.status !== "pending") return json(409, { error: "payment_order_not_pending" });

  const update = await fetch(url + "/rest/v1/toss_payment_orders?" + new URLSearchParams({ order_id: "eq." + orderId, status: "eq.pending" }), {
    method: "PATCH",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", payment_key: paymentKey, paid_at: payment.approvedAt || new Date().toISOString(), metadata: { source: "toss_webhook", method: payment.method || null } })
  });
  if (!update.ok) return json(503, { error: "entitlement_store_unavailable" });
  const rows = await update.json();
  if (!Array.isArray(rows) || rows.length !== 1) return json(409, { error: "payment_already_processed" });
  return json(200, { received: true, verified: true, entitlement: PRODUCT_KEY });
}
