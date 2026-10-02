import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createDispatcher, DispatcherError, InMemoryAtomicLockStore,
  InMemoryOutcomeLogger, PostgresAdvisoryLockStore
} from "../server/dispatcher.mjs";

const request = (overrides = {}) => ({
  requestId: randomUUID(), tenantId: "tenant-test", workflowId: "mock-01", payload: { source: "test" },
  ...overrides
});

test("runs all eight synthetic workflows in isolated workers under the 3s deadline", async () => {
  const dispatcher = createDispatcher({ mode: "MOCK", timeoutMs: 3000 });
  for (let i = 1; i <= 8; i++) {
    const result = await dispatcher.dispatch(request({ workflowId: `mock-0${i}` }));
    assert.equal(result.status, 200);
    assert.equal(result.output.status, "DRY_RUN_COMPLETED");
    assert.equal(result.output.workflowId, `mock-0${i}`);
  }
});

test("rejects invalid Zod input as 422 before execution", async () => {
  const dispatcher = createDispatcher({ mode: "MOCK" });
  await assert.rejects(() => dispatcher.dispatch({ tenantId: "t", workflowId: "mock-01" }),
    e => e instanceof DispatcherError && e.status === 422 && e.code === "VALIDATION_FAILED");
});

test("blocks a concurrent second execution with 409 WORKFLOW_ALREADY_RUNNING", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const lockStore = {
    active: false,
    async withLock(_key, operation) {
      if (this.active) return { acquired: false };
      this.active = true;
      try { await gate; return { acquired: true, result: await operation() }; }
      finally { this.active = false; }
    }
  };
  const dispatcher = createDispatcher({ mode: "MOCK", lockStore });
  const first = dispatcher.dispatch(request());
  await new Promise(resolve => setTimeout(resolve, 15));
  await assert.rejects(() => dispatcher.dispatch(request()),
    e => e.status === 409 && e.code === "WORKFLOW_ALREADY_RUNNING");
  release();
  assert.equal((await first).status, 200);
});

test("deduplicates same requestId/context and rejects key reuse with changed context", async () => {
  const dispatcher = createDispatcher({ mode: "MOCK" });
  const req = request();
  const [a, b] = await Promise.all([dispatcher.dispatch(req), dispatcher.dispatch(req)]);
  assert.deepEqual(a, b);
  await assert.rejects(() => dispatcher.dispatch({ ...req, payload: { source: "changed" } }),
    e => e.status === 409 && e.code === "IDEMPOTENCY_KEY_REUSE");
});

test("records successful and failed outcomes; unknown workflows never run", async () => {
  const logger = new InMemoryOutcomeLogger();
  const dispatcher = createDispatcher({ mode: "MOCK", outcomeLogger: logger });
  await dispatcher.dispatch(request());
  await assert.rejects(() => dispatcher.dispatch(request({ workflowId: "real-workflow-1" })),
    e => e.status === 404);
  assert.equal(logger.events.length, 1);
  assert.equal(logger.events[0].status, "COMPLETED");
});

test("LIVE mode is fail-closed without production adapters", async () => {
  const dispatcher = createDispatcher({ mode: "LIVE" });
  await assert.rejects(() => dispatcher.dispatch(request()),
    e => e.status === 503 && e.code === "LIVE_EXECUTION_NOT_CONFIGURED");
});

test("in-memory lock is atomic within one Node process", async () => {
  const store = new InMemoryAtomicLockStore();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = store.withLock("same", async () => gate);
  await new Promise(resolve => setImmediate(resolve));
  const second = await store.withLock("same", async () => "should-not-run");
  assert.equal(second.acquired, false);
  release();
  assert.equal((await first).acquired, true);
});

test("Postgres advisory lock uses transaction-scoped try-lock and releases connection", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      return { rows: [] };
    },
    release() { calls.push("RELEASE"); }
  };
  const store = new PostgresAdvisoryLockStore({ connect: async () => client });
  const result = await store.withLock("tenant:workflow", async () => "ok");
  assert.equal(result.result, "ok");
  assert.ok(calls.some(x => x.includes("pg_try_advisory_xact_lock")));
  assert.ok(calls.includes("COMMIT"));
  assert.equal(calls.at(-1), "RELEASE");
});
