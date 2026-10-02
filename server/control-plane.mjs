import { EventEmitter } from "node:events";

import { randomUUID } from "node:crypto";

export class GlobalKillSwitch {
  constructor({ controlPlane, env = process.env, maxControlAgeMs = 1000, now = () => Date.now() } = {}) {
    this.controlPlane = controlPlane; this.env = env; this.maxControlAgeMs = maxControlAgeMs; this.now = now; this.activeTasks = new Map(); this.activated = false;
  }
  registerActiveTask(controller, metadata = {}) {
    if (this.activated || this.env.AIMPACT_GLOBAL_KILL_SWITCH === "true") { controller.abort(new Error("Global kill switch active")); return () => {}; }
    const id = randomUUID(); this.activeTasks.set(id, { controller, metadata });
    return () => this.activeTasks.delete(id);
  }
  async activate(reason = "operator") {
    this.activated = true;
    const started = Date.now();
    for (const { controller } of this.activeTasks.values()) controller.abort(new Error("Global kill switch activated: " + reason));
    return { abortedTasks: this.activeTasks.size, elapsedMs: Date.now() - started };
  }
  async assertAllowed(mode) {
    if (this.activated) { const error = new Error("Global execution kill switch is active"); error.status = 503; error.code = "GLOBAL_KILL_SWITCH_ACTIVE"; throw error; }
    if (this.env.AIMPACT_GLOBAL_KILL_SWITCH === "true") {
      const error = new Error("Global execution kill switch is active"); error.status = 503; error.code = "GLOBAL_KILL_SWITCH_ACTIVE"; throw error;
    }
    if (mode !== "LIVE") return;
    if (!this.controlPlane?.readExecutionControl) {
      const error = new Error("Live execution control plane is unavailable"); error.status = 503; error.code = "CONTROL_PLANE_UNAVAILABLE"; throw error;
    }
    let state;
    try { state = await this.controlPlane.readExecutionControl(); }
    catch { const error = new Error("Live execution control plane is unavailable"); error.status = 503; error.code = "CONTROL_PLANE_UNAVAILABLE"; throw error; }
    if (!state || this.now() - state.observedAt > this.maxControlAgeMs || state.killSwitch !== false || state.liveEnabled !== true) {
      const error = new Error("Live execution is disabled or control state is stale"); error.status = 503; error.code = "LIVE_EXECUTION_BLOCKED"; throw error;
    }
  }
}

export class ShadowExecutionEngine {
  constructor({ buildExternalPayload, record = async () => {} }) {
    if (typeof buildExternalPayload !== "function") throw new TypeError("buildExternalPayload required");
    this.buildExternalPayload = buildExternalPayload; this.record = record;
  }
  async execute(input, { signal } = {}) {
    signal?.throwIfAborted?.();
    const externalPayload = await this.buildExternalPayload(input, { signal });
    signal?.throwIfAborted?.();
    const result = { mode: "SHADOW", sent: false, externalPayload };
    await this.record({ type: "SHADOW_EXECUTION", sent: false, workflowId: input.workflowId });
    return result;
  }
}

export class DispatcherTelemetry extends EventEmitter {
  constructor({ sink = async () => {}, now = () => Date.now() } = {}) {
    super(); this.sink = sink; this.now = now; this.latencies = new Map();
    this.counters = { idempotencyHits: 0, fallbackTriggers: 0, validationFailures: 0, lockConflicts: 0, workerTimeouts: 0, circuitOpen: 0 };
  }
  async emitEvent(type, fields = {}) {
    const event = Object.freeze({ schema: "execution_telemetry_logs.v1", type, occurredAt: new Date(this.now()).toISOString(), ...fields });
    this.emit("execution", event);
    await this.sink(event);
    if (type === "IDEMPOTENCY_HIT") this.counters.idempotencyHits++;
    if (type === "FALLBACK_TRIGGERED") this.counters.fallbackTriggers++;
    if (type === "VALIDATION_FAILED") this.counters.validationFailures++;
    if (type === "LOCK_CONFLICT") this.counters.lockConflicts++;
    if (type === "WORKER_TIMEOUT") this.counters.workerTimeouts++;
    if (type === "CIRCUIT_OPEN") this.counters.circuitOpen++;
    if (Number.isFinite(fields.durationMs)) {
      const key = fields.workflowId ?? "all", list = this.latencies.get(key) ?? [];
      list.push(fields.durationMs); if (list.length > 5000) list.shift(); this.latencies.set(key, list);
    }
    return event;
  }
  metrics(workflowId = "all") {
    const values = workflowId === "all" ? [...this.latencies.values()].flat() : (this.latencies.get(workflowId) ?? []);
    const percentile = p => {
      if (!values.length) return null;
      const a = [...values].sort((x,y)=>x-y), i = Math.ceil(p * a.length) - 1;
      return a[Math.max(0, i)];
    };
    return { latencyP95Ms: percentile(.95), latencyP99Ms: percentile(.99), sampleCount: values.length, ...this.counters };
  }
}

export async function fetchWithExecutionSignal(fetchImpl, url, options = {}, signal) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation required");
  signal?.throwIfAborted?.();
  return fetchImpl(url, { ...options, signal: signal ?? options.signal });
}
