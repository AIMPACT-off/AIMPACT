import { signTenantContext } from "../../phase2/auth/tenant-context.mjs";

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const fail = (code, status, extra = {}) =>
  new Response(JSON.stringify({ ok: false, code, ...extra }), { status, headers: HEADERS });

export default async function handler(request) {
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
  if (!match) return fail("SUPABASE_AUTH_JWT_REQUIRED", 401);

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hmacSecret = process.env.TENANT_CONTEXT_HMAC_SECRET;
  if (!url || !anon || !service || !hmacSecret) return fail("TENANT_CONTEXT_SERVER_CONFIG_REQUIRED", 503);

  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 2048) return fail("BODY_TOO_LARGE", 413);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail("INVALID_JSON", 400);
  }
  if (body.tenant_id !== undefined && (typeof body.tenant_id !== "string" || !body.tenant_id.trim())) {
    return fail("INVALID_TENANT_SELECTION", 400);
  }

  try {
    const auth = await fetch(url + "/auth/v1/user", {
      headers: { apikey: anon, Authorization: "Bearer " + match[1] }
    });
    if (!auth.ok) return fail("INVALID_OR_EXPIRED_AUTH", 401);
    const user = await auth.json();
    if (!user?.id) return fail("AUTH_SUBJECT_MISSING", 401);

    const params = new URLSearchParams({
      user_id: "eq." + user.id,
      status: "eq.active",
      select: "tenant_id,role,status"
    });
    if (body.tenant_id) params.set("tenant_id", "eq." + body.tenant_id);

    const membershipsResponse = await fetch(url + "/rest/v1/tenant_memberships?" + params, {
      headers: { apikey: service, Authorization: "Bearer " + service }
    });
    if (!membershipsResponse.ok) return fail("TENANT_MEMBERSHIP_LOOKUP_FAILED", 503);
    const memberships = await membershipsResponse.json();

    if (!Array.isArray(memberships) || memberships.length === 0) {
      return fail(body.tenant_id ? "TENANT_MEMBERSHIP_NOT_FOUND" : "TENANT_SETUP_REQUIRED", 404);
    }
    if (memberships.length !== 1) {
      return fail("TENANT_SELECTION_REQUIRED", 409, {
        memberships: memberships.map(item => ({ tenant_id: item.tenant_id, role: item.role }))
      });
    }

    const membership = memberships[0];
    const exp = Math.floor(Date.now() / 1000) + 900;
    const tenantContext = signTenantContext({
      tenant_id: membership.tenant_id,
      subject: user.id,
      exp
    }, hmacSecret);

    return new Response(JSON.stringify({
      ok: true,
      tenant: { id: membership.tenant_id, role: membership.role },
      tenant_context: tenantContext,
      expires_at: exp
    }), { status: 200, headers: HEADERS });
  } catch {
    return fail("TENANT_CONTEXT_UNAVAILABLE", 503);
  }
}
