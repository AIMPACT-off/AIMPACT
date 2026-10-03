#!/usr/bin/env node
/** Cross-tenant RLS verification using two ordinary authenticated tenant users.
 * Proves READ isolation and that Tenant A cannot UPDATE or DELETE Tenant B's fixture.
 * Never use service_role. Test URLs must target a specific Tenant-B-owned fixture.
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
function sameOrigin(url) {
  try { const u = new URL(url, root); return u.origin === root.origin && (u.protocol === "https:" || u.hostname === "localhost"); }
  catch { return false; }
}
function safeTarget(url) {
  try { const u = new URL(url, root); return sameOrigin(u) && u.searchParams.has("select"); }
  catch { return false; }
}
async function request(url, token, method = "GET", body) {
  const headers = { apikey: anon, Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: "return=representation" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  let parsed = null; try { parsed = await response.json(); } catch {}
  return { status: response.status, rows: Array.isArray(parsed) ? parsed.length : null, body: parsed };
}
function blocked(response) { return response.status === 401 || response.status === 403 || (response.status === 200 && response.rows === 0); }
function unchanged(body, expected) {
  if (!expected || typeof expected !== "object") return true;
  if (!Array.isArray(body)) return false;
  return body.some(row => Object.entries(expected).every(([key, value]) => row?.[key] === value));
}
let failed = false;
for (const item of cases) {
  if (!item || typeof item.name !== "string" || typeof item.url !== "string" || typeof item.updateUrl !== "string" || typeof item.deleteUrl !== "string") {
    console.error("Invalid test case: expected {name,url,updateUrl,deleteUrl}"); failed = true; continue;
  }
  if (!safeTarget(item.url) || !sameOrigin(item.updateUrl) || !sameOrigin(item.deleteUrl)) {
    console.error("Unsafe test URL rejected:", item.name); failed = true; continue;
  }
  const updateBody = item.updateBody === undefined ? {} : item.updateBody;
  try {
    const fixture = await request(item.url, tokenB);
    const visible = fixture.status === 200 && fixture.rows > 0;
    if (!visible) {
      console.log(JSON.stringify({ name: item.name, phase: "fixture", result: "FAIL", tenantBStatus: fixture.status, tenantBRows: fixture.rows }));
      failed = true; continue;
    }
    const readA = await request(item.url, tokenA);
    const readBlocked = blocked(readA);
    const updateA = await request(item.updateUrl, tokenA, "PATCH", updateBody);
    const updateBlocked = blocked(updateA);
    const afterUpdateB = await request(item.url, tokenB);
    const unchangedAfterUpdate = unchanged(afterUpdateB.body, item.assertUnchanged);
    const deleteA = await request(item.deleteUrl, tokenA, "DELETE");
    const deleteBlocked = blocked(deleteA);
    const afterDeleteB = await request(item.url, tokenB);
    const fixtureRemains = afterDeleteB.status === 200 && afterDeleteB.rows > 0 && unchanged(afterDeleteB.body, item.assertUnchanged);
    const pass = readBlocked && updateBlocked && unchangedAfterUpdate && deleteBlocked && fixtureRemains;
    console.log(JSON.stringify({ name: item.name, read: readBlocked ? "PASS" : "FAIL", update: updateBlocked ? "PASS" : "FAIL", delete: deleteBlocked ? "PASS" : "FAIL", tenantBFixtureUnchangedAfterUpdate: unchangedAfterUpdate, tenantBFixtureRemainsAfterDelete: fixtureRemains, result: pass ? "PASS" : "FAIL" }));
    if (!pass) failed = true;
  } catch (error) {
    console.error(JSON.stringify({ name: item.name, result: "ERROR", message: error?.name === "TimeoutError" ? "request timeout" : (error?.message || "request failed") }));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
