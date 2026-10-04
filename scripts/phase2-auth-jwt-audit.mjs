#!/usr/bin/env node
/**
 * Real Supabase Auth JWT -> tenant-membership RLS audit.
 * Destructive only to uniquely named disposable fixtures; requires explicit opt-in.
 */
import crypto from "node:crypto";

const required = ["TEST_SUPABASE_URL","TEST_SUPABASE_ANON_KEY","TEST_SUPABASE_SERVICE_ROLE_KEY","TEST_DB_DISPOSABLE"];
for (const key of required) if (!process.env[key]) throw new Error(`FAIL-CLOSED: ${key} is required`);
if (process.env.TEST_DB_DISPOSABLE !== "YES") throw new Error("FAIL-CLOSED: TEST_DB_DISPOSABLE=YES is required");
const base = process.env.TEST_SUPABASE_URL.replace(/\/$/, "");
const host = new URL(base).hostname;
if (!/^https:\/\//.test(base) || /(prod|production|live)/i.test(host)) throw new Error("FAIL-CLOSED: refusing non-HTTPS or production-like Supabase host");
const anon = process.env.TEST_SUPABASE_ANON_KEY;
const service = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const run = crypto.randomUUID();
const password = crypto.randomBytes(32).toString("base64url") + "Aa1!";
const users = [
  { email: `jwt-a-${run}@example.invalid`, password },
  { email: `jwt-b-${run}@example.invalid`, password }
];
const tenants = [];
const createdUsers = [];
const evidence = { run_id: run, target_host: host, started_at: new Date().toISOString(), checks: {}, cleanup: "PENDING" };

async function request(path, { key=service, token=key, method="GET", body, headers={} }={}) {
  const response = await fetch(base + path, {
    method,
    headers: { apikey:key, Authorization:`Bearer ${token}`, "Content-Type":"application/json", ...headers },
    ...(body === undefined ? {} : { body:JSON.stringify(body) })
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { status:response.status, data };
}
function expect(ok, message) { if (!ok) throw new Error("ASSERTION FAILED: " + message); }
async function adminCreateUser(user) {
  const r = await request("/auth/v1/admin/users", { method:"POST", body:{ email:user.email, password:user.password, email_confirm:true } });
  expect(r.status === 200 || r.status === 201, "Admin API must create disposable test user");
  createdUsers.push(r.data.id);
  return r.data;
}
async function signIn(user) {
  const r = await request("/auth/v1/token?grant_type=password", { key:anon, token:anon, method:"POST", body:{ email:user.email, password:user.password } });
  expect(r.status === 200 && typeof r.data?.access_token === "string", "Supabase Auth must issue a real access JWT");
  return r.data.access_token;
}
async function insert(table, row) {
  const r = await request(`/rest/v1/${table}`, { method:"POST", body:row, headers:{ Prefer:"return=representation" } });
  expect(r.status === 201 && Array.isArray(r.data) && r.data.length === 1, `service-role fixture insert failed: ${table}`);
  return r.data[0];
}
async function select(table, query, jwt) {
  const qs = new URLSearchParams(query).toString();
  return request(`/rest/v1/${table}?${qs}`, { key:anon, token:jwt });
}
try {
  const userA = await adminCreateUser(users[0]);
  const userB = await adminCreateUser(users[1]);
  const jwtA = await signIn(users[0]);
  const jwtB = await signIn(users[1]);
  const tenantA = await insert("tenants", { name:"JWT Audit A", slug:`jwt-a-${run.slice(0,8)}`, created_by:userA.id });
  const tenantB = await insert("tenants", { name:"JWT Audit B", slug:`jwt-b-${run.slice(0,8)}`, created_by:userB.id });
  tenants.push(tenantA.id, tenantB.id);
  await insert("tenant_memberships", { tenant_id:tenantA.id, user_id:userA.id, role:"owner", status:"active" });
  await insert("tenant_memberships", { tenant_id:tenantB.id, user_id:userB.id, role:"owner", status:"active" });

  const subA = await insert("diagnosis_submissions", {
    tenant_id:tenantA.id, idempotency_key:`jwt-a-${run}`, schema_version:"1.0.0",
    raw_answers:{ fixture:true }, consent_notice_version:"jwt-audit", consented_at:new Date().toISOString(), submitted_by:userA.id
  });
  const jobA = await insert("diagnosis_jobs", { tenant_id:tenantA.id, submission_id:subA.id });
  const approved = await insert("diagnosis_reports", {
    tenant_id:tenantA.id, job_id:jobA.id, model_provider:"test", model_name:"fixture",
    prompt_version:"jwt-audit", output_schema_version:"1.0.0", problem_statement:"approved fixture",
    problem_category:"test", confidence:0.9, report_status:"PENDING_REVIEW"
  });
  const subPending = await insert("diagnosis_submissions", {
    tenant_id:tenantA.id, idempotency_key:`jwt-pending-${run}`, schema_version:"1.0.0",
    raw_answers:{ fixture:true, pending:true }, consent_notice_version:"jwt-audit", consented_at:new Date().toISOString(), submitted_by:userA.id
  });
  const jobPending = await insert("diagnosis_jobs", { tenant_id:tenantA.id, submission_id:subPending.id });
  const pending = await insert("diagnosis_reports", {
    tenant_id:tenantA.id, job_id:jobPending.id, model_provider:"test", model_name:"fixture",
    prompt_version:"jwt-audit-pending", output_schema_version:"1.0.0", problem_statement:"pending fixture",
    problem_category:"test", confidence:0.5, report_status:"PENDING_REVIEW"
  });
  const review = await request("/rest/v1/rpc/record_diagnosis_review", { method:"POST", body:{
    p_tenant_id:tenantA.id, p_report_id:approved.id, p_reviewer_id:userA.id, p_decision:"APPROVED", p_notes:"JWT RLS fixture"
  }});
  expect(review.status === 204 || review.status === 200, "trusted server must approve fixture report");

  const [aMembership,bMembership,aTenant,bTenant,aApproved,bApproved,aPending,bPending] = await Promise.all([
    select("tenant_memberships",{select:"tenant_id,user_id,role,status",user_id:`eq.${userA.id}`},jwtA),
    select("tenant_memberships",{select:"tenant_id,user_id,role,status",user_id:`eq.${userB.id}`},jwtB),
    select("tenants",{select:"id",id:`eq.${tenantA.id}`},jwtA),
    select("tenants",{select:"id",id:`eq.${tenantA.id}`},jwtB),
    select("diagnosis_reports",{select:"id",tenant_id:`eq.${tenantA.id}`,id:`eq.${approved.id}`},jwtA),
    select("diagnosis_reports",{select:"id",tenant_id:`eq.${tenantA.id}`,id:`eq.${approved.id}`},jwtB),
    select("diagnosis_reports",{select:"id",tenant_id:`eq.${tenantA.id}`,id:`eq.${pending.id}`},jwtA),
    select("diagnosis_reports",{select:"id",tenant_id:`eq.${tenantA.id}`,id:`eq.${pending.id}`},jwtB)
  ]);
  for (const [label,r] of [["A membership",aMembership],["B membership",bMembership],["A tenant own",aTenant],["B tenant cross",bTenant],["A approved own",aApproved],["B approved cross",bApproved],["A pending own",aPending],["B pending cross",bPending]]) {
    expect(r.status === 200 && Array.isArray(r.data), `${label} query must return HTTP 200 with rows`);
  }
  expect(aMembership.data.length === 1 && aMembership.data[0].tenant_id === tenantA.id, "Tenant A JWT sees only its own membership");
  expect(bMembership.data.length === 1 && bMembership.data[0].tenant_id === tenantB.id, "Tenant B JWT sees only its own membership");
  expect(aTenant.data.length === 1 && bTenant.data.length === 0, "Tenant B JWT cannot read Tenant A");
  expect(aApproved.data.length === 1 && bApproved.data.length === 0, "approved report is visible to active A member and invisible cross-tenant");
  expect(aPending.data.length === 0 && bPending.data.length === 0, "unapproved report is invisible to both ordinary members");
  const mutation = await request("/rest/v1/tenant_memberships", { key:anon, token:jwtA, method:"POST", body:{tenant_id:tenantB.id,user_id:userA.id,role:"admin",status:"active"}, headers:{Prefer:"return=representation"} });
  expect(mutation.status >= 400, "authenticated user must not self-assign or mutate membership");
  evidence.checks = {
    real_auth_jwt_issued: "PASS",
    tenant_membership_self_scope: "PASS",
    cross_tenant_tenant_read: "PASS",
    approved_report_member_read: "PASS",
    cross_tenant_report_read: "PASS",
    unapproved_report_hidden: "PASS",
    authenticated_membership_mutation_denied: "PASS",
    observed: {
      a_membership_rows:aMembership.data.length, b_membership_rows:bMembership.data.length,
      a_own_tenant_rows:aTenant.data.length, b_cross_tenant_rows:bTenant.data.length,
      a_approved_report_rows:aApproved.data.length, b_cross_report_rows:bApproved.data.length,
      a_unapproved_report_rows:aPending.data.length, b_unapproved_report_rows:bPending.data.length,
      mutation_http_status:mutation.status
    }
  };
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  if (tenants.length) {
    try { await request(`/rest/v1/diagnosis_submissions?tenant_id=in.(${tenants.join(",")})`,{method:"DELETE"}); } catch {}
  }
  for (const tenantId of tenants) {
    try { await request(`/rest/v1/tenants?id=eq.${tenantId}`,{method:"DELETE"}); } catch {}
  }
  for (const userId of createdUsers) {
    try { await request(`/auth/v1/admin/users/${userId}`,{method:"DELETE"}); } catch {}
  }
  evidence.cleanup = "ATTEMPTED — inspect TEST project for residual fixture rows if the run failed";
  evidence.finished_at = new Date().toISOString();
  const safe = JSON.stringify(evidence,null,2);
  process.stdout.write(safe+"\n");
}
