#!/usr/bin/env node
/**
 * Negative RLS test. Configure RLS_TEST_CASES as JSON:
 * [{"name":"customer_outcomes","url":"https://PROJECT.supabase.co/rest/v1/customer_outcomes?select=*&limit=1","tenantBTokenEnv":"TENANT_B_JWT"}]
 * TENANT_A_JWT must be a real authenticated JWT for tenant A.
 * A pass requires 401/403 or HTTP 200 with an empty array. Never use service role.
 */
const base = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const token = process.env.TENANT_A_JWT;
const raw = process.env.RLS_TEST_CASES;
if (!base || !anon || !token || !raw) {
  console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, TENANT_A_JWT or RLS_TEST_CASES");
  process.exit(2);
}
let cases;
try { cases = JSON.parse(raw); } catch { console.error("RLS_TEST_CASES must be valid JSON"); process.exit(2); }
if (!Array.isArray(cases) || cases.length === 0) { console.error("At least one RLS test case is required"); process.exit(2); }
let failed = false;
for (const item of cases) {
  const target = new URL(item.url, base);
  if (target.origin !== new URL(base).origin) { console.error("Cross-origin test URL rejected:", item.name); failed = true; continue; }
  const res = await fetch(target, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  let body = null;
  try { body = await res.json(); } catch {}
  const denied = res.status === 401 || res.status === 403;
  const empty = res.status === 200 && Array.isArray(body) && body.length === 0;
  const pass = denied || empty;
  console.log(JSON.stringify({ name: item.name, status: res.status, result: pass ? "PASS" : "FAIL" }));
  if (!pass) failed = true;
}
if (failed) process.exitCode = 1;
