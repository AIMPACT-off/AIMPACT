import { chromium } from "playwright";

const required = [
  "AIMPACT_E2E_BASE_URL",
  "TOSS_SECRET_KEY",
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

let browser;
try {
  // Create a fresh server-side order on every run. Never reuse a paymentKey/orderId fixture.
  const checkout = await requestJson(baseUrl + "/.netlify/functions/toss-checkout", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + userToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ amount, productKey: "AI_QUICK_AUDIT" })
  });
  const order = checkout.body;
  if (!checkout.response.ok || order?.provider !== "toss" || order?.verified !== false ||
      !order?.orderId || !order?.customerKey || Number(order?.amount) !== amount ||
      order?.currency !== "KRW" || order?.clientKey !== clientKey ||
      !String(order?.successUrl || "").startsWith(baseUrl) ||
      !String(order?.failUrl || "").startsWith(baseUrl)) {
    fail("DYNAMIC_CHECKOUT_ORDER_CREATION_FAILED");
  }
  const orderId = order.orderId;
  const clientKey = order.clientKey;
  console.log("DYNAMIC_ORDER_CREATED=PASS");

  // Open the real Toss-hosted payment UI in Chromium. Toss sandbox _skipAuth simulates
  // authentication only in test mode; the payment still has to return a real paymentKey.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.setContent('<!doctype html><html><body><button id="pay">Pay sandbox order</button></body></html>');
  await page.addScriptTag({ url: "https://js.tosspayments.com/v1/payment" });
  await page.evaluate(({ clientKey, customerKey, orderId, amount, successUrl, failUrl }) => {
    const toss = window.TossPayments(clientKey);
    const payment = toss.payment({ customerKey });
    document.querySelector("#pay").addEventListener("click", () => {
      payment.requestPayment("카드", {
        amount,
        orderId,
        orderName: "AIMPACT AI Quick Audit",
        successUrl,
        failUrl,
        card: { _skipAuth: true }
      });
    });
  }, {
    clientKey,
    customerKey: order.customerKey,
    orderId,
    amount,
    successUrl: order.successUrl,
    failUrl: order.failUrl
  });
  await Promise.all([
    page.waitForURL(url => url.searchParams.has("paymentKey") && url.searchParams.get("orderId") === orderId, { timeout: 120000 }),
    page.click("#pay")
  ]);
  const resultUrl = new URL(page.url());
  const paymentKey = resultUrl.searchParams.get("paymentKey");
  const returnedOrderId = resultUrl.searchParams.get("orderId");
  const returnedAmount = Number(resultUrl.searchParams.get("amount"));
  if (!paymentKey || returnedOrderId !== orderId || returnedAmount !== amount) fail("TOSS_CHECKOUT_RETURN_MISMATCH");
  console.log("TOSS_PAYMENT_UI=PASS");
  console.log("DYNAMIC_PAYMENT_KEY_RECEIVED=PASS");

  // Server-side confirmation is the only operation that grants paid status/entitlement.
  const confirmUrl = baseUrl + "/.netlify/functions/toss-confirm";
  const first = await requestJson(confirmUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + userToken, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!first.response.ok || first.body?.verified !== true) fail("FIRST_CONFIRM_REJECTED");

  // Independently verify the provider's authoritative receipt.
  const toss = await requestJson(
    "https://api.tosspayments.com/v1/payments/" + encodeURIComponent(paymentKey),
    { headers: { Authorization: tossBasicAuth() } }
  );
  if (!toss.response.ok || toss.body?.status !== "DONE" || toss.body?.orderId !== orderId ||
      Number(toss.body?.totalAmount) !== amount ||
      (toss.body?.currency && toss.body.currency !== "KRW")) {
    fail("TOSS_APPROVAL_RECEIPT_MISMATCH");
  }

  // Independently verify exactly one server-authoritative paid ledger row.
  const ledgerQuery = new URLSearchParams({
    select: "order_id,auth_user_id,product_key,amount,currency,status,payment_key,paid_at",
    order_id: "eq." + orderId,
    limit: "2"
  });
  const ledger = await requestJson(supabaseUrl + "/rest/v1/toss_payment_orders?" + ledgerQuery, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
  });
  const rows = Array.isArray(ledger.body) ? ledger.body : [];
  const row = rows[0];
  if (!ledger.response.ok || rows.length !== 1 || !row || row.order_id !== orderId ||
      row.product_key !== "AI_QUICK_AUDIT" || Number(row.amount) !== amount ||
      row.currency !== "KRW" || row.status !== "paid" || row.payment_key !== paymentKey || !row.paid_at) {
    fail("SUPABASE_LEDGER_MISMATCH_OR_DUPLICATE");
  }

  const entitlementUrl = baseUrl + "/.netlify/functions/entitlement?session_id=" + encodeURIComponent(orderId);
  const entitlement = await requestJson(entitlementUrl, {
    headers: { Authorization: "Bearer " + userToken }
  });
  if (!entitlement.response.ok || entitlement.body?.verified !== true ||
      entitlement.body?.source !== "toss" || entitlement.body?.order_id !== orderId) {
    fail("QUICK_AUDIT_ENTITLEMENT_NOT_GRANTED");
  }

  const second = await requestJson(confirmUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + userToken, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!second.response.ok || second.body?.verified !== true || second.body?.idempotent !== true) {
    fail("IDEMPOTENCY_REPLAY_NOT_SAFE");
  }

  const afterReplay = await requestJson(supabaseUrl + "/rest/v1/toss_payment_orders?" + ledgerQuery, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
  });
  const afterRows = Array.isArray(afterReplay.body) ? afterReplay.body : [];
  if (!afterReplay.response.ok || afterRows.length !== 1 ||
      afterRows[0]?.payment_key !== paymentKey || afterRows[0]?.status !== "paid") {
    fail("IDEMPOTENCY_LEDGER_DUPLICATE_OR_MUTATION");
  }

  console.log("TOSS_APPROVAL=PASS");
  console.log("TOSS_APPROVED_AMOUNT_KRW=200000");
  console.log("SUPABASE_LEDGER=PASS");
  console.log("QUICK_AUDIT_ENTITLEMENT=PASS");
  console.log("PAYMENT_IDEMPOTENCY=PASS");
  console.log("PAYMENT_E2E=PASS");
} catch {
  console.error("PAYMENT_E2E=NOT_VERIFIED");
  console.error("PAYMENT_E2E_FAILURE=UNEXPECTED_RUNTIME_ERROR");
  process.exit(1);
} finally {
  if (browser) await browser.close().catch(() => {});
}
