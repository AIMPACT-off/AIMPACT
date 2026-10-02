import test from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker } from "../lib/circuit-breaker.mjs";

test("opens only after minimum sample count and threshold breach", () => {
  let t = 0;
  const b = new CircuitBreaker({ minSamples: 4, failureRate: 0.25, now: () => t++ });
  b.record({ ok: false, durationMs: 10 });
  b.record({ ok: true, durationMs: 10 });
  b.record({ ok: true, durationMs: 10 });
  assert.equal(b.state, "CLOSED");
  b.record({ ok: false, durationMs: 10 });
  assert.equal(b.state, "OPEN");
});

test("does not retry non-idempotent operation; idempotent call can fallback", async () => {
  const b = new CircuitBreaker({ minSamples: 1, failureRate: 0, now: (() => { let n=0; return () => n++; })() });
  await assert.rejects(() => b.execute(async () => { throw Error("primary"); }, async () => "secondary"));
  const b2 = new CircuitBreaker({ minSamples: 1, failureRate: 0 });
  assert.equal(await b2.execute(async () => { throw Error("primary"); }, async () => "secondary", { isIdempotent: true }), "secondary");
});

test("open circuit routes to fallback; half-open permits a single probe", async () => {
  let t = 0;
  const b = new CircuitBreaker({ minSamples: 1, failureRate: 0, cooldownMs: 10, now: () => t });
  b.open();
  assert.equal(await b.execute(async () => "primary", async () => "fallback"), "fallback");
  t = 11;
  assert.equal(b.canRequest(), true);
  assert.equal(b.canRequest(), false);
});

test("successful half-open probe closes despite stale failed samples", () => {
  let t = 0;
  const b = new CircuitBreaker({ minSamples: 1, failureRate: 0, cooldownMs: 10, now: () => t });
  b.record({ ok: false, durationMs: 1 });
  assert.equal(b.state, "OPEN");
  t = 11;
  assert.equal(b.canRequest(), true);
  b.record({ ok: true, durationMs: 1 });
  assert.equal(b.state, "CLOSED");
});
