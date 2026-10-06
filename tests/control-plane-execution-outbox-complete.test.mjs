import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionOutboxAdapter } from "../phase2/control-plane/execution-outbox.mjs";

test("execution outbox complete adapter calls the dedicated complete RPC", async () => {
  const calls = [];
  const adapter = createExecutionOutboxAdapter({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ok: true, duplicate: false, status: "COMPLETED" }, error: null };
    }
  });

  const result = await adapter.complete("intent-1", "COMPLETED");
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(calls[0], {
    name: "complete_execution_intent_atomic",
    args: {
      p_intent_id: "intent-1",
      p_status: "COMPLETED",
      p_error_code: null,
      p_error_message: null
    }
  });
});

test("execution outbox complete adapter propagates RPC failures", async () => {
  const adapter = createExecutionOutboxAdapter({
    async rpc() {
      return { data: null, error: new Error("COMPLETE_RPC_FAILED") };
    }
  });

  await assert.rejects(
    () => adapter.complete("intent-1", "COMPLETED"),
    /COMPLETE_RPC_FAILED/
  );
});
