import crypto from "node:crypto";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function deliveryUuid(delivery) { const h=crypto.createHash("sha256").update(delivery).digest(); h[6]=(h[6]&0x0f)|0x40; h[8]=(h[8]&0x3f)|0x80; const hex=h.toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`; }\n\nfunction verify(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const secret = process.env.AIMPACT_GITHUB_WEBHOOK_SECRET;
  if (!secret) return json(503, { error: "WEBHOOK_SECRET_NOT_CONFIGURED" });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  if (!verify(rawBody, event.headers?.["x-hub-signature-256"] || event.headers?.["X-Hub-Signature-256"], secret)) {
    return json(401, { error: "INVALID_WEBHOOK_SIGNATURE" });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const eventId = event.headers?.["x-github-delivery"] || event.headers?.["X-GitHub-Delivery"];
  const eventType = event.headers?.["x-github-event"] || event.headers?.["X-GitHub-Event"];
  if (!eventId || !eventType) return json(400, { error: "MISSING_GITHUB_EVENT_HEADERS" });

  const eventUuid = deliveryUuid(eventId);\n  const normalizedType = eventType === "workflow_run"\n    ? (payload.action === "completed" && payload.workflow_run?.conclusion === "success" ? "CI_RUN_COMPLETED" : payload.action === "completed" ? "CI_RUN_FAILED" : "GITHUB_WORKFLOW_EVENT")\n    : "GITHUB_EVENT";\n  const systemEvent = {
    event_id: eventUuid,
    event_type: normalizedType,
    source: "github",
    repository: payload.repository?.full_name ?? null,
    ref: payload.ref ?? payload.workflow_run?.head_branch ?? null,
    commit_sha: payload.after ?? payload.workflow_run?.head_sha ?? null,
    payload: { action: payload.action ?? null, workflow_run_id: payload.workflow_run?.id ?? null }
  };

  // Ingestion boundary is deliberately fail-closed until the server-side Supabase adapter is wired.
  return json(202, { ok: true, accepted: true, event: systemEvent });
}
