import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DispatchRequestSchema } from "../server/dispatcher.mjs";
import { runAuditPipeline } from "../server/audit-pipeline.mjs";
import { verifyLiveHandshake } from "../lib/live-handshake.mjs";

test("Audit Bot dispatcher payload conforms to dispatcher and handshake contract without leaking secrets", async () => {
  const passphrase = "unit-test-only-handshake-secret-over-32-characters";
  const expectedSha256 = createHash("sha256").update(passphrase, "utf8").digest("hex");
  const handshakeInput = { passphrase, expectedSha256 };
  assert.deepEqual(verifyLiveHandshake(handshakeInput), { ok: true, code: "LIVE_HANDSHAKE_VERIFIED" });

  let received;
  const dispatcher = {
    async dispatch(payload) {
      received = DispatchRequestSchema.parse(payload);
      return { status: 200, requestId: received.requestId, mode: "MOCK", output: { status: "DRY_RUN_COMPLETED" } };
    }
  };
  const result = await runAuditPipeline({
    input: { company: "Contract Test Co", industry: "Retail", problem: "Manual stock reporting takes too much time.", currentTools: "Spreadsheets", email: "test@example.com" },
    dispatcher,
    roiOptions: { loadedHourlyCost: 30000, assumptions: { hoursSavedPerMonth: 8 } }
  });

  assert.equal(result.stage, "COMPLETED");
  assert.equal(received.workflowId, "mock-01");
  assert.equal(typeof received.requestId, "string");
  assert.match(received.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(typeof received.tenantId, "string");
  assert.equal(typeof received.payload.company, "string");
  assert.equal(typeof received.payload.industry, "string");
  assert.equal(typeof received.payload.problem, "string");
  assert.equal(typeof received.payload.currentTools, "string");
  assert.equal("passphrase" in received.payload, false);
  assert.equal("expectedSha256" in received.payload, false);
  assert.equal(result.execution.output.status, "DRY_RUN_COMPLETED");
});

test("dispatcher payload with malformed types is rejected by the shared contract", () => {
  assert.throws(() => DispatchRequestSchema.parse({ requestId: "not-a-uuid", tenantId: 42, workflowId: "mock-01", payload: [] }));
});
