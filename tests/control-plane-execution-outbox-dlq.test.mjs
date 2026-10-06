import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionOutboxAdapter } from "../phase2/control-plane/execution-outbox.mjs";

test("execution outbox DLQ adapter quarantines only through the dedicated RPC", async () => {
  const calls = [];
  const adapter = createExecutionOutboxAdapter({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ok: true, status: "DLQ", duplicate: false, intent_id: "intent-1" }, error: null };
    }
  });
  const result = await adapter.quarantineDlq("intent-1", "RETRY_EXHAUSTED", "max attempts reached");
  assert.equal(result.status, "DLQ");
  assert.deepEqual(calls[0], {
    name: "quarantine_execution_intent_dlq_atomic",
    args: {
      p_intent_id: "intent-1",
      p_reason_code: "RETRY_EXHAUSTED",
      p_reason_message: "max attempts reached"
    }
  });
});

test("execution outbox DLQ adapter propagates quarantine RPC failures", async () => {
  const adapter = createExecutionOutboxAdapter({
    async rpc() {
      return { data: null, error: new Error("DLQ_RPC_FAILED") };
    }
  });
  await assert.rejects(
    () => adapter.quarantineDlq("intent-1"),
    /DLQ_RPC_FAILED/
  );
});
