import crypto from "node:crypto";

const PRODUCT_KEY = "AI_QUICK_AUDIT";
const PRODUCT_AMOUNT = Number(process.env.PRODUCT_PRICE_QUICK_AUDIT || 200000);

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
  return user?.id ? { id: String(user.id), email: String(user.email || "") } : null;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed", verified: false });
  const bearer = (event.headers?.authorization || event.headers?.Authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json(401, { error: "AUTH_REQUIRED", verified: false });
  if (!Number.isSafeInteger(PRODUCT_AMOUNT) || PRODUCT_AMOUNT !== 200000) return json(503, { error: "PRODUCT_PRICE_CONFIGURATION_INVALID", verified: false });

  let user;
  try { user = await getUser(bearer); } catch { return json(503, { error: "AUTH_PROVIDER_UNAVAILABLE", verified: false }); }
  if (!user) return json(401, { error: "AUTH_INVALID", verified: false });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "INVALID_JSON", verified: false }); }
  if (body.amount !== undefined && Number(body.amount) !== PRODUCT_AMOUNT) return json(400, { error: "AMOUNT_MISMATCH", verified: false });
  if (body.productKey !== undefined && body.productKey !== PRODUCT_KEY) return json(400, { error: "PRODUCT_MISMATCH", verified: false });

  let supabaseUrl, serviceRoleKey, clientKey;
  try {
    supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
    serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    clientKey = env("TOSS_CLIENT_KEY");
  } catch {
    return json(503, { error: "TOSS_CHECKOUT_NOT_CONFIGURED", verified: false });
  }

  const orderId = "toss_" + crypto.randomUUID().replace(/-/g, "");
  const customerKey = "aim_" + crypto.createHash("sha256").update(user.id).digest("hex").slice(0, 32);
  const response = await fetch(supabaseUrl + "/rest/v1/toss_payment_orders", {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      order_id: orderId,
      auth_user_id: user.id,
      product_key: PRODUCT_KEY,
      amount: PRODUCT_AMOUNT,
      currency: "KRW",
      status: "pending",
      customer_email: user.email || null,
      created_at: new Date().toISOString()
    })
  });
  if (!response.ok) return json(503, { error: "PAYMENT_ORDER_STORE_UNAVAILABLE", verified: false });

  const origin = process.env.AIMPACT_TOSS_RETURN_ORIGIN || "https://aimpact-ai.netlify.app";
  return json(200, {
    verified: false,
    provider: "toss",
    status: "pending",
    clientKey,
    orderId,
    orderName: "AIMPACT AI Quick Audit",
    amount: PRODUCT_AMOUNT,
    currency: "KRW",
    customerKey,
    successUrl: origin + "/payment-success",
    failUrl: origin + "/payment-fail"
  });
}
