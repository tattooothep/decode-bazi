import { createHash } from "crypto";
import { GoogleAuth } from "google-auth-library";
import {
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  TransactionReason,
  Type,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import { mobileStorePackage } from "@/lib/mobile-store-products";
import type { VerifiedStorePurchase } from "@/lib/mobile-store-ledger";

export type StoreVerifyInput = {
  platform: "apple" | "google";
  productId: string;
  operation: "purchase" | "restore";
  transactionId?: string | null;
  purchaseToken?: string | null;
};

type GoogleSubscription = {
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  testPurchase?: unknown;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
};

type GoogleProduct = {
  purchaseTimeMillis?: string;
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
  purchaseType?: number;
  acknowledgementState?: number;
  purchaseToken?: string;
  productId?: string;
  quantity?: number;
  obfuscatedExternalAccountId?: string;
  refundableQuantity?: number;
};

export type StoreVerifierDependencies = {
  appleTransaction?: (transactionId: string) => Promise<JWSTransactionDecodedPayload>;
  googleSubscription?: (purchaseToken: string) => Promise<GoogleSubscription>;
  googleProduct?: (productId: string, purchaseToken: string) => Promise<GoogleProduct>;
};

export function storeAccountHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

function isoFromMs(value: number | string | undefined): string | null {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function appleVerificationConfig() {
  const bundleId = String(process.env.APPLE_BUNDLE_ID || "io.hourkey.app");
  const appAppleId = Number(process.env.APPLE_APP_ID || 0) || undefined;
  const roots = String(process.env.APPLE_ROOT_CA_BASE64 || "")
    .split(",").map((item) => item.trim()).filter(Boolean).map((item) => Buffer.from(item, "base64"));
  if (!roots.length) throw new Error("apple_store_not_configured");
  return { bundleId, appAppleId, roots };
}

function appleConfig() {
  const verification = appleVerificationConfig();
  const privateKey = String(process.env.APPLE_IAP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const keyId = String(process.env.APPLE_IAP_KEY_ID || "");
  const issuerId = String(process.env.APPLE_IAP_ISSUER_ID || "");
  if (!privateKey || !keyId || !issuerId) throw new Error("apple_store_not_configured");
  return { ...verification, privateKey, keyId, issuerId };
}

async function fetchAppleTransaction(transactionId: string): Promise<JWSTransactionDecodedPayload> {
  const config = appleConfig();
  async function lookup(environment: Environment) {
    if (environment === Environment.PRODUCTION && !config.appAppleId) throw new Error("apple_app_id_missing");
    const client = new AppStoreServerAPIClient(config.privateKey, config.keyId, config.issuerId, config.bundleId, environment);
    const response = await client.getTransactionInfo(transactionId);
    if (!response.signedTransactionInfo) throw new Error("apple_signed_transaction_missing");
    const verifier = new SignedDataVerifier(
      config.roots,
      true,
      environment,
      config.bundleId,
      environment === Environment.PRODUCTION ? config.appAppleId : undefined
    );
    return verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
  }
  try {
    return await lookup(Environment.PRODUCTION);
  } catch (error) {
    if (!(error instanceof APIException) || ![400, 404].includes(error.httpStatusCode)) throw error;
    return lookup(Environment.SANDBOX);
  }
}

function googleCredentials(): Record<string, unknown> {
  const direct = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "").trim();
  const encoded = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 || "").trim();
  const raw = direct || (encoded ? Buffer.from(encoded, "base64").toString("utf8") : "");
  if (!raw) throw new Error("google_play_not_configured");
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("google_play_credentials_invalid"); }
}

async function googleAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: googleCredentials(),
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("google_play_token_failed");
  return token.token;
}

