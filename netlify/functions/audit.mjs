import crypto from "node:crypto";
import { validateAuditInput } from "../../lib/audit-input-guard.mjs";

const MAX_BODY = 12000;
const MODEL = process.env.AIMPACT_AUDIT_MODEL;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function env(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error("Missing required environment variable: " + name);
  return String(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function extractJson(content) {
  const raw = String(content || "").trim().replace(/^\`\`\`json\s*/i, "").replace(/^\`\`\`\s*/i, "").replace(/\s*\`\`\`$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("MODEL_JSON_INVALID");
  return JSON.parse(raw.slice(start, end + 1));
}

function requireReportShape(report) {
  if (!report || typeof report !== "object") throw new Error("REPORT_INVALID");
  for (const key of ["summary", "category", "conclusion", "workflow", "confidence"]) {
    if (typeof report[key] !== "string" || !report[key].trim()) throw new Error("REPORT_FIELD_INVALID:" + key);
  }
  if (!Number.isFinite(Number(report.score))) throw new Error("REPORT_SCORE_INVALID");
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(report.score)))),
    category: report.category.trim().slice(0, 120),
    summary: report.summary.trim().slice(0, 1200),
    conclusion: report.conclusion.trim().slice(0, 1800),
    workflow: report.workflow.trim().slice(0, 1800),
    confidence: report.confidence.trim().slice(0, 120),
    risks: Array.isArray(report.risks) ? report.risks.map(String).slice(0, 8) : [],
    assumptions: Array.isArray(report.assumptions) ? report.assumptions.map(String).slice(0, 8) : [],
    nextStep: typeof report.nextStep === "string" ? report.nextStep.trim().slice(0, 1000) : ""
  };
}

async function insertSupabase(path, payload) {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(url + "/rest/v1/" + path, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("AUDIT_STORE_UNAVAILABLE");
}

async function hasPaidQuickAuditEntitlement({ supabaseUrl, serviceRoleKey, authUserId }) {
  const common = { select: "product_key,amount,currency,status", auth_user_id: "eq." + authUserId, limit: "1" };
  const queries = [
    ["store_entitlements", { select: "product_id,status", auth_user_id: "eq." + authUserId, product_id: "eq.ai.aimpact.quick_audit", status: "eq.active", limit: "1" }],
    ["toss_payment_orders", { ...common, product_key: "eq.AI_QUICK_AUDIT", amount: "eq.200000", currency: "eq.KRW", status: "eq.paid" }],
    ["payment_entitlements", { ...common, product_key: "eq.AI_QUICK_AUDIT", amount: "eq.200000", currency: "eq.KRW", status: "eq.paid" }]
  ];
  const results = await Promise.all(queries.map(async ([table, filters]) => {
    const query = new URLSearchParams(filters);
    const response = await fetch(supabaseUrl + "/rest/v1/" + table + "?" + query, {
      headers: { apikey: serviceRoleKey, Authorization: "Bearer " + serviceRoleKey }
    });
    if (!response.ok) throw new Error("ENTITLEMENT_LOOKUP_FAILED");
    return response.json();
  }));
  return results.some(rows => Array.isArray(rows) && rows.length > 0);
}
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  const rawBody = event.body || "";
  if (rawBody.length > MAX_BODY) return json(413, { error: "payload_too_large" });

  let body;
  try { body = JSON.parse(rawBody); } catch { return json(400, { error: "invalid_json" }); }

  let input;
  try {
    input = validateAuditInput(body);
  } catch (error) {
    return json(400, { error: "invalid_audit_input", detail: error.message });
  }

  // Authenticate and establish the tenant before any billable model call.
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!bearer) return json(401, { error: "AUTH_REQUIRED", generationStatus: "not_generated" });

  let supabaseUrl;
  let serviceRoleKey;
  try {
    supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
    serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    return json(503, { error: "AUTH_PROVIDER_NOT_CONFIGURED", generationStatus: "not_generated" });
  }

  let authResponse;
  try {
    authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: serviceRoleKey, Authorization: "Bearer " + bearer }
    });
  } catch {
    return json(503, { error: "AUTH_PROVIDER_UNAVAILABLE", generationStatus: "not_generated" });
  }
  if (!authResponse.ok) return json(401, { error: "AUTH_INVALID", generationStatus: "not_generated" });

  let authUser;
  try { authUser = await authResponse.json(); } catch {
    return json(503, { error: "AUTH_PROVIDER_INVALID_RESPONSE", generationStatus: "not_generated" });
  }
  const authUserId = String(authUser?.id || "").trim();
  const authEmail = String(authUser?.email || "").trim().toLowerCase();
  if (!authUserId || !authEmail) return json(401, { error: "AUTH_INVALID", generationStatus: "not_generated" });
  if (input.email.toLowerCase() !== authEmail) {
    return json(403, { error: "AUTH_EMAIL_MISMATCH", generationStatus: "not_generated" });
  }

  let entitled;
  try { entitled = await hasPaidQuickAuditEntitlement({ supabaseUrl, serviceRoleKey, authUserId }); }
  catch { return json(503, { error: "PAYMENT_VERIFICATION_UNAVAILABLE", generationStatus: "not_generated" }); }
  if (!entitled) return json(402, { error: "PAYMENT_REQUIRED", generationStatus: "not_generated" });
  let tenantId;
  try {
    const tenantResponse = await fetch(supabaseUrl + "/rest/v1/rpc/aimpact_get_or_create_tenant", {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_auth_user_id: authUserId,
        p_company_name: input.company,
        p_email: authEmail
      })
    });
    if (!tenantResponse.ok) return json(503, { error: "TENANT_STORE_UNAVAILABLE", generationStatus: "not_generated" });
    tenantId = await tenantResponse.json();
  } catch {
    return json(503, { error: "TENANT_STORE_UNAVAILABLE", generationStatus: "not_generated" });
  }
  if (typeof tenantId !== "string" || !tenantId) {
    return json(503, { error: "TENANT_BINDING_UNAVAILABLE", generationStatus: "not_generated" });
  }

  if (!MODEL) return json(503, { error: "AI_PROVIDER_NOT_CONFIGURED", generationStatus: "not_generated" });
  let apiKey;
  try { apiKey = env("OPENAI_API_KEY"); } catch {
    return json(503, { error: "AI_PROVIDER_NOT_CONFIGURED", generationStatus: "not_generated" });
  }

  const system = [
    "You are AIMPACT Audit Engine.",
    "Analyze business operations, not people.",
    "Return JSON only.",
    "Never invent measured ROI. Unknown values must be marked as assumptions or not measured.",
    "Recommend workflows using only generally established AI capabilities; do not claim a vendor capability is verified unless evidence is supplied.",
    "Do not execute external actions."
  ].join(" ");

  const user = JSON.stringify({
    company: input.company,
    industry: input.industry,
    problem: input.problem,
    currentTools: input.currentTools
  });

  let modelResponse;
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    if (!response.ok) return json(503, { error: "AI_PROVIDER_UNAVAILABLE", generationStatus: "not_generated" });
    modelResponse = await response.json();
  } catch {
    return json(503, { error: "AI_PROVIDER_UNAVAILABLE", generationStatus: "not_generated" });
  }

  let report;
  try {
    report = requireReportShape(extractJson(modelResponse?.choices?.[0]?.message?.content));
  } catch (error) {
    return json(502, { error: "AI_REPORT_INVALID", detail: error.message, generationStatus: "not_generated" });
  }

  const executionId = crypto.randomUUID();
  const inputHash = sha256(JSON.stringify(input));
  const outputHash = sha256(JSON.stringify(report));
  const eventType = "AI_AUDIT_DRAFT_GENERATED";
  const eventHash = sha256(JSON.stringify({
    eventType,
    executionId,
    inputHash,
    outputHash
  }));

  try {
    await insertSupabase("execution_logs", {
      tenant_id: tenantId,
      workflow_id: "ai-audit-draft",
      execution_id: executionId,
      status: "succeeded",
      mode: "dry_run",
      input_hash: inputHash,
      output_hash: outputHash,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      metadata: { model: MODEL, source: "mobile" }
    });
    await insertSupabase("audit_logs", {
      tenant_id: tenantId,
      event_type: eventType,
      actor_id: authUserId,
      execution_id: executionId,
      input_hash: inputHash,
      output_hash: outputHash,
      previous_hash: null,
      event_hash: eventHash,
      metadata: { model: MODEL, confidence: report.confidence }
    });
  } catch {
    return json(503, { error: "AUDIT_STORE_UNAVAILABLE", generationStatus: "generated_but_not_recorded" });
  }

  return json(200, {
    generationStatus: "generated",
    qualityStatus: "not_reviewed",
    humanReviewRequired: true,
    paymentStatus: "verified",
    auditId: executionId,
    tenantId,
    report,
    evidence: {
      inputHash,
      outputHash,
      eventHash,
      model: MODEL,
      integrityStatus: "recorded_not_truth_verified",
      measurementStatus: "not_measured"
    }
  });
}
