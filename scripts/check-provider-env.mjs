#!/usr/bin/env node
/**
 * Reports provider credential presence without printing values.
 * Presence is NOT proof that a credential is valid; live auth checks require
 * provider-specific, read-only health endpoints and explicit allowlisting.
 */
const providers = [
  ["OPENAI_API_KEY", "OpenAI"],
  ["ANTHROPIC_API_KEY", "Anthropic"],
  ["ZAPIER_WEBHOOK_URL", "Zapier webhook"],
];
const missing = [];
for (const [name, label] of providers) {
  const value = process.env[name];
  const present = typeof value === "string" && value.trim().length > 0;
  console.log(JSON.stringify({ provider: label, credential: name, present }));
  if (!present) missing.push(name);
}
const dryRun = missing.length > 0;
console.log(JSON.stringify({
  event: dryRun ? "CRITICAL_ENV_MISSING" : "CREDENTIALS_PRESENT_AUTH_UNVERIFIED",
  mode: dryRun ? "DRY_RUN_REQUIRED" : "AUTH_HEALTH_CHECK_REQUIRED",
  missing
}));
if (process.env.REQUIRE_PROVIDER_ENV === "true" && dryRun) process.exitCode = 2;
