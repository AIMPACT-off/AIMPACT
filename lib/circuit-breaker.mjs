/**
 * In-memory circuit breaker primitive. Persist health/incident state in the
 * Control Plane before using across multiple workers. Never silently retries
 * non-idempotent side effects.
 */
export class CircuitBreaker {
  constructor({ failureRate = 0.05, latencyMs = 5000, minSamples = 20, windowSize = 100, cooldownMs = 30000, now = () => Date.now() } = {}) {
    this.failureRate = failureRate;
    this.latencyMs = latencyMs;
    this.minSamples = minSamples;
    this.windowSize = windowSize;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.samples = [];
    this.state = "CLOSED";
    this.openedAt = 0;
    this.probeInFlight = false;
  }
  record({ ok, durationMs }) {
    // A half-open probe is evaluated in isolation. Do not let stale samples
    // reopen the circuit before a successful recovery probe can close it.
    if (this.state === "HALF_OPEN") {
      if (ok && durationMs <= this.latencyMs) this.close();
      else this.open();
      return;
    }
    this.samples.push({ ok: Boolean(ok), slow: Number(durationMs) > this.latencyMs, at: this.now() });
    if (this.samples.length > this.windowSize) this.samples.shift();
    const recent = this.samples.slice(-this.windowSize);
    if (recent.length >= this.minSamples) {
      const badRate = recent.filter(x => !x.ok || x.slow).length / recent.length;
      if (badRate > this.failureRate) this.open();
    }
  }
  open() { this.state = "OPEN"; this.openedAt = this.now(); this.probeInFlight = false; }
  close() { this.state = "CLOSED"; this.probeInFlight = false; this.samples = []; }
  canRequest() {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN" && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = "HALF_OPEN";
    }
    if (this.state === "HALF_OPEN" && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }
    return false;
  }
  async execute(primary, secondary, { isIdempotent = false, validate = value => value } = {}) {
    if (!this.canRequest()) {
      if (typeof secondary !== "function") throw new Error("CIRCUIT_OPEN_NO_COMPATIBLE_FALLBACK");
      return validate(await secondary());
    }
    const start = this.now();
    try {
      const result = validate(await primary());
      this.record({ ok: true, durationMs: this.now() - start });
      return result;
    } catch (error) {
      this.record({ ok: false, durationMs: this.now() - start });
      if (!isIdempotent) throw error;
      if (typeof secondary !== "function") throw error;
      return validate(await secondary());
    }
  }
}
