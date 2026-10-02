import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyLiveHandshake } from "../lib/live-handshake.mjs";

const secret = "test-only-passphrase-that-is-at-least-32-chars";
const digest = createHash("sha256").update(secret).digest("hex");

test("LIVE handshake accepts matching independent SHA-256 digest", () => {
  assert.deepEqual(verifyLiveHandshake({ passphrase: secret, expectedSha256: digest }), { ok: true, code: "LIVE_HANDSHAKE_VERIFIED" });
});
test("LIVE handshake rejects absent, weak, malformed, and mismatched credentials", () => {
  assert.equal(verifyLiveHandshake({}).code, "LIVE_HANDSHAKE_NOT_CONFIGURED");
  assert.equal(verifyLiveHandshake({ passphrase: "short", expectedSha256: digest }).ok, false);
  assert.equal(verifyLiveHandshake({ passphrase: secret, expectedSha256: "bad" }).code, "LIVE_HANDSHAKE_NOT_CONFIGURED");
  assert.equal(verifyLiveHandshake({ passphrase: secret + "x", expectedSha256: digest }).code, "LIVE_HANDSHAKE_MISMATCH");
});