async function googleGet(path: string): Promise<unknown> {
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    headers: { Authorization: `Bearer ${await googleAccessToken()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`google_play_http_${response.status}`);
  return response.json();
}

export async function fetchGoogleSubscription(purchaseToken: string): Promise<GoogleSubscription> {
  return googleGet(`applications/io.hourkey.app/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`) as Promise<GoogleSubscription>;
}

export async function fetchGoogleProduct(productId: string, purchaseToken: string): Promise<GoogleProduct> {
  return googleGet(`applications/io.hourkey.app/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`) as Promise<GoogleProduct>;
}

export async function verifyAppleServerNotification(signedPayload: string) {
  const config = appleVerificationConfig();
  const candidates = [
    ...(config.appAppleId ? [Environment.PRODUCTION] : []),
    Environment.SANDBOX,
  ];
  let lastError: unknown = null;
  for (const environment of candidates) {
    try {
      const verifier = new SignedDataVerifier(
        config.roots,
        true,
        environment,
        config.bundleId,
        environment === Environment.PRODUCTION ? config.appAppleId : undefined
      );
      const notification = await verifier.verifyAndDecodeNotification(signedPayload);
      const signedTransaction = notification.data?.signedTransactionInfo;
      const transaction = signedTransaction ? await verifier.verifyAndDecodeTransaction(signedTransaction) : null;
      const signedRenewal = notification.data?.signedRenewalInfo;
      const renewal = signedRenewal ? await verifier.verifyAndDecodeRenewalInfo(signedRenewal) : null;
      return { environment, notification, transaction, renewal };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("apple_notification_verification_failed");
}

export function normalizeAppleTransaction(
  userId: string,
  operation: StoreVerifyInput["operation"],
  transaction: JWSTransactionDecodedPayload
): VerifiedStorePurchase {
  const productId = String(transaction.productId || "");
  const pkg = mobileStorePackage(productId);
  if (!pkg) throw new Error("unknown_store_product");
  if (String(transaction.bundleId || "") !== "io.hourkey.app") throw new Error("apple_bundle_mismatch");
  if (String(transaction.appAccountToken || "").toLowerCase() !== userId.toLowerCase()) throw new Error("store_account_binding_mismatch");
  const expectedType = pkg.kind === "subscription" ? Type.AUTO_RENEWABLE_SUBSCRIPTION : Type.CONSUMABLE;
  if (transaction.type !== expectedType) throw new Error("apple_product_type_mismatch");
  const transactionId = String(transaction.transactionId || "");
  const originalRef = String(transaction.originalTransactionId || transactionId);
  if (!transactionId || !originalRef) throw new Error("store_reference_missing");
  const expiresAt = isoFromMs(transaction.expiresDate);
  const revoked = Number(transaction.revocationDate || 0) > 0;
  const expired = pkg.kind === "subscription" && (!expiresAt || new Date(expiresAt).getTime() <= Date.now());
  const state: VerifiedStorePurchase["state"] = revoked ? "revoked" : expired ? "expired" : "active";
  const renewal = transaction.transactionReason === TransactionReason.RENEWAL;
  return {
    platform: "apple",
    productId,
    eventRef: revoked ? `${transactionId}:revoked:${transaction.revocationDate}` : transactionId,
    originalRef,
    eventKind: revoked ? "refund" : renewal ? "renewal" : operation,
    state,
    environment: transaction.environment === Environment.PRODUCTION ? "production" : "sandbox",
    purchasedAt: isoFromMs(transaction.purchaseDate),
    expiresAt: pkg.kind === "subscription" ? expiresAt : null,
    autoRenewing: null,
    accountBinding: String(transaction.appAccountToken || "").toLowerCase(),
    summary: {
      transaction_reason: transaction.transactionReason || null,
      ownership_type: transaction.inAppOwnershipType || null,
      storefront: transaction.storefront || null,
      signed_date: isoFromMs(transaction.signedDate),
    },
  };
}

export function normalizeGoogleSubscription(
  userId: string,
  productId: string,
  purchaseToken: string,
  operation: StoreVerifyInput["operation"],
  purchase: GoogleSubscription
): VerifiedStorePurchase {
  const pkg = mobileStorePackage(productId);
  if (!pkg || pkg.kind !== "subscription") throw new Error("google_product_type_mismatch");
  if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== storeAccountHash(userId)) throw new Error("store_account_binding_mismatch");
  const items = purchase.lineItems || [];
  const matching = items.filter((item) => item.productId === productId);
  if (!matching.length) throw new Error("google_product_mismatch");
  const expiry = matching.map((item) => item.expiryTime || "").filter(Boolean).sort().at(-1) || null;
  const eventRef = matching.map((item) => item.latestSuccessfulOrderId || "").filter(Boolean).sort().at(-1)
    || `${storeAccountHash(purchaseToken)}:${expiry || purchase.subscriptionState || "unknown"}`;
  const stateMap: Record<string, VerifiedStorePurchase["state"]> = {
    SUBSCRIPTION_STATE_ACTIVE: "active",
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace",
    SUBSCRIPTION_STATE_CANCELED: "canceled",
    SUBSCRIPTION_STATE_PENDING: "pending",
    SUBSCRIPTION_STATE_PAUSED: "pending",
    SUBSCRIPTION_STATE_ON_HOLD: "pending",
    SUBSCRIPTION_STATE_EXPIRED: "expired",
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "expired",
  };
  const state = stateMap[String(purchase.subscriptionState || "")] || "pending";
  return {
    platform: "google",
    productId,
    eventRef,
    originalRef: storeAccountHash(purchaseToken),
    eventKind: operation,
    state,
    environment: purchase.testPurchase ? "test" : "production",
    purchasedAt: purchase.startTime || null,
    expiresAt: expiry,
    purchaseToken,
    autoRenewing: matching.some((item) => item.autoRenewingPlan?.autoRenewEnabled === true),
    accountBinding: userId,
    summary: {
      subscription_state: purchase.subscriptionState || null,
      acknowledgement_state: purchase.acknowledgementState || null,
      latest_order_id: purchase.latestOrderId || null,
    },
  };
}

export function normalizeGoogleProduct(
  userId: string,
  productId: string,
  purchaseToken: string,
  operation: StoreVerifyInput["operation"],
  purchase: GoogleProduct
): VerifiedStorePurchase {
  const pkg = mobileStorePackage(productId);
  if (!pkg || pkg.kind !== "topup") throw new Error("google_product_type_mismatch");
  if (purchase.productId !== productId) throw new Error("google_product_mismatch");
  if (purchase.obfuscatedExternalAccountId !== storeAccountHash(userId)) throw new Error("store_account_binding_mismatch");
  if (Number(purchase.quantity || 1) !== 1) throw new Error("google_quantity_unsupported");
  const state = Number(purchase.purchaseState) === 0 ? "active" : Number(purchase.purchaseState) === 1 ? "revoked" : "pending";
  const originalRef = purchase.orderId || storeAccountHash(purchaseToken);
  return {
    platform: "google",
    productId,
    eventRef: state === "revoked" ? `${originalRef}:revoked` : originalRef,
    originalRef,
    eventKind: state === "revoked" ? "refund" : operation,
    state,
    environment: purchase.purchaseType === 0 ? "test" : "production",
    purchasedAt: isoFromMs(purchase.purchaseTimeMillis),
    expiresAt: null,
    purchaseToken,
    accountBinding: userId,
    summary: {
      acknowledgement_state: purchase.acknowledgementState ?? null,
      consumption_state: purchase.consumptionState ?? null,
      refundable_quantity: purchase.refundableQuantity ?? null,
    },
  };
}

export async function verifyMobileStorePurchase(
  userId: string,
  input: StoreVerifyInput,
  dependencies: StoreVerifierDependencies = {}
): Promise<VerifiedStorePurchase> {
  const pkg = mobileStorePackage(input.productId);
  if (!pkg) throw new Error("unknown_store_product");
  if (input.platform === "apple") {
    const transactionId = String(input.transactionId || "").trim();
    if (!/^\d{5,40}$/.test(transactionId)) throw new Error("apple_transaction_id_invalid");
    const transaction = await (dependencies.appleTransaction || fetchAppleTransaction)(transactionId);
    if (transaction.transactionId !== transactionId) throw new Error("apple_transaction_mismatch");
    return normalizeAppleTransaction(userId, input.operation, transaction);
  }
  const purchaseToken = String(input.purchaseToken || "").trim();
  if (purchaseToken.length < 20 || purchaseToken.length > 4000) throw new Error("google_purchase_token_invalid");
  if (pkg.kind === "subscription") {
    const purchase = await (dependencies.googleSubscription || fetchGoogleSubscription)(purchaseToken);
    return normalizeGoogleSubscription(userId, input.productId, purchaseToken, input.operation, purchase);
  }
  const purchase = await (dependencies.googleProduct || fetchGoogleProduct)(input.productId, purchaseToken);
  return normalizeGoogleProduct(userId, input.productId, purchaseToken, input.operation, purchase);
}
