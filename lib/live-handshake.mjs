import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Two-part LIVE gate. The passphrase is supplied only through the runtime secret
 * store; the expected SHA-256 digest is provisioned independently by the control
 * plane. This is an activation check, not a substitute for signed, short-lived
 * operator authorization or the existing control-plane policy check.
 */
export function verifyLiveHandshake({ passphrase, expectedSha256 } = {}) {
  if (typeof passphrase !== "string" || passphrase.length < 32 ||
      typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    return { ok: false, code: "LIVE_HANDSHAKE_NOT_CONFIGURED" };
  }
  const actual = createHash("sha256").update(passphrase, "utf8").digest();
  const expected = Buffer.from(expectedSha256, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, code: "LIVE_HANDSHAKE_MISMATCH" };
  }
  return { ok: true, code: "LIVE_HANDSHAKE_VERIFIED" };
}
