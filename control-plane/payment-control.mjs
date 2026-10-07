import fs from "node:fs";
const required = ["netlify.toml","netlify/functions/stripe-webhook.mjs","netlify/functions/entitlement.mjs","mobile/App.js"];
const expectedPaymentLink = "plink_1UNpJEGeNSkj4zfGecYTrM3u";
const expectedCheckout = "https://buy.stripe.com/test_7sY7sL1Gz1dI7ohg1ofrW04";
for (const file of required) {
  if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error("PAYMENT_CONTROL_MISSING_FILE=" + file);
}
const webhook = fs.readFileSync("netlify/functions/stripe-webhook.mjs","utf8");
const entitlement = fs.readFileSync("netlify/functions/entitlement.mjs","utf8");
const app = fs.readFileSync("mobile/App.js","utf8");
const netlify = fs.readFileSync("netlify.toml","utf8");
const assertions = [
  [webhook.includes("STRIPE_WEBHOOK_SECRET"),"webhook signature verification"],
  [webhook.includes("stripeEvent.id"),"event id captured"],
  [webhook.includes("payment_status === \"paid\""),"paid-only proof"],
  [webhook.includes("amount_total"),"amount verification"],
  [webhook.includes("currency"),"currency verification"],
  [webhook.includes("AIMPACT_PAYMENT_RPC"),"server-side entitlement RPC"],
  [webhook.includes("AIMPACT_QUICK_AUDIT_PAYMENT_LINK_ID"),"payment-link environment override"],
  [entitlement.includes("eq.paid"),"paid entitlement filter"],
  [entitlement.includes("verified: true"),"verified entitlement response"],
  [entitlement.includes("SUPABASE_SERVICE_ROLE_KEY"),"server-side service role only"],
  [app.includes(expectedCheckout),"current sandbox checkout"],
  [app.includes("Linking.openURL(CHECKOUT)"),"customer checkout launch"],
  [netlify.includes('from = "/api/entitlement"'),"entitlement redirect"],
  [netlify.includes('from = "/api/stripe-webhook"'),"webhook redirect"]
];
for (const [ok,label] of assertions) if (!ok) throw new Error("PAYMENT_CONTROL_ASSERTION_FAILED=" + label);
if (webhook.includes("plink_1UNaLsGiFhip6B2FIcpPrnOj")) throw new Error("PAYMENT_CONTROL_STALE_PAYMENT_LINK_ID");
console.log("PAYMENT_CONTROL_CODE_GATE=PASS");
console.log("PAYMENT_LINK_ID_EXPECTED=" + expectedPaymentLink);
console.log("CHECKOUT_URL_EXPECTED=" + expectedCheckout);