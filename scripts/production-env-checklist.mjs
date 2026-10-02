#!/usr/bin/env node
// Production preflight. Credentials are never printed. Remote RLS is never inferred.
import { readFile } from "node:fs/promises";
const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
const timeout = Number(process.env.PRODUCTION_PREFLIGHT_TIMEOUT_MS || 8000);
const https = value => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
async function get(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { headers, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!redisUrl || !redisToken) add("Upstash credentials", "BLOCKED", "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
else if (!https(redisUrl)) add("Upstash TLS", "FAIL", "Redis REST URL must use HTTPS");
else {
  try {
    const r = await get(redisUrl.replace(/\/$/, "") + "/ping", { Authorization: "Bearer " + redisToken });
    const body = await r.json();
    add("Upstash TLS + authenticated PING", r.ok && body?.result === "PONG" ? "PASS" : "FAIL", r.ok && body?.result === "PONG" ? "PONG" : "PING failed");
  } catch (e) { add("Upstash TLS + authenticated PING", "FAIL", e.message); }
}
const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) add("Supabase credentials", "BLOCKED", "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
else if (!https(sbUrl)) add("Supabase TLS", "FAIL", "Production Supabase URL must use HTTPS");
else {
  let role = false;
  try { role = JSON.parse(Buffer.from(sbKey.split(".")[1], "base64url").toString()).role === "service_role"; } catch {}
  if (!role && !sbKey.startsWith("sb_secret_")) add("Supabase key type", "FAIL", "Expected service_role JWT or sb_secret_ server key");
  else {
    try {
      const r = await get(sbUrl.replace(/\/$/, "") + "/rest/v1/", { apikey: sbKey, Authorization: "Bearer " + sbKey });
      add("Supabase REST authentication + reachability", r.ok ? "PASS" : "FAIL", "HTTP " + r.status);
    } catch (e) { add("Supabase REST authentication + reachability", "FAIL", e.message); }
  }
}
const files = [
  "supabase/migrations/202610020001_phase1_execution_outcomes_audit.sql",
  "supabase/migrations/202610020002_audit_hash_chain.sql",
  "supabase/migrations/202610020003_execution_store_adapters.sql"
];
let rls = true;
for (const file of files) {
  try { if (!/enable\s+row\s+level\s+security/i.test(await readFile(new URL("../" + file, import.meta.url), "utf8"))) rls = false; }
  catch { rls = false; }
}
add("Local migration RLS declarations", rls ? "PASS" : "FAIL", rls ? "RLS enablement statements found in expected migrations" : "Missing migration or RLS declaration");
add("Actual Production DB RLS state", "NOT_VERIFIED", "Requires read-only SQL inspection of pg_class.relrowsecurity and pg_policies on the target DB");
for (const c of checks) process.stdout.write(`[${c.status}] ${c.name}: ${c.detail}\n`);
process.exitCode = checks.some(c => ["BLOCKED", "FAIL", "NOT_VERIFIED"].includes(c.status)) ? 1 : 0;
