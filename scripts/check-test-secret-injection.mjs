#!/usr/bin/env node
const required = ["TEST_SUPABASE_URL","TEST_SUPABASE_ANON_KEY","TEST_SUPABASE_SERVICE_ROLE_KEY","TEST_DB_DISPOSABLE"];
const optional = ["TEST_DATABASE_URL"];
const result = { checks: {}, result: "PASS" };
for (const key of required) {
  const present = typeof process.env[key] === "string" && process.env[key].length > 0;
  result.checks[key] = present ? "PRESENT" : "MISSING";
  if (!present) result.result = "FAIL";
}
for (const key of optional) result.checks[key] = process.env[key] ? "PRESENT" : "MISSING";
if (process.env.TEST_DB_DISPOSABLE && process.env.TEST_DB_DISPOSABLE !== "YES") {
  result.checks.TEST_DB_DISPOSABLE = "PRESENT_BUT_INVALID_SENTINEL"; result.result = "FAIL";
}
if (process.env.TEST_SUPABASE_URL) {
  try {
    const u = new URL(process.env.TEST_SUPABASE_URL);
    result.checks.TEST_SUPABASE_URL_FORMAT = u.protocol === "https:" && !/(prod|production|live)/i.test(u.hostname) ? "SAFE_FORMAT" : "REJECTED_FORMAT";
    if (result.checks.TEST_SUPABASE_URL_FORMAT === "REJECTED_FORMAT") result.result = "FAIL";
  } catch { result.checks.TEST_SUPABASE_URL_FORMAT = "INVALID_URL"; result.result = "FAIL"; }
}
if (process.env.TEST_DATABASE_URL) {
  try {
    const u = new URL(process.env.TEST_DATABASE_URL);
    result.checks.TEST_DATABASE_URL_FORMAT = ["postgres:","postgresql:"].includes(u.protocol) && !/(prod|production|live)/i.test(u.hostname + u.pathname) ? "SAFE_FORMAT" : "REJECTED_FORMAT";
    if (result.checks.TEST_DATABASE_URL_FORMAT === "REJECTED_FORMAT") result.result = "FAIL";
  } catch { result.checks.TEST_DATABASE_URL_FORMAT = "INVALID_URL"; result.result = "FAIL"; }
}
console.log(JSON.stringify(result,null,2));
if (result.result !== "PASS") process.exitCode = 1;
