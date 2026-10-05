const HEADERS = {"Content-Type":"application/json","Cache-Control":"no-store"};
const fail = (code, status, extra = {}) =>
  new Response(JSON.stringify({ok:false, code, ...extra}), {status, headers:HEADERS});

async function getVerifiedUser(request, url, anon) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
  if (!match) return {error: fail("SUPABASE_AUTH_JWT_REQUIRED", 401)};
  const auth = await fetch(url + "/auth/v1/user", {
    headers: {apikey: anon, Authorization: "Bearer " + match[1]}
  });
  if (!auth.ok) return {error: fail("INVALID_OR_EXPIRED_AUTH", 401)};
  const user = await auth.json();
  if (!user?.id) return {error: fail("AUTH_SUBJECT_MISSING", 401)};
  return {user, token: match[1]};
}

async function getMembership(url, service, userId, requestedTenantId) {
  const params = new URLSearchParams({
    user_id: "eq." + userId,
    status: "eq.active",
    select: "tenant_id,role,status"
  });
  if (requestedTenantId) params.set("tenant_id", "eq." + requestedTenantId);
  const response = await fetch(url + "/rest/v1/tenant_memberships?" + params, {
    headers: {apikey: service, Authorization: "Bearer " + service}
  });
  if (!response.ok) throw new Error("TENANT_MEMBERSHIP_LOOKUP_FAILED");
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("TENANT_MEMBERSHIP_NOT_FOUND");
  if (rows.length !== 1) throw new Error("TENANT_SELECTION_REQUIRED");
  return rows[0];
}

async function approvedReport(url, service, tenantId, reportId) {
  const params = new URLSearchParams({
    tenant_id: "eq." + tenantId,
    report_status: "eq.APPROVED",
    select: "id,tenant_id,model_provider,model_name,prompt_version,output_schema_version,problem_statement,problem_category,solution_candidates,workflow_recommendation,evidence,confidence,risk_flags,report_status,created_at,updated_at",
    order: "created_at.desc"
  });
  if (reportId) params.set("id", "eq." + reportId);
  params.set("limit", reportId ? "1" : "20");
  const reportRes = await fetch(url + "/rest/v1/diagnosis_reports?" + params, {
    headers: {apikey: service, Authorization: "Bearer " + service}
  });
  if (!reportRes.ok) throw new Error("REPORT_QUERY_FAILED");
  const reports = await reportRes.json();
  if (!reports.length) return [];

  const ids = reports.map(item => item.id);
  const reviewParams = new URLSearchParams({
    tenant_id: "eq." + tenantId,
    report_id: "in.(" + ids.join(",") + ")",
    decision: "eq.APPROVED",
    select: "id,report_id,decision,created_at",
    order: "created_at.desc"
  });
  const reviewRes = await fetch(url + "/rest/v1/diagnosis_reviews?" + reviewParams, {
    headers: {apikey: service, Authorization: "Bearer " + service}
  });
  if (!reviewRes.ok) throw new Error("REVIEW_QUERY_FAILED");
  const reviews = await reviewRes.json();
  const approvedByReport = new Map();
  for (const review of reviews) if (!approvedByReport.has(review.report_id)) approvedByReport.set(review.report_id, review);
  return reports.filter(report => approvedByReport.has(report.id)).map(report => ({
    ...report,
    review: approvedByReport.get(report.id)
  }));
}

export default async function handler(request) {
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
  if (process.env.DIAGNOSIS_PORTAL_ENABLED !== "true") return fail("PORTAL_DISABLED", 503);

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return fail("SUPABASE_SERVER_CONFIG_REQUIRED", 503);

  try {
    const auth = await getVerifiedUser(request, url, anon);
    if (auth.error) return auth.error;

    const requestedTenantId = new URL(request.url).searchParams.get("tenant_id");
    const reportId = new URL(request.url).searchParams.get("report_id");
    const membership = await getMembership(url, service, auth.user.id, requestedTenantId);
    const reports = await approvedReport(url, service, membership.tenant_id, reportId);

    return new Response(JSON.stringify({
      ok: true,
      tenant: {id: membership.tenant_id, role: membership.role},
      reports,
      count: reports.length
    }), {status:200, headers:HEADERS});
  } catch (error) {
    const code = error?.message || "PORTAL_UNAVAILABLE";
    const status = code === "TENANT_MEMBERSHIP_NOT_FOUND" ? 403 :
      code === "TENANT_SELECTION_REQUIRED" ? 409 :
      code.includes("QUERY_FAILED") ? 503 : 500;
    return fail(code, status);
  }
}
