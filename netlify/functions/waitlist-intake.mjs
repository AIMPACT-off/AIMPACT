import { createHmac } from "node:crypto";

const MAX_BODY_BYTES = 12_000;
const NOTICE_VERSION = "2026-10-04";
const DEFAULT_ORIGIN = "https://aimpact-ai.netlify.app";

function response(statusCode, payload, origin) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin"
    },
    body: JSON.stringify(payload)
  };
}
function clean(value, max) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
}
function validEmail(value) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function validWebsite(value) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:"; } catch { return false; }
}
function fail(statusCode, message, origin) {
  return response(statusCode, { ok: false, message }, origin);
}

export async function handler(event) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const requestOrigin = event.headers?.origin || event.headers?.Origin || "";
  if (requestOrigin !== allowedOrigin) return fail(403, "Origin not allowed.", allowedOrigin);
  if (event.httpMethod === "OPTIONS") return response(204, {}, allowedOrigin);
  if (event.httpMethod !== "POST") return fail(405, "Method not allowed.", allowedOrigin);

  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";
  if (!contentType.toLowerCase().includes("application/json")) return fail(415, "JSON required.", allowedOrigin);
  if (typeof event.body !== "string" || Buffer.byteLength(event.body, "utf8") > MAX_BODY_BYTES) return fail(413, "Request too large.", allowedOrigin);

  let input;
  try { input = JSON.parse(event.body); } catch { return fail(400, "Invalid JSON.", allowedOrigin); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "Invalid request.", allowedOrigin);
  if (clean(input.website_confirm, 200)) return response(202, { ok: true }, allowedOrigin); // honeypot

  const company = clean(input.company, 160);
  const name = clean(input.name, 120);
  const email = clean(input.email, 320).toLowerCase();
  const website = clean(input.website, 500);
  const problem = clean(input.problem, 4000);
  const channel = clean(input.channel, 80) || "Email";
  if (!company || !name || !validEmail(email) || !problem || !validWebsite(website) || input.consent !== true) {
    return fail(400, "Please check the required fields and consent.", allowedOrigin);
  }
  if (input.notice_version !== NOTICE_VERSION) return fail(400, "Please refresh the privacy notice before submitting.", allowedOrigin);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!supabaseUrl || !serviceKey || !hmacSecret) return fail(503, "Intake is not configured.", allowedOrigin);

  const ip = event.headers?.["x-nf-client-connection-ip"] || "unknown";
  if (ip === "unknown") return fail(503, "Request metadata unavailable.", allowedOrigin);
  const ipHash = createHmac("sha256", hmacSecret).update(ip).digest("hex");
  const root = supabaseUrl.replace(/\/$/, "");
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };

  try {
    const limit = await fetch(`${root}/rest/v1/rpc/consume_waitlist_rate_limit`, {
      method: "POST", headers, body: JSON.stringify({ p_key_hash: ipHash, p_window_seconds: 3600, p_max_requests: 5 }),
      signal: AbortSignal.timeout(8000)
    });
    if (!limit.ok) return fail(503, "Intake temporarily unavailable.", allowedOrigin);
    const allowed = await limit.json();
    if (allowed !== true) return fail(429, "Please try again later.", allowedOrigin);

    const insert = await fetch(`${root}/rest/v1/waitlist_submissions`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        company_name: company, contact_name: name, work_email: email,
        company_website: website || null, business_problem: problem, preferred_channel: channel,
        consent: true, consent_notice_version: NOTICE_VERSION, consented_at: new Date().toISOString(),
        requester_ip_hash: ipHash
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!insert.ok) return fail(503, "Intake temporarily unavailable.", allowedOrigin);
    return response(202, { ok: true, message: "Request received." }, allowedOrigin);
  } catch {
    return fail(503, "Intake temporarily unavailable.", allowedOrigin);
  }
}
