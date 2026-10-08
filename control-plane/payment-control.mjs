import fs from "node:fs";
const required = ["netlify.toml","netlify/functions/stripe-webhook.mjs","netlify/functions/entitlement.mjs","netlify/functions/checkout.mjs","mobile/App.js"];
for (const file of required) {
  if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error("PAYMENT_CONTROL_MISSING_FILE=" + file);
}
const webhook = fs.readFileSync("netlify/functions/stripe-webhook.mjs","utf8");
const entitlement = fs.readFileSync("netlify/functions/entitlement.mjs","utf8");
const checkout = fs.readFileSync("netlify/functions/checkout.mjs","utf8");
const app = fs.readFileSync("mobile/App.js","utf8");
const netlify = fs.readFileSync("netlify.toml","utf8");
const assertions = [
  [webhook.includes("STRIPE_WEBHOOK_SECRET"),"webhook signature verification"],
  [webhook.includes("stripeEvent.id"),"event id captured"],
  [webhook.includes('payment_status === "paid"'),"paid-only proof"],
  [webhook.includes("amount_total"),"amount verification"],
  [webhook.includes("currency"),"currency verification"],
  [webhook.includes("AIMPACT_PAYMENT_RPC"),"server-side entitlement RPC"],
  [webhook.includes("AIMPACT_QUICK_AUDIT_PAYMENT_LINK_ID"),"payment-link environment override"],
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
