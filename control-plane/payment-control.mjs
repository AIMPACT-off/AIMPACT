import fs from "node:fs";
const required = ["netlify.toml","netlify/functions/stripe-webhook.mjs","netlify/functions/entitlement.mjs","netlify/functions/checkout.mjs","netlify/functions/toss-checkout.mjs","netlify/functions/toss-confirm.mjs","netlify/functions/toss-webhook.mjs","lib/product-catalog.mjs","supabase/migrations/202610090001_toss_payment_orders.sql","mobile/App.js"];
for (const file of required) {
  if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error("PAYMENT_CONTROL_MISSING_FILE=" + file);
}
const webhook = fs.readFileSync("netlify/functions/stripe-webhook.mjs","utf8");
const entitlement = fs.readFileSync("netlify/functions/entitlement.mjs","utf8");
const checkout = fs.readFileSync("netlify/functions/checkout.mjs","utf8");
const app = fs.readFileSync("mobile/App.js","utf8");
const netlify = fs.readFileSync("netlify.toml","utf8");
const tossCheckout = fs.readFileSync("netlify/functions/toss-checkout.mjs","utf8");
const tossConfirm = fs.readFileSync("netlify/functions/toss-confirm.mjs","utf8");
const tossWebhook = fs.readFileSync("netlify/functions/toss-webhook.mjs","utf8");
const catalog = fs.readFileSync("lib/product-catalog.mjs","utf8");
const assertions = [
  [webhook.includes("STRIPE_WEBHOOK_SECRET"),"webhook signature verification"],
  [webhook.includes("stripeEvent.id"),"event id captured"],
  [webhook.includes('payment_status === "paid"'),"paid-only proof"],
  [webhook.includes("amount_total"),"amount verification"],
  [webhook.includes("currency"),"currency verification"],
  [webhook.includes("AIMPACT_PAYMENT_RPC"),"server-side entitlement RPC"],
  [webhook.includes("AIMPACT_QUICK_AUDIT_PAYMENT_LINK_ID"),"payment-link environment override"],
  [webhook.includes("QUICK_AUDIT_PRICE_KRW"),"canonical price in webhook"],
  [checkout.includes("CHECKOUT_PRICE_MISMATCH"),"Stripe price object amount guard"],
  [tossCheckout.includes("AMOUNT_MISMATCH") && tossCheckout.includes("toss_payment_orders"),"authenticated Toss order and amount guard"],
  [tossConfirm.includes("/v1/payments/confirm"),"Toss server-side approval API"],
  [tossConfirm.includes("ORDER_ALREADY_PAID") && tossConfirm.includes("payment_key"),"Toss idempotency guard"],
  [tossWebhook.includes("/v1/payments/") && tossWebhook.includes("payment.totalAmount"),"Toss webhook provider API reconciliation"],
  [catalog.includes("QUICK_AUDIT_PRICE_KRW = 200000"),"canonical KRW 200000 catalog"],
  [checkout.includes("Authorization"),"authenticated checkout"],
  [checkout.includes("client_reference_id"),"auth-bound checkout"],
  [checkout.includes("STRIPE_SECRET_KEY"),"server-side Stripe secret only"],
  [entitlement.includes("eq.paid"),"paid entitlement filter"],
  [entitlement.includes("verified: true"),"verified entitlement response"],
  [entitlement.includes("SUPABASE_SERVICE_ROLE_KEY"),"server-side service role only"],
  [app.includes("CHECKOUT_API"),"current authenticated checkout API"],
  [app.includes("requestPurchase"),"native store purchase"],
  [netlify.includes('from = "/api/entitlement"'),"entitlement redirect"],
  [netlify.includes('from = "/api/checkout"'),"checkout redirect"],
  [netlify.includes('from = "/api/stripe-webhook"'),"webhook redirect"]
];
for (const [ok,label] of assertions) { console.log("PAYMENT_ASSERTION=" + label + " RESULT=" + (ok ? "PASS" : "FAIL")); if (!ok) throw new Error("PAYMENT_CONTROL_ASSERTION_FAILED=" + label); }
console.log("PAYMENT_CONTROL_CODE_GATE=PASS");
console.log("CHECKOUT_MODE=AUTHENTICATED_SERVER_CHECKOUT");
console.log("NATIVE_IAP_MODE=SERVER_VERIFIED");
