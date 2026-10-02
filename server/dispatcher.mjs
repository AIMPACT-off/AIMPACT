import { Worker } from "node:worker_threads";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CircuitBreaker } from "../lib/circuit-breaker.mjs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DispatchRequestSchema = z.object({
  requestId: z.string().regex(UUID_V4, "requestId must be UUIDv4"),
  tenantId: z.string().min(1).max(128),
  workflowId: z.string().min(1).max(128),
  payload: z.record(z.unknown()).default({})
}).strict();

export class DispatcherError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DispatcherError";
    this.status = status;
    this.code = code;
  }
}

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function contextDigest(input) {
  return createHash("sha256").update(stable({
    tenantId: input.tenantId, workflowId: input.workflowId, payload: input.payload
  })).digest("hex");
}

export class InMemoryAtomicLockStore {
  constructor() { this.held = new Set(); }
  async withLock(key, operation) {
    if (this.held.has(key)) return { acquired: false };
    this.held.add(key);
    try { return { acquired: true, result: await operation() }; }
    finally { this.held.delete(key); }
  }
}

// PostgreSQL transaction-scoped advisory lock. Supply a pg Pool-compatible object.
// The callback and lock share one transaction/connection; no session lock can leak.
export class PostgresAdvisoryLockStore {
  constructor(pool) {
    if (!pool?.connect) throw new TypeError("A PostgreSQL Pool with connect() is required");
    this.pool = pool;
  }
  async withLock(key, operation) {
    const client = await this.pool.connect();
    let began = false;
    try {
      await client.query("BEGIN");
      began = true;
      const lock = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired", [key]
      );
      if (!lock.rows?.[0]?.acquired) {
        await client.query("ROLLBACK");
        began = false;
        return { acquired: false };
      }
      const result = await operation();
      await client.query("COMMIT");
      began = false;
      return { acquired: true, result };
    } catch (error) {
      if (began) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

export class InMemoryOutcomeLogger {
  constructor() { this.events = []; }
  async record(event) { this.events.push(Object.freeze({ ...event })); }
}

function runWorker(input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(new URL("./mock-worker.mjs", import.meta.url)), {
      workerData: input
    });
    let settled = false;
    const finish = async (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await worker.terminate().catch(() => {});
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      const error = new DispatcherError(504, "WORKER_TIMEOUT", "Mock worker exceeded its execution deadline");
      void finish(error);
    }, timeoutMs);
    worker.once("message", value => void finish(null, value));
    worker.once("error", error => void finish(new DispatcherError(500, "WORKER_FAILED", error.message)));
    worker.once("exit", code => {
      if (code !== 0 && !settled) void finish(new DispatcherError(500, "WORKER_EXITED", "Worker exited with code " + code));
    });
  });
}

export class ServerDispatcher {
  constructor({
    mode = process.env.EXECUTION_MODE ?? "MOCK",
    lockStore = new InMemoryAtomicLockStore(),
    outcomeLogger = new InMemoryOutcomeLogger(),
    circuitBreaker = new CircuitBreaker({ minSamples: 3, failureRate: 0.66 }),
    timeoutMs = 3000
  } = {}) {
    if (!["MOCK", "LIVE"].includes(mode)) throw new TypeError("EXECUTION_MODE must be MOCK or LIVE");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3000) throw new TypeError("timeoutMs must be 1..3000");
    this.mode = mode;
    this.lockStore = lockStore;
    this.outcomeLogger = outcomeLogger;
    this.circuitBreaker = circuitBreaker;
    this.timeoutMs = timeoutMs;
    this.idempotency = new Map();
  }

  async dispatch(raw) {
    let input;
    try { input = DispatchRequestSchema.parse(raw); }
    catch (error) {
      throw new DispatcherError(422, "VALIDATION_FAILED", error.issues?.map(x => x.message).join("; ") || "Invalid request");
    }
    if (this.mode !== "MOCK") {
      throw new DispatcherError(503, "LIVE_EXECUTION_NOT_CONFIGURED", "LIVE execution is disabled until production adapters and policy gates are verified");
    }
    if (!/^mock-0[1-8]$/.test(input.workflowId)) {
      throw new DispatcherError(404, "WORKFLOW_NOT_REGISTERED", "Only the eight explicitly synthetic MOCK workflows are available");
    }

    const digest = contextDigest(input);
    const idemKey = input.requestId + "." + digest;
    const prior = this.idempotency.get(input.requestId);
    if (prior) {
      if (prior.digest !== digest) throw new DispatcherError(409, "IDEMPOTENCY_KEY_REUSE", "requestId was already used with a different context");
      return prior.promise;
    }

    const lockKey = input.tenantId + ":" + input.workflowId;
    const promise = this.lockStore.withLock(lockKey, async () => {
      const startedAt = Date.now();
      try {
        const output = await this.circuitBreaker.execute(
          () => runWorker(input, this.timeoutMs),
          undefined,
          { isIdempotent: false, validate: value => value }
        );
        await this.outcomeLogger.record({
          requestId: input.requestId, tenantId: input.tenantId,
          workflowId: input.workflowId, status: "COMPLETED",
          durationMs: Date.now() - startedAt, mode: "MOCK"
        });
        return { status: 200, requestId: input.requestId, idempotencyKey: idemKey, mode: "MOCK", output };
      } catch (error) {
        await this.outcomeLogger.record({
          requestId: input.requestId, tenantId: input.tenantId,
          workflowId: input.workflowId, status: "FAILED",
          durationMs: Date.now() - startedAt, mode: "MOCK", errorCode: error.code ?? "EXECUTION_FAILED"
        });
        throw error;
      }
    }).then(result => {
      if (!result.acquired) throw new DispatcherError(409, "WORKFLOW_ALREADY_RUNNING", "An execution for this tenant/workflow is already running");
      return result.result;
    });

    this.idempotency.set(input.requestId, { digest, promise });
    try { return await promise; }
    catch (error) {
      this.idempotency.delete(input.requestId);
      throw error;
    }
  }
}

export function createDispatcher(options) { return new ServerDispatcher(options); }
