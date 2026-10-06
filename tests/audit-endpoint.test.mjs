import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../netlify/functions/audit.mjs";

test("audit endpoint returns structured diagnosis", async () => {
  const response = await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      company: "AIMPACT Test",
      email: "test@example.com",
      industry: "Retail",
      problem: "재고와 반복 보고 업무가 너무 많습니다.",
      monthlyManualHours: "100",
      monthlyProcessCost: "3000000"
    })
  });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.stage, "DIAGNOSIS_COMPLETE");
  assert.equal(body.diagnosis.category, "OPERATIONS");
  assert.equal(body.verification, "UNVERIFIED");
});

test("audit endpoint rejects missing business problem", async () => {
  const response = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ company: "AIMPACT Test", email: "test@example.com", industry: "Retail" })
  });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "audit_request_rejected");
});
