import crypto from "node:crypto";

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function env(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json(401, { error: "AUTH_REQUIRED", verified: false });

  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { apikey: serviceRoleKey, Authorization: "Bearer " + bearer }
  });
  if (!authResponse.ok) return json(401, { error: "AUTH_INVALID", verified: false });
  const user = await authResponse.json();
  const authUserId = String(user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!authUserId || !email) return json(401, { error: "AUTH_INVALID", verified: false });

  const stripeKey = env("STRIPE_SECRET_KEY");
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price]", env("AIMPACT_QUICK_AUDIT_PRICE_ID"));
  params.set("line_items[0][quantity]", "1");
  params.set("customer_email", email);
  params.set("client_reference_id", authUserId);
  params.set("metadata[product_key]", "AI_QUICK_AUDIT");
  params.set("metadata[auth_user_id]", authUserId);
  params.set("success_url", env("AIMPACT_CHECKOUT_SUCCESS_URL") + "?session_id={CHECKOUT_SESSION_ID}");
  params.set("cancel_url", env("AIMPACT_CHECKOUT_CANCEL_URL"));

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + stripeKey,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  if (!response.ok) return json(503, { error: "CHECKOUT_UNAVAILABLE", verified: false });
  const checkout = await response.json();
  if (!checkout?.url) return json(502, { error: "CHECKOUT_URL_MISSING", verified: false });
  return json(200, { verified: true, checkoutUrl: checkout.url, sessionId: checkout.id });
}
