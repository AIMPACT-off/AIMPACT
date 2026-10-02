import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("production preflight dry-run skips network and reports unverified live RLS", () => {
  const result = spawnSync(process.execPath, ["scripts/production-env-checklist.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRODUCTION_PREFLIGHT_DRY_RUN: "true",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: ""
    }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[SKIPPED\] Production credentials/);
  assert.match(result.stdout, /\[NOT_VERIFIED\] Actual Production DB RLS state/);
  assert.doesNotMatch(result.stdout, /Upstash TLS \+ authenticated PING/);
});

test("production preflight without credentials fails closed outside dry-run", () => {
  const result = spawnSync(process.execPath, ["scripts/production-env-checklist.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRODUCTION_PREFLIGHT_DRY_RUN: "false",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: ""
    }
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[BLOCKED\] Upstash credentials/);
  assert.match(result.stdout, /\[BLOCKED\] Supabase credentials/);
});
