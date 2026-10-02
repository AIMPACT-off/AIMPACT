import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

const script = new URL("../scripts/prod-smoke.mjs", import.meta.url);
const keys = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
function execute(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("missing production credentials safely SKIP with exit 0", async () => {
  const env = { ...process.env };
  for (const key of keys) delete env[key];
  const result = await execute(env);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /\[SKIPPED\]/);
});

test("only GET requests are sent and both read-only checks pass", async t => {
  const methods = [];
  const server = createServer((req, res) => {
    methods.push(req.method);
    if (req.url === "/ping") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: "PONG" }));
    } else if (req.url === "/rest/v1/") {
      res.writeHead(200, { "content-type": "application/openapi+json" });
      res.end("{}");
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const result = await execute({
    UPSTASH_REDIS_REST_URL: url,
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
    PROD_SMOKE_ALLOW_HTTP: "true"
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Upstash authenticated PING: PONG/);
  assert.match(result.stdout, /Supabase read-only REST endpoint/);
  assert.deepEqual(methods, ["GET", "GET"]);
});
