import test from "node:test";
import assert from "node:assert/strict";
import appConfig from "../mobile/app.config.js";

const config = appConfig({ config: { name: "AIMPACT", extra: { eas: { projectId: "26c387e9-f59e-4c88-b182-89bee4f4ee4a" } } } });

test("mobile app embeds only the public Supabase project config", () => {
  assert.equal(config.extra.supabaseUrl, "https://kakrrfsyczjbddezscvk.supabase.co");
  assert.match(config.extra.supabasePublishableKey, /^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)$/);
  assert.equal(config.extra.eas.projectId, "26c387e9-f59e-4c88-b182-89bee4f4ee4a");
  assert.equal("serviceRoleKey" in config.extra, false);
});