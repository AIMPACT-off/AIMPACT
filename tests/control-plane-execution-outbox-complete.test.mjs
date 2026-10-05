import test from "node:test";
import assert from "node:assert/strict";

test("execution outbox complete contract is scoped to successful completion", async () => {
  const source = await import("../phase2/control-plane/execution-outbox.mjs");
  assert.equal(typeof source.createExecutionOutboxAdapter, "function");

  const calls = [];
  const adapter = source.createExecutionOutboxAdapter({
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
  const adapter = sourceAdapter({
    async rpc() {
      return { data: null, error: new Error("COMPLETE_RPC_FAILED") };
    }
  });

  await assert.rejects(
    () => adapter.complete("intent-1", "COMPLETED"),
    /COMPLETE_RPC_FAILED/
  );
});

function sourceAdapter(supabase) {
  return {
    complete: async (intentId, status, errorCode = null, errorMessage = null) => {
      const { data, error } = await supabase.rpc("complete_execution_intent_atomic", {
        p_intent_id: intentId,
        p_status: status,
        p_error_code: errorCode,
        p_error_message: errorMessage
      });
      if (error) throw error;
      return data;
    }
  };
}
