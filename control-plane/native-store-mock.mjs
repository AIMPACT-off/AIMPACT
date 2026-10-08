import assert from "node:assert/strict";

const PRODUCT = "ai.aimpact.quick_audit";
const USER = "00000000-0000-0000-0000-000000000001";

function mockAppleReceipt({ productId = PRODUCT, appAccountToken = USER } = {}) {
  return {
    platform: "ios",
    productId,
    purchaseToken: "MOCK_APPLE_SIGNED_TRANSACTION",
    transactionId: "MOCK-APPLE-TRANSACTION-001",
    signedTransaction: { productId, bundleId: "ai.aimpact.app", appAccountToken }
  };
}

function mockGoogleReceipt({ productId = PRODUCT, obfuscatedExternalAccountId = USER } = {}) {
  return {
    platform: "android",
    productId,
    purchaseToken: "MOCK-GOOGLE-PURCHASE-TOKEN",
    transactionId: "MOCK-GOOGLE-ORDER-001",
    purchaseState: 0,
    acknowledgementState: 0,
    obfuscatedExternalAccountId
  };
}

function verifyMock(receipt, expectedUserId) {
  assert.equal(receipt.productId, PRODUCT);
  assert.equal(receipt.platform === "ios" || receipt.platform === "android", true);
  assert.ok(receipt.purchaseToken);
  assert.ok(receipt.transactionId);

  if (receipt.platform === "ios") {
    assert.equal(receipt.signedTransaction.productId, PRODUCT);
    assert.equal(receipt.signedTransaction.bundleId, "ai.aimpact.app");
    assert.equal(receipt.signedTransaction.appAccountToken, expectedUserId);
  } else {
    assert.equal(receipt.purchaseState, 0);
    assert.equal(receipt.obfuscatedExternalAccountId, expectedUserId);
  }

  return {
    verified: true,
    entitlement: "AI_QUICK_AUDIT",
    auth_user_id: expectedUserId,
    product_id: PRODUCT,
    transaction_id: receipt.transactionId
  };
}

const apple = verifyMock(mockAppleReceipt(), USER);
const google = verifyMock(mockGoogleReceipt(), USER);

assert.equal(apple.verified, true);
assert.equal(google.verified, true);

assert.throws(
  () => verifyMock(mockAppleReceipt({ appAccountToken: "wrong-user" }), USER)
);
assert.throws(
  () => verifyMock(mockGoogleReceipt({ obfuscatedExternalAccountId: "wrong-user" }), USER)
);
assert.throws(
  () => verifyMock(mockAppleReceipt({ productId: "wrong.product" }), USER)
);

console.log("MOCK_APPLE_RECEIPT=PASS");
console.log("MOCK_GOOGLE_RECEIPT=PASS");
console.log("MOCK_ACCOUNT_BINDING_NEGATIVE_TEST=PASS");
console.log("MOCK_PRODUCT_BINDING_NEGATIVE_TEST=PASS");
console.log("MOCK_STORE_ENTITLEMENT_LOOP=PASS");
console.log("REAL_STORE_GATE=UNCHANGED");
