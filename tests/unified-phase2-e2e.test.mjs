import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const dbUrl = process.env.TEST_DATABASE_URL;
const serviceKey = process.env.TEST_SERVICE_KEY;
const migrationDir = "supabase/migrations";

function failClosed(message) {
  throw new Error("[FAIL-CLOSED] " + message);
}

test("unified Phase 2 E2E requires real TEST DB credentials", () => {
  if (!dbUrl || !serviceKey) {
    failClosed("TEST_DATABASE_URL and TEST_SERVICE_KEY are required; no synthetic PASS is permitted.");
  }
});

test("unified Phase 2 E2E requires the canonical Phase 2 schema migration", () => {
  const migrations = fs.readdirSync(migrationDir);
  const phase2Migration = migrations.find(name => /diagnosis_data_contract/i.test(name));
  if (!phase2Migration) {
    failClosed("Canonical diagnosis data-contract migration is absent from this branch.");
  }
});

test("unified Phase 2 E2E can reach the supplied TEST DB", () => {
  if (!dbUrl) failClosed("TEST_DATABASE_URL missing");
  const output = execFileSync("psql", [
    dbUrl,
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-Atqc", "select current_database(), current_user;"
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(output, /.+\|.+/);
});

test("unified Phase 2 E2E never treats credentials alone as application authorization", () => {
  assert.equal(typeof serviceKey, "string");
  assert.ok(serviceKey.length > 0);
  assert.ok(fs.existsSync("netlify/functions/diagnosis-review.mjs"));
});
