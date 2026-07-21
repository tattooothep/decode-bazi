import crypto from "node:crypto";

const {
  normalizeAppleTransaction,
  normalizeGoogleProduct,
  normalizeGoogleSubscription,
  storeAccountHash,
  verifyMobileStorePurchase,
} = await import("../src/lib/mobile-store-verifier.ts");

const userId = crypto.randomUUID();
const binding = storeAccountHash(userId);
let checks = 0;

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

const applePremium = {
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123400000",
  bundleId: "io.hourkey.app",
  productId: "io.hourkey.premium.monthly",
  type: "Auto-Renewable Subscription",
  appAccountToken: userId,
  purchaseDate: Date.now() - 1000,
  expiresDate: Date.now() + 30 * 86_400_000,
  signedDate: Date.now(),
  environment: "Sandbox",
  transactionReason: "PURCHASE",
};
let normalized = normalizeAppleTransaction(userId, "purchase", applePremium);
check(normalized.platform === "apple" && normalized.state === "active" && normalized.accountBinding === userId, "Apple transaction requires the Hourkey appAccountToken");
check(normalized.productId === "io.hourkey.premium.monthly" && normalized.originalRef === applePremium.originalTransactionId, "Apple product and subscription lineage come from signed transaction data");

let rejected = false;
try { normalizeAppleTransaction(crypto.randomUUID(), "restore", applePremium); }
catch (error) { rejected = String(error).includes("binding_mismatch"); }
check(rejected, "Apple transaction cannot be restored into another Hourkey account");

normalized = normalizeAppleTransaction(userId, "restore", {
  ...applePremium,
  productId: "io.hourkey.yam.100",
  type: "Consumable",
  transactionId: "2000000123456790",
  originalTransactionId: "2000000123456790",
  expiresDate: undefined,
  revocationDate: Date.now(),
});
check(normalized.state === "revoked" && normalized.eventKind === "refund" && normalized.eventRef.includes("revoked"), "Apple refunded consumable becomes a distinct revoke event");

const googleSubscription = {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: new Date().toISOString(),
  latestOrderId: "GPA.1111-2222-3333-44444",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  externalAccountIdentifiers: { obfuscatedExternalAccountId: binding },
  lineItems: [{
    productId: "io.hourkey.master.monthly",
    expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    latestSuccessfulOrderId: "GPA.1111-2222-3333-44444..0",
    autoRenewingPlan: { autoRenewEnabled: true },
  }],
};
normalized = normalizeGoogleSubscription(userId, "io.hourkey.master.monthly", "google-token-abcdefghijklmnop", "purchase", googleSubscription);
check(normalized.platform === "google" && normalized.state === "active" && normalized.autoRenewing === true, "Google subscription uses subscriptionsv2 state and expiry");
check(normalized.eventRef.endsWith("..0") && normalized.originalRef === storeAccountHash("google-token-abcdefghijklmnop"), "Google renewal event and token lineage are deterministic");

rejected = false;
try {
  normalizeGoogleSubscription(crypto.randomUUID(), "io.hourkey.master.monthly", "google-token-abcdefghijklmnop", "restore", googleSubscription);
} catch (error) { rejected = String(error).includes("binding_mismatch"); }
check(rejected, "Google subscription cannot be claimed with another obfuscated account ID");

const googleTopup = {
  purchaseTimeMillis: String(Date.now()),
  purchaseState: 0,
  consumptionState: 0,
  orderId: "GPA.9999-8888-7777-66666",
  acknowledgementState: 0,
  productId: "io.hourkey.yam.550",
  quantity: 1,
  obfuscatedExternalAccountId: binding,
  refundableQuantity: 1,
};
normalized = normalizeGoogleProduct(userId, "io.hourkey.yam.550", "topup-token-abcdefghijklmnop", "purchase", googleTopup);
check(normalized.state === "active" && normalized.originalRef === googleTopup.orderId, "Google consumable is normalized from verified product purchase data");
normalized = normalizeGoogleProduct(userId, "io.hourkey.yam.550", "topup-token-abcdefghijklmnop", "restore", { ...googleTopup, purchaseState: 1 });
check(normalized.state === "revoked" && normalized.eventKind === "refund", "Google canceled/refunded consumable becomes a revoke event");

normalized = await verifyMobileStorePurchase(userId, {
  platform: "apple",
  productId: "io.hourkey.premium.monthly",
  operation: "purchase",
  transactionId: applePremium.transactionId,
}, { appleTransaction: async () => applePremium });
check(normalized.eventRef === applePremium.transactionId, "verification pipeline accepts only matching Apple transaction IDs");

rejected = false;
try {
  await verifyMobileStorePurchase(userId, {
    platform: "apple",
    productId: "io.hourkey.premium.monthly",
    operation: "purchase",
    transactionId: applePremium.transactionId,
  }, { appleTransaction: async () => ({ ...applePremium, transactionId: "2000000999999999" }) });
} catch (error) { rejected = String(error).includes("transaction_mismatch"); }
check(rejected, "Apple API response must match the transaction requested by the device");

console.log(`${checks} mobile store verifier checks passed`);
