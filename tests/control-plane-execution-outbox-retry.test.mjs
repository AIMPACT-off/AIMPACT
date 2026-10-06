import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionOutboxAdapter } from "../phase2/control-plane/execution-outbox.mjs";

test("execution outbox retry adapter calls bounded retry RPC", async () => {
  const calls = [];
  const adapter = createExecutionOutboxAdapter({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ok: true, status: "PENDING", attempt: 1, backoff_seconds: 30 }, error: null };
    }
  });
  const result = await adapter.retry("intent-1", 3, 30);
  assert.equal(result.status, "PENDING");
  assert.deepEqual(calls[0], {
    name: "retry_execution_intent_atomic",
    args: {
      p_intent_id: "intent-1",
      p_max_attempts: 3,
      p_backoff_seconds: 30
    }
  });
});

test("execution outbox retry adapter propagates RPC failures", async () => {
  const adapter = createExecutionOutboxAdapter({
    async rpc() {
      return { data: null, error: new Error("RETRY_RPC_FAILED") };
    }
  });
  await assert.rejects(() => adapter.retry("intent-1", 3, 30), /RETRY_RPC_FAILED/);
});
