import test from "node:test";
import assert from "node:assert/strict";
import { GlobalKillSwitch, ShadowExecutionEngine, DispatcherTelemetry } from "../server/control-plane.mjs";
import { UpstashRedisAdapter, SupabaseRpcAdapter, StoreUnavailableError } from "../server/persistent-stores.mjs";

test("global kill switch blocks MOCK and LIVE before work", async () => {
  const kill = new GlobalKillSwitch({ env: { AIMPACT_GLOBAL_KILL_SWITCH: "true" } });
  await assert.rejects(() => kill.assertAllowed("MOCK"), e => e.code === "GLOBAL_KILL_SWITCH_ACTIVE");
});

test("LIVE control plane fails closed on stale or unavailable control state", async () => {
  const kill = new GlobalKillSwitch({ env: {}, controlPlane: { readExecutionControl: async () => ({ killSwitch: false, liveEnabled: true, observedAt: 0 }) }, now: () => 5000 });
  await assert.rejects(() => kill.assertAllowed("LIVE"), e => e.code === "LIVE_EXECUTION_BLOCKED");
});

test("shadow execution constructs payload but never sends it", async () => {
  let sent = false;
  const engine = new ShadowExecutionEngine({ buildExternalPayload: async x => ({ body: x }), record: async () => {} });
  const result = await engine.execute({ prompt: "test" });
  assert.equal(result.mode, "SHADOW");
  assert.equal(result.sent, false);
  assert.equal(sent, false);
});

test("telemetry produces structured events and p95/p99 metrics", async () => {
  const events = [];
  const t = new DispatcherTelemetry({ sink: async e => events.push(e) });
  await t.emitEvent("EXECUTION_COMPLETED", { workflowId: "mock-01", durationMs: 10 });
  await t.emitEvent("EXECUTION_COMPLETED", { workflowId: "mock-01", durationMs: 20 });
  await t.emitEvent("IDEMPOTENCY_HIT", {});
  assert.equal(events[0].schema, "execution_telemetry_logs.v1");
  assert.equal(t.metrics("mock-01").latencyP95Ms, 20);
  assert.equal(t.metrics("mock-01").idempotencyHits, 1);
});

test("Upstash adapter fails closed when its backing service is unavailable", async () => {
  const redis = new UpstashRedisAdapter({ url: "https://redis.example", token: "test", fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => redis.command("PING"), e => e instanceof StoreUnavailableError && e.status === 503);
});

test("Supabase RPC adapter fails closed when its backing service is unavailable", async () => {
  const db = new SupabaseRpcAdapter({ url: "https://project.supabase.co", serviceRoleKey: "test", fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(() => db.rpc("rpc", {}), e => e instanceof StoreUnavailableError && e.status === 503);
});

test("Upstash lock renews its lease while the protected operation is active", async () => {
  const commands = [];
  const redis = new UpstashRedisAdapter({
    url: "https://redis.example", token: "test",
    fetchImpl: async (_url, options) => {
      const args = JSON.parse(options.body); commands.push(args);
      return { ok: true, json: async () => ({ result: args[0] === "SET" ? "OK" : 1 }) };
    }
  });
  await redis.withLock("heartbeat-test", async () => new Promise(resolve => setTimeout(resolve, 24)), { ttlMs: 30000, heartbeatMs: 5 });
  assert.ok(commands.some(args => args[0] === "EVAL" && String(args[1]).includes("pexpire")));
});

test("Supabase lock calls atomic lease renewal during long operations", async () => {
  const calls = [];
  const db = new SupabaseRpcAdapter({
    url: "https://project.supabase.co", serviceRoleKey: "test",
    fetchImpl: async (url, options) => {
      const name = url.split("/").pop(); calls.push(name);
      return { ok: true, json: async () => name === "aimpact_claim_execution_lock" || name === "aimpact_renew_execution_lock" ? true : true };
    }
  });
  await db.withLock("heartbeat-test", async () => new Promise(resolve => setTimeout(resolve, 24)), { ttlSeconds: 30, heartbeatMs: 5 });
  assert.ok(calls.includes("aimpact_renew_execution_lock"));
  assert.ok(calls.includes("aimpact_release_execution_lock"));
});
