#!/usr/bin/env node
// Read-only production connectivity smoke test. Never prints credential values.
const required = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  process.stdout.write("[SKIPPED] Production smoke test: required credentials are not configured.\n");
  process.exit(0);
}

const timeoutMs = 3000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const base = value => value.replace(/\/$/, "");
async function run() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (![redisUrl, supabaseUrl].every(value => {
    try { return new URL(value).protocol === "https:" || process.env.PROD_SMOKE_ALLOW_HTTP === "true"; }
    catch { return false; }
  })) {
    throw new Error("Service URLs must be valid HTTPS URLs (HTTP is allowed only for isolated tests).");
  }

  const [redisResponse, supabaseResponse] = await Promise.all([
    fetch(base(redisUrl) + "/ping", {
      method: "GET",
      headers: { Authorization: "Bearer " + process.env.UPSTASH_REDIS_REST_TOKEN },
      signal: controller.signal
    }),
    fetch(base(supabaseUrl) + "/rest/v1/", {
      method: "GET",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      signal: controller.signal
    })
  ]);
  let redisBody;
  try { redisBody = await redisResponse.json(); } catch {}
  if (!redisResponse.ok || redisBody?.result !== "PONG") {
    throw new Error("Upstash authenticated PING did not return PONG.");
  }
  if (!supabaseResponse.ok) {
    throw new Error("Supabase read-only REST discovery failed (HTTP " + supabaseResponse.status + ").");
  }
  process.stdout.write("[PASS] Upstash authenticated PING: PONG\n");
  process.stdout.write("[PASS] Supabase read-only REST endpoint: HTTP " + supabaseResponse.status + "\n");
}
try {
  await run();
} catch (error) {
  process.stderr.write("[FAIL] Production smoke test: " + (error.name === "AbortError" ? "3-second timeout exceeded." : error.message) + "\n");
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
