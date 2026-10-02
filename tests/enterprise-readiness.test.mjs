import test from 'node:test';
import assert from 'node:assert/strict';
import { DBCircuitBreaker } from '../scripts/db-circuit-breaker.mjs';
import { buildDLQRecord } from '../src/dispatcher/dlq-handler.mjs';

test('DB circuit breaker opens after threshold failures and fails closed', async () => {
  const breaker = new DBCircuitBreaker(3, 60_000);
  for (let i = 0; i < 3; i++) await assert.rejects(() => breaker.execute(async () => { throw new Error('db down'); }));
  assert.equal(breaker.state, 'OPEN');
  await assert.rejects(() => breaker.execute(async () => 'must not run'), /Circuit Breaker is OPEN/);
});

test('DB circuit breaker resets after a successful execution', async () => {
  const breaker = new DBCircuitBreaker(3, 0);
  await assert.rejects(() => breaker.execute(async () => { throw new Error('transient'); }));
  assert.equal(await breaker.execute(async () => 'ok'), 'ok');
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failureCount, 0);
});

test('DLQ record preserves payload and parks after max attempts', () => {
  const record = buildDLQRecord({ tenant_id: 't1', job_id: 'j1' }, new Error('boom'), 5);
  assert.deepEqual(record.payload, { tenant_id: 't1', job_id: 'j1' });
  assert.equal(record.status, 'PARKED');
  assert.equal(record.attempt, 5);
  assert.equal(record.error, 'boom');
});
