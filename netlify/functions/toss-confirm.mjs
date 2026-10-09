import { QUICK_AUDIT_PRICE_KRW } from "../../mobile/product-catalog.mjs";

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
async function getUser(bearer) {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(url + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + bearer } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? String(user.id) : null;
}
async function fetchOrder(url, key, orderId, userId) {
  const q = new URLSearchParams({ select: "order_id,auth_user_id,product_key,amount,currency,status,payment_key,paid_at", order_id: "eq." + orderId, auth_user_id: "eq." + userId, limit: "1" });
  const r = await fetch(url + "/rest/v1/toss_payment_orders?" + q, { headers: { apikey: key, Authorization: "Bearer " + key } });
  if (!r.ok) throw new Error("ORDER_LOOKUP_FAILED");
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function retrieveTossPayment(paymentKey, secret) {
  const auth = Buffer.from(secret + ":", "utf8").toString("base64");
  const response = await fetch("https://api.tosspayments.com/v1/payments/" + encodeURIComponent(paymentKey), {
    headers: { Authorization: "Basic " + auth }
  });
  if (!response.ok) return null;
  return response.json();
}
async function confirmTossPayment(paymentKey, orderId, amount, secret) {
  const auth = Buffer.from(secret + ":", "utf8").toString("base64");
  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!response.ok) return null;
  return response.json();
}
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed", verified: false });
  const bearer = (event.headers?.authorization || event.headers?.Authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json(401, { error: "AUTH_REQUIRED", verified: false });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "INVALID_JSON", verified: false }); }
  const paymentKey = String(body.paymentKey || "").trim();
  const orderId = String(body.orderId || "").trim();
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isSafeInteger(amount)) return json(400, { error: "INVALID_PAYMENT_PARAMETERS", verified: false });
  if (amount !== PRODUCT_AMOUNT) return json(400, { error: "AMOUNT_MISMATCH", verified: false });
  if (!Number.isSafeInteger(PRODUCT_AMOUNT) || PRODUCT_AMOUNT !== 200000) return json(503, { error: "PRODUCT_PRICE_CONFIGURATION_INVALID", verified: false });

  let userId, url, key, secret;
  try {
    userId = await getUser(bearer);
    if (!userId) return json(401, { error: "AUTH_INVALID", verified: false });
    url = env("SUPABASE_URL").replace(/\/$/, "");
    key = env("SUPABASE_SERVICE_ROLE_KEY");
    secret = env("TOSS_SECRET_KEY");
  } catch {
    return json(503, { error: "PAYMENT_PROVIDER_NOT_CONFIGURED", verified: false });
  }

  let order;
  try { order = await fetchOrder(url, key, orderId, userId); }
  catch { return json(503, { error: "PAYMENT_ORDER_LOOKUP_FAILED", verified: false }); }
  if (!order || order.product_key !== PRODUCT_KEY || Number(order.amount) !== PRODUCT_AMOUNT || order.currency !== "KRW") {
    return json(404, { error: "PAYMENT_ORDER_NOT_FOUND", verified: false });
  }
  if (order.status === "paid") {
    return order.payment_key === paymentKey
      ? json(200, { verified: true, idempotent: true, provider: "toss", productKey: PRODUCT_KEY, orderId })
      : json(409, { error: "ORDER_ALREADY_PAID", verified: false });
  }
  if (order.status !== "pending") return json(409, { error: "ORDER_NOT_PAYABLE", verified: false });

  let payment;
  try { payment = await confirmTossPayment(paymentKey, orderId, PRODUCT_AMOUNT, secret); }
  catch { return json(503, { error: "TOSS_API_UNAVAILABLE", verified: false }); }
  if (!payment) {
    // Recover safely if Toss confirmed the payment but the client retried after a timeout.
    try { payment = await retrieveTossPayment(paymentKey, secret); }
    catch { return json(503, { error: "TOSS_API_UNAVAILABLE", verified: false }); }
  }
  if (!payment) return json(402, { error: "TOSS_PAYMENT_NOT_FOUND", verified: false });
  if ((payment.paymentKey && payment.paymentKey !== paymentKey) || payment.orderId !== orderId || Number(payment.totalAmount) !== PRODUCT_AMOUNT || payment.status !== "DONE" || (payment.currency && payment.currency !== "KRW")) {
    return json(409, { error: "TOSS_PAYMENT_VERIFICATION_FAILED", verified: false });
  }

  const updateQuery = new URLSearchParams({ order_id: "eq." + orderId, auth_user_id: "eq." + userId, status: "eq.pending" });
  const update = await fetch(url + "/rest/v1/toss_payment_orders?" + updateQuery, {
    method: "PATCH",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", payment_key: paymentKey, paid_at: payment.approvedAt || new Date().toISOString(), metadata: { toss_status: payment.status, method: payment.method || null } })
  });
  if (!update.ok) return json(503, { error: "ENTITLEMENT_STORE_UNAVAILABLE", verified: false });
  const rows = await update.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    let latest;
    try { latest = await fetchOrder(url, key, orderId, userId); } catch {}
    if (latest?.status === "paid" && latest.payment_key === paymentKey) {
      return json(200, { verified: true, idempotent: true, provider: "toss", productKey: PRODUCT_KEY, orderId });
    }
    return json(409, { error: "PAYMENT_ALREADY_PROCESSED", verified: false });
  }
  return json(200, { verified: true, provider: "toss", productKey: PRODUCT_KEY, orderId, paidAt: payment.approvedAt || null });
}
