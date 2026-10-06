const QUICK_AUDIT_AMOUNT = 200000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "content-type": "application/json", ...cors } });

  const secret = process.env.TOSS_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceRole) return new Response(JSON.stringify({ ok: false, error: "PAYMENT_DATA_LAYER_NOT_CONFIGURED" }), { status: 503, headers: { "content-type": "application/json", ...cors } });

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "INVALID_JSON" }), { status: 400, headers: { "content-type": "application/json", ...cors } }); }

  const paymentKey = String(body?.paymentKey || "");
  const orderId = String(body?.orderId || "");
  const amount = Number(body?.amount || 0);
  if (!paymentKey || !orderId || amount !== QUICK_AUDIT_AMOUNT || !/^AIMPACT-QA-[A-Za-z0-9]{24}$/.test(orderId)) {
    return new Response(JSON.stringify({ ok: false, error: "INVALID_PAYMENT_REQUEST" }), { status: 400, headers: { "content-type": "application/json", ...cors } });
  }

  const auth = Buffer.from(secret + ":").toString("base64");
  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { "Authorization": "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  const data = await response.json();
  if (!response.ok) return new Response(JSON.stringify({ ok: false, error: data?.code || "PAYMENT_CONFIRM_FAILED", message: data?.message }), { status: response.status, headers: { "content-type": "application/json", ...cors } });

  const caseId = orderId.replace("AIMPACT-QA-", "");
  const sync = await fetch(`${supabaseUrl}/rest/v1/rpc/mark_quick_audit_paid`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: "Bearer " + serviceRole,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ caseId, paymentKey, orderId, amount, payment: data })
  });

  if (!sync.ok) return new Response(JSON.stringify({ ok: false, error: "PAYMENT_CONFIRMED_BUT_CASE_SYNC_FAILED", detail: await sync.text() }), { status: 502, headers: { "content-type": "application/json", ...cors } });
  return new Response(JSON.stringify({ ok: true, payment: data, caseId, state: "PAID" }), { status: 200, headers: { "content-type": "application/json", ...cors } });
};
