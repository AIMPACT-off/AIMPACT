import crypto from "node:crypto";

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function env(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error("Missing required environment variable: " + name);
  return String(value);
}
function b64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) throw new Error("TOKEN_INVALID");
  return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4), "base64").toString("utf8"));
}
function appleJwt() {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: env("APPLE_KEY_ID"), typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: env("APPLE_ISSUER_ID"), iat: now, exp: now + 300, aud: "appstoreconnect-v1", bid: env("APPLE_BUNDLE_ID") }));
  const input = header + "." + payload;
  const signature = crypto.sign("sha256", Buffer.from(input), { key: env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" });
  return input + "." + signature.toString("base64url");
}
async function googleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"), scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const input = header + "." + payload;
  const signature = crypto.createSign("RSA-SHA256").update(input).sign(env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: input + "." + signature })
  });
  if (!response.ok) throw new Error("GOOGLE_OAUTH_FAILED");
  const body = await response.json();
  if (!body.access_token) throw new Error("GOOGLE_ACCESS_TOKEN_MISSING");
  return body.access_token;
}
async function authUser(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) throw Object.assign(new Error("AUTH_REQUIRED"), { statusCode: 401 });
  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(supabaseUrl + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + bearer } });
  if (!response.ok) throw Object.assign(new Error("AUTH_INVALID"), { statusCode: 401 });
  const user = await response.json();
  if (!user?.id) throw Object.assign(new Error("AUTH_INVALID"), { statusCode: 401 });
  return { supabaseUrl, key, user };
}
async function persist({ supabaseUrl, key, user, platform, productId, transactionId, orderId, purchasedAt, metadata }) {
  const tenant = await fetch(supabaseUrl + "/rest/v1/rpc/aimpact_get_or_create_tenant", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_auth_user_id: user.id, p_company_name: null, p_email: user.email || null })
  });
  if (!tenant.ok) throw new Error("TENANT_STORE_UNAVAILABLE");
  const tenantId = await tenant.json();
  const response = await fetch(supabaseUrl + "/rest/v1/store_entitlements?on_conflict=platform%2Ctransaction_id", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ auth_user_id: user.id, tenant_id: tenantId, platform, product_id: productId, transaction_id: transactionId, order_id: orderId || null, status: "active", purchased_at: purchasedAt || null, metadata })
  });
  if (!response.ok) throw new Error("ENTITLEMENT_STORE_UNAVAILABLE");
}
async function verifyApple(purchase) {
  const token = String(purchase.purchaseToken || "");
  const untrusted = decodeJwtPayload(token);
  const transactionId = String(purchase.transactionId || untrusted.transactionId || "");
  const productId = String(purchase.productId || untrusted.productId || "");
  if (!transactionId || !productId) throw new Error("APPLE_TRANSACTION_FIELDS_MISSING");
  const host = String(process.env.APPLE_ENVIRONMENT || "production").toLowerCase() === "sandbox" ? "https://api.storekit-sandbox.apple.com" : "https://api.storekit.apple.com";
  const response = await fetch(host + "/inApps/v1/transactions/" + encodeURIComponent(transactionId), { headers: { Authorization: "Bearer " + appleJwt() } });
  if (!response.ok) throw new Error("APPLE_TRANSACTION_NOT_VERIFIED");
  const body = await response.json();
  const signed = body?.signedTransactionInfo;
  const verified = decodeJwtPayload(signed);
  if (verified.bundleId !== env("APPLE_BUNDLE_ID") || verified.productId !== productId || String(verified.transactionId) !== transactionId) throw new Error("APPLE_TRANSACTION_MISMATCH");
  return { transactionId, productId, orderId: transactionId, purchasedAt: verified.purchaseDate ? new Date(Number(verified.purchaseDate)).toISOString() : null, metadata: { environment: verified.environment || "unknown", originalTransactionId: verified.originalTransactionId || null } };
}
async function verifyGoogle(purchase) {
  const token = String(purchase.purchaseToken || "");
  const productId = String(purchase.productId || "");
  if (!token || !productId) throw new Error("GOOGLE_TRANSACTION_FIELDS_MISSING");
  const packageName = env("GOOGLE_PACKAGE_NAME");
  const accessToken = await googleAccessToken();
  const base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + encodeURIComponent(packageName) + "/purchases/products/" + encodeURIComponent(productId) + "/tokens/" + encodeURIComponent(token);
  const response = await fetch(base, { headers: { Authorization: "Bearer " + accessToken } });
  if (!response.ok) throw new Error("GOOGLE_PURCHASE_NOT_VERIFIED");
  const body = await response.json();
  if (Number(body.purchaseState) !== 0 || body.productId !== productId) throw new Error("GOOGLE_PURCHASE_NOT_PAID");
  if (Number(body.acknowledgementState) === 0) {
    const ack = await fetch(base + ":acknowledge", { method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!ack.ok && ack.status !== 409) throw new Error("GOOGLE_ACKNOWLEDGE_FAILED");
  }
  return { transactionId: token, productId, orderId: body.orderId || null, purchasedAt: body.purchaseTimeMillis ? new Date(Number(body.purchaseTimeMillis)).toISOString() : null, metadata: { purchaseType: body.purchaseType ?? null, regionCode: body.regionCode || null } };
}
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed", verified: false });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json", verified: false }); }
  try {
    const { supabaseUrl, key, user } = await authUser(event);
    const platform = String(body.platform || "").toLowerCase();
    const productId = String(body.productId || "");
    const expected = String(process.env.AIMPACT_IAP_PRODUCT_ID || "ai.aimpact.quick_audit");
    if (!["ios", "android"].includes(platform) || !productId || productId !== expected) return json(400, { error: "INVALID_STORE_PRODUCT", verified: false });
    let verified;
    if (platform === "ios") {
      if (!process.env.APPLE_ISSUER_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY || !process.env.APPLE_BUNDLE_ID) return json(503, { error: "STORE_PROVIDER_NOT_CONFIGURED", verified: false, platform });
      verified = await verifyApple(body);
    } else {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !process.env.GOOGLE_PACKAGE_NAME) return json(503, { error: "STORE_PROVIDER_NOT_CONFIGURED", verified: false, platform });
      verified = await verifyGoogle(body);
    }
    await persist({ supabaseUrl, key, user, platform, productId: verified.productId, transactionId: verified.transactionId, orderId: verified.orderId, purchasedAt: verified.purchasedAt, metadata: verified.metadata });
    return json(200, { verified: true, entitlement: "AI_QUICK_AUDIT", platform, productId: verified.productId, transactionId: verified.transactionId });
  } catch (error) {
    return json(Number(error?.statusCode) || 503, { error: error.message || "STORE_VERIFICATION_FAILED", verified: false });
  }
}
