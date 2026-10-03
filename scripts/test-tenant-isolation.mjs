#!/usr/bin/env node
/** Read-only cross-tenant RLS verification using two pre-provisioned Auth users.
 * B must see its known fixture; A must see zero rows or receive 401/403.
 * Never use service_role. URLs must filter to a specific tenant-B-owned fixture.
 */
const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
const tokenA = process.env.TENANT_A_JWT, tokenB = process.env.TENANT_B_JWT, raw = process.env.RLS_TEST_CASES;
const fail = message => { console.error(message); process.exit(2); };
if (!base || !anon || !tokenA || !tokenB || !raw) fail("Missing SUPABASE_URL, SUPABASE_ANON_KEY, TENANT_A_JWT, TENANT_B_JWT or RLS_TEST_CASES");
if (tokenA === tokenB) fail("Tenant A and B JWTs must be distinct");
function role(token) { try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role; } catch { return null; } }
if (role(tokenA) === "service_role" || role(tokenB) === "service_role") fail("service_role JWTs are prohibited; use ordinary authenticated tenant users");
let cases; try { cases = JSON.parse(raw); } catch { fail("RLS_TEST_CASES must be valid JSON"); }
if (!Array.isArray(cases) || !cases.length) fail("At least one RLS test case is required");
const root = new URL(base);
if (root.protocol !== "https:" && root.hostname !== "localhost") fail("SUPABASE_URL must use HTTPS");
let failed = false;
async function request(url, token, method, body) {
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: "return=representation"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  let parsed = null; try { parsed = await response.json(); } catch {}
  return { status: response.status, rows: Array.isArray(parsed) ? parsed.length : null, body: parsed };
}
function blocked(response) {
  return response.status === 401 || response.status === 403 ||
    (response.status === 200 && response.rows === 0);
}
function expectedUnchanged(body, expected) {
  if (!expected || typeof expected !== "object") return true;
  if (!Array.isArray(body)) return false;
  return body.some(row => Object.entries(expected).every(([key, value]) => row?.[key] === value));
}
for (const item of cases) {
  if (!item || typeof item.name !== "string" || typeof item.url !== "string" || !item.updateUrl || !item.deleteUrl) {
    console.error("Invalid test case: expected {name,url,updateUrl,deleteUrl}");
    failed = true; continue;
  }
  let target; try { target = new URL(item.url, root); } catch { console.error("Invalid URL:", item.name); failed = true; continue; }
  if (target.origin !== root.origin || (target.protocol !== "https:" && target.hostname !== "localhost") || !target.searchParams.has("select")) { console.error("Unsafe test URL rejected:", item.name); failed = true; continue; }
  try {
    const [b, a] = await Promise.all([read(target, tokenB), read(target, tokenA)]);
    const bVisible = b.status === 200 && b.rows > 0;
    const aBlocked = a.status === 401 || a.status === 403 || (a.status === 200 && a.rows === 0);
    const pass = bVisible && aBlocked;
    console.log(JSON.stringify({ name: item.name, tenantBFixtureVisible: bVisible, tenantAAccessBlocked: aBlocked, tenantAStatus: a.status, tenantARows: a.rows, result: pass ? "PASS" : "FAIL" }));
    if (!pass) failed = true;
  } catch (error) { console.error(JSON.stringify({ name: item.name, result: "ERROR", message: error.name === "TimeoutError" ? "request timeout" : "request failed" })); failed = true; }
}
if (failed) process.exitCode = 1;
