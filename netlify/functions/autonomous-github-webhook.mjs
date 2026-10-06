import crypto from "node:crypto";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function deliveryUuid(delivery) {
  const h = crypto.createHash("sha256").update(delivery).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function verify(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function persistSystemEvent(eventRecord) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, code: "SUPABASE_SERVER_CONFIG_MISSING" };
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/record_autonomous_system_event_atomic`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        p_event_id: eventRecord.event_id,
        p_event_type: eventRecord.event_type,
        p_source: eventRecord.source,
        p_repository: eventRecord.repository,
        p_ref: eventRecord.ref,
        p_commit_sha: eventRecord.commit_sha,
        p_correlation_id: eventRecord.correlation_id,
        p_causation_id: eventRecord.causation_id,
        p_schema_version: eventRecord.schema_version,
        p_payload: eventRecord.payload,
        p_occurred_at: eventRecord.occurred_at
      })
    }
  );

  if (!response.ok) {
    return { ok: false, code: "SYSTEM_EVENT_PERSISTENCE_FAILED", status: response.status };
  }

  const data = await response.json();
  return { ok: true, data };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const secret = process.env.AIMPACT_GITHUB_WEBHOOK_SECRET;
  if (!secret) return json(503, { error: "WEBHOOK_SECRET_NOT_CONFIGURED" });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  const signature = event.headers?.["x-hub-signature-256"] || event.headers?.["X-Hub-Signature-256"];
  if (!verify(rawBody, signature, secret)) {
    return json(401, { error: "INVALID_WEBHOOK_SIGNATURE" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }

  const eventId = event.headers?.["x-github-delivery"] || event.headers?.["X-GitHub-Delivery"];
  const eventType = event.headers?.["x-github-event"] || event.headers?.["X-GitHub-Event"];
  if (!eventId || !eventType) return json(400, { error: "MISSING_GITHUB_EVENT_HEADERS" });

  const eventUuid = deliveryUuid(eventId);
  const normalizedType =
    eventType === "workflow_run"
      ? payload.action === "completed" && payload.workflow_run?.conclusion === "success"
        ? "CI_RUN_COMPLETED"
        : payload.action === "completed"
          ? "CI_RUN_FAILED"
          : "GITHUB_WORKFLOW_EVENT"
      : "GITHUB_EVENT";

  const systemEvent = {
    event_id: eventUuid,
    event_type: normalizedType,
    source: "github",
    repository: payload.repository?.full_name ?? null,
    ref: payload.ref ?? payload.workflow_run?.head_branch ?? null,
    commit_sha: payload.after ?? payload.workflow_run?.head_sha ?? null,
    correlation_id: eventUuid,
    causation_id: null,
    schema_version: "1",
    payload: {
      action: payload.action ?? null,
      workflow_run_id: payload.workflow_run?.id ?? null
    },
    occurred_at: new Date().toISOString()
  };

  const persisted = await persistSystemEvent(systemEvent);
  if (!persisted.ok) {
    return json(503, { error: persisted.code });
  }

  return json(202, {
    ok: true,
    accepted: true,
    duplicate: Boolean(persisted.data?.duplicate),
    event: systemEvent
  });
}
