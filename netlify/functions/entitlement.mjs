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
  const bearer = authorization.match(/^Bearer\\s+(.+)$/i)?.[1] || "";
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
  const query = new URLSearchParams({ select: "product_key,status,paid_at,checkout_session_id,customer_email,auth_user_id", checkout_session_id: "eq." + sessionId, status: "eq.paid", auth_user_id: "eq." + authUserId });
  if (email) query.set("customer_email", "eq." + email);
  const response = await fetch(supabaseUrl + "/rest/v1/payment_entitlements?" + query.toString(), { headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey } });
  if (!response.ok) return json(503, { error: "entitlement_store_unavailable", verified: false });
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows.find(item => item.product_key === "AI_QUICK_AUDIT" && item.status === "paid") : null;
  if (!row) return json(200, { verified: false, reason: "payment_not_verified" });
  return json(200, { verified: true, product_key: row.product_key, paid_at: row.paid_at, checkout_session_id: row.checkout_session_id, customer_email: row.customer_email || null });
}