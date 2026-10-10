import assert from "node:assert/strict";

const required = [
  "AIMPACT_E2E_BASE_URL",
  "TOSS_SECRET_KEY",
  "TOSS_E2E_ORDER_ID",
  "TOSS_E2E_PAYMENT_KEY",
  "TOSS_E2E_USER_ACCESS_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];
for (const name of required) {
  if (!String(process.env[name] || "").trim()) {
    console.error("PAYMENT_E2E=NOT_VERIFIED");
    console.error("PAYMENT_E2E_MISSING_REQUIRED_CONFIGURATION=" + name);
    process.exit(2);
  }
}

const baseUrl = process.env.AIMPACT_E2E_BASE_URL.replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orderId = process.env.TOSS_E2E_ORDER_ID.trim();
const paymentKey = process.env.TOSS_E2E_PAYMENT_KEY.trim();
const userToken = process.env.TOSS_E2E_USER_ACCESS_TOKEN.trim();
const secret = process.env.TOSS_SECRET_KEY.trim();
const amount = 200000;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}
function tossBasicAuth() {
  return "Basic " + Buffer.from(secret + ":", "utf8").toString("base64");
}
function fail(code) {
  console.error("PAYMENT_E2E=NOT_VERIFIED");
  console.error("PAYMENT_E2E_FAILURE=" + code);
  process.exit(1);
}

try {
  // Step 1: Exercise the deployed server-side confirmation endpoint.
  const confirmUrl = baseUrl + "/.netlify/functions/toss-confirm";
  const first = await requestJson(confirmUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + userToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!first.response.ok || first.body?.verified !== true) fail("FIRST_CONFIRM_REJECTED");

  // Step 2: Independently verify the payment with Toss using the server secret.
  const toss = await requestJson(
    "https://api.tosspayments.com/v1/payments/" + encodeURIComponent(paymentKey),
    { headers: { Authorization: tossBasicAuth() } }
  );
  if (!toss.response.ok || toss.body?.status !== "DONE" ||
      toss.body?.orderId !== orderId || Number(toss.body?.totalAmount) !== amount ||
      (toss.body?.currency && toss.body.currency !== "KRW")) {
    fail("TOSS_APPROVAL_RECEIPT_MISMATCH");
  }

  // Step 3: Independently verify the persisted server-authoritative ledger row.
  const ledgerQuery = new URLSearchParams({
    select: "order_id,product_key,amount,currency,status,payment_key,paid_at",
    order_id: "eq." + orderId,
    limit: "1"
  });
  const ledger = await requestJson(supabaseUrl + "/rest/v1/toss_payment_orders?" + ledgerQuery, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
  });
  const row = Array.isArray(ledger.body) ? ledger.body[0] : null;
  if (!ledger.response.ok || !row || row.order_id !== orderId ||
      row.product_key !== "AI_QUICK_AUDIT" || Number(row.amount) !== amount ||
      row.currency !== "KRW" || row.status !== "paid" || row.payment_key !== paymentKey ||
      !row.paid_at) {
    fail("SUPABASE_LEDGER_MISMATCH");
  }

  // Step 4: Verify the same signed-in user's Quick Audit entitlement.
  const entitlementUrl = baseUrl + "/.netlify/functions/entitlement?session_id=" + encodeURIComponent(orderId);
  const entitlement = await requestJson(entitlementUrl, {
    headers: { Authorization: "Bearer " + userToken }
  });
  if (!entitlement.response.ok || entitlement.body?.verified !== true ||
      entitlement.body?.source !== "toss" || entitlement.body?.order_id !== orderId) {
    fail("QUICK_AUDIT_ENTITLEMENT_NOT_GRANTED");
  }

  // Step 5: Repeat confirmation and require an idempotent success response.
  const second = await requestJson(confirmUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + userToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!second.response.ok || second.body?.verified !== true || second.body?.idempotent !== true) {
    fail("IDEMPOTENCY_REPLAY_NOT_SAFE");
  }

  console.log("TOSS_APPROVAL=PASS");
  console.log("TOSS_APPROVED_AMOUNT_KRW=200000");
  console.log("SUPABASE_LEDGER=PASS");
  console.log("QUICK_AUDIT_ENTITLEMENT=PASS");
  console.log("PAYMENT_IDEMPOTENCY=PASS");
  console.log("PAYMENT_E2E=PASS");
} catch (error) {
  // Do not print request headers, secrets, payment keys, access tokens, or raw provider responses.
  console.error("PAYMENT_E2E=NOT_VERIFIED");
  console.error("PAYMENT_E2E_FAILURE=UNEXPECTED_RUNTIME_ERROR");
  process.exit(1);
}
