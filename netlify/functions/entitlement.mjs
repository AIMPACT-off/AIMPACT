function env(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });

  const sessionId = event.queryStringParameters?.session_id?.trim();
  const email = event.queryStringParameters?.email?.trim().toLowerCase();

  if (!sessionId || !email) {
    return json(400, { verified: false, error: "session_id_and_email_required" });
  }

  try {
    const base = env("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "product_key,status,paid_at,checkout_session_id",
      checkout_session_id: "eq." + sessionId,
      customer_email: "eq." + email,
      status: "eq.paid",
      limit: "1"
    });

    const response = await fetch(base + "/rest/v1/payment_entitlements?" + params.toString(), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey
      }
    });

    if (!response.ok) return json(503, { verified: false, error: "entitlement_store_unavailable" });

    const rows = await response.json();
    const entitlement = rows[0];

    if (!entitlement || entitlement.product_key !== "AI_QUICK_AUDIT") {
      return json(403, { verified: false, error: "entitlement_not_verified" });
    }

    return json(200, {
      verified: true,
      product_key: entitlement.product_key,
      paid_at: entitlement.paid_at
    });
  } catch {
    return json(503, { verified: false, error: "entitlement_verification_failed" });
  }
}
