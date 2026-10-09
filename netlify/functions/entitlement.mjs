import { QUICK_AUDIT_PRICE_KRW } from "../../mobile/product-catalog.mjs";

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function env(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}
export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
  const params = event.queryStringParameters || {};
  const sessionId = String(params.session_id || "").trim();
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json(401, { error: "AUTH_REQUIRED", verified: false });
  const email = String(params.email || "").trim().toLowerCase();
  if (!sessionId) return json(400, { error: "missing_session_id", verified: false });
  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const authResponse = await fetch(supabaseUrl + "/auth/v1/user", { headers: { apikey: serviceRoleKey, Authorization: "Bearer " + bearer } });
  if (!authResponse.ok) return json(401, { error: "AUTH_INVALID", verified: false });
  const authUser = await authResponse.json();
  const authUserId = String(authUser?.id || "").trim();
  if (!authUserId) return json(401, { error: "AUTH_INVALID", verified: false });
  const stripeQuery = new URLSearchParams({ select: "product_key,status,paid_at,checkout_session_id,customer_email,auth_user_id", checkout_session_id: "eq." + sessionId, status: "eq.paid", auth_user_id: "eq." + authUserId });
  if (email) stripeQuery.set("customer_email", "eq." + email);
  const stripeResponse = await fetch(supabaseUrl + "/rest/v1/payment_entitlements?" + stripeQuery.toString(), { headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey } });
  if (!stripeResponse.ok) return json(503, { error: "entitlement_store_unavailable", verified: false });
  const stripeRows = await stripeResponse.json();
  const stripeRow = Array.isArray(stripeRows) ? stripeRows.find(item => item.product_key === "AI_QUICK_AUDIT" && item.status === "paid") : null;

  const tossQuery = new URLSearchParams({ select: "order_id,auth_user_id,product_key,amount,currency,status,paid_at,payment_key", auth_user_id: "eq." + authUserId, product_key: "eq.AI_QUICK_AUDIT", status: "eq.paid" });
  if (sessionId.startsWith("toss_")) tossQuery.set("order_id", "eq." + sessionId.slice(5));
  const tossResponse = await fetch(supabaseUrl + "/rest/v1/toss_payment_orders?" + tossQuery.toString(), { headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey } });
  if (!tossResponse.ok) return json(503, { error: "entitlement_store_unavailable", verified: false });
  const tossRows = await tossResponse.json();
  const tossRow = Array.isArray(tossRows) ? tossRows.find(item => Number(item.amount) === Number(process.env.PRODUCT_PRICE_QUICK_AUDIT || QUICK_AUDIT_PRICE_KRW) && item.currency === "KRW") : null;

  const storeQuery = new URLSearchParams({ select: "platform,product_id,transaction_id,order_id,status,purchased_at,auth_user_id", auth_user_id: "eq." + authUserId, product_id: "eq." + String(process.env.AIMPACT_IAP_PRODUCT_ID || "ai.aimpact.quick_audit"), status: "eq.active" });
  const storeResponse = await fetch(supabaseUrl + "/rest/v1/store_entitlements?" + storeQuery.toString(), { headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey } });
  if (!storeResponse.ok) return json(503, { error: "entitlement_store_unavailable", verified: false });
  const storeRows = await storeResponse.json();
  const storeRow = Array.isArray(storeRows) && storeRows[0];

  if (stripeRow) return json(200, { verified: true, source: "stripe", product_key: stripeRow.product_key, paid_at: stripeRow.paid_at, checkout_session_id: stripeRow.checkout_session_id, customer_email: stripeRow.customer_email || null });
  if (tossRow) return json(200, { verified: true, source: "toss", product_key: tossRow.product_key, paid_at: tossRow.paid_at, order_id: tossRow.order_id });
  if (storeRow) return json(200, { verified: true, source: storeRow.platform, product_key: "AI_QUICK_AUDIT", paid_at: storeRow.purchased_at, transaction_id: storeRow.transaction_id, order_id: storeRow.order_id || null });
  return json(200, { verified: false, reason: "payment_not_verified" });
}