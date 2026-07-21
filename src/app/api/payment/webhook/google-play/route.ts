import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { q1 } from "@/lib/db";
import { applyVerifiedStorePurchase } from "@/lib/mobile-store-ledger";
import { mobileStorePackage } from "@/lib/mobile-store-products";
import {
  fetchGoogleProduct,
  fetchGoogleSubscription,
  normalizeGoogleProduct,
  normalizeGoogleSubscription,
} from "@/lib/mobile-store-verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeveloperNotification = {
  packageName?: string;
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string };
  oneTimeProductNotification?: { notificationType?: number; purchaseToken?: string; sku?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: unknown;
};

async function authenticate(req: Request): Promise<boolean> {
  const audience = String(process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE || "");
  const expectedEmail = String(process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT || "").toLowerCase();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!audience || !expectedEmail || !token) return false;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return payload?.email_verified === true && String(payload.email || "").toLowerCase() === expectedEmail;
  } catch {
    return false;
  }
}

async function userForHash(hash: string | undefined) {
  if (!hash) return null;
  return q1<{ id: string }>(`SELECT id FROM users WHERE store_account_hash=$1 AND deleted_at IS NULL`, [hash]);
}

export async function POST(req: Request) {
  if (!(await authenticate(req))) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const envelope = await req.json().catch(() => ({}));
  const messageId = String(envelope.message?.messageId || envelope.message?.message_id || "");
  const encoded = String(envelope.message?.data || "");
  if (!messageId || !encoded || encoded.length > 1_500_000) {
    return NextResponse.json({ ok: false, error: "invalid_pubsub_message" }, { status: 400 });
  }
  let notification: DeveloperNotification;
  try { notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DeveloperNotification; }
  catch { return NextResponse.json({ ok: false, error: "invalid_notification" }, { status: 400 }); }
  if (notification.packageName !== "io.hourkey.app") {
    return NextResponse.json({ ok: false, error: "package_mismatch" }, { status: 400 });
  }
  if (notification.testNotification) return NextResponse.json({ ok: true, test: true });

  try {
    const sub = notification.subscriptionNotification;
    if (sub?.purchaseToken) {
      const purchase = await fetchGoogleSubscription(sub.purchaseToken);
      const supported = (purchase.lineItems || []).map((item) => String(item.productId || ""))
        .filter((id) => mobileStorePackage(id)?.kind === "subscription");
      if (supported.length !== 1) throw new Error("google_product_mismatch");
      const user = await userForHash(purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId);
      if (!user) return NextResponse.json({ ok: true, ignored: "account_not_available" });
      const verified = normalizeGoogleSubscription(user.id, supported[0], sub.purchaseToken, "restore", purchase);
      const type = Number(sub.notificationType || 0);
      verified.eventRef = `rtdn:${messageId}`;
      verified.eventKind = type === 2 ? "renewal" : type === 4 ? "purchase" : type === 12 ? "revoke" : "status_sync";
      if (type === 12) verified.state = "revoked";
      else if (type === 13 || type === 20) verified.state = "expired";
      else if (type === 6) verified.state = "grace";
      else if (type === 3) verified.state = "canceled";
      else if ([5, 10].includes(type)) verified.state = "pending";
      verified.summary = { ...(verified.summary || {}), rtdn_type: type, pubsub_message_id: messageId };
      const result = await applyVerifiedStorePurchase(user.id, verified);
      return NextResponse.json({ ok: true, processing: result.status });
    }

    const oneTime = notification.oneTimeProductNotification;
    if (oneTime?.purchaseToken && oneTime.sku && mobileStorePackage(oneTime.sku)?.kind === "topup") {
      const purchase = await fetchGoogleProduct(oneTime.sku, oneTime.purchaseToken);
      const user = await userForHash(purchase.obfuscatedExternalAccountId);
      if (!user) return NextResponse.json({ ok: true, ignored: "account_not_available" });
      const verified = normalizeGoogleProduct(user.id, oneTime.sku, oneTime.purchaseToken, "purchase", purchase);
      verified.eventRef = `rtdn:${messageId}`;
      if (Number(oneTime.notificationType) === 2) {
        verified.state = "revoked";
        verified.eventKind = "refund";
      }
      verified.summary = { ...(verified.summary || {}), rtdn_type: oneTime.notificationType || null, pubsub_message_id: messageId };
      const result = await applyVerifiedStorePurchase(user.id, verified);
      return NextResponse.json({ ok: true, processing: result.status });
    }

    const voided = notification.voidedPurchaseNotification;
    if (voided?.purchaseToken && Number(voided.productType) === 1) {
      const purchase = await fetchGoogleSubscription(voided.purchaseToken);
      const productId = (purchase.lineItems || []).map((item) => String(item.productId || ""))
        .find((id) => mobileStorePackage(id)?.kind === "subscription");
      const user = await userForHash(purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId);
      if (!productId || !user) return NextResponse.json({ ok: true, ignored: "purchase_not_bound" });
      const verified = normalizeGoogleSubscription(user.id, productId, voided.purchaseToken, "restore", purchase);
      verified.eventRef = `rtdn:${messageId}`;
      verified.eventKind = "revoke";
      verified.state = "revoked";
      const result = await applyVerifiedStorePurchase(user.id, verified);
      return NextResponse.json({ ok: true, processing: result.status });
    }
    if (voided?.purchaseToken && voided.orderId && Number(voided.productType) === 2) {
      const previous = await q1<{ user_id: string; product_id: string }>(
        `SELECT user_id::text,product_id FROM mobile_store_events
          WHERE platform='google' AND original_ref=$1 ORDER BY created_at LIMIT 1`,
        [voided.orderId]
      );
      if (!previous) return NextResponse.json({ ok: true, ignored: "purchase_not_bound" });
      const purchase = await fetchGoogleProduct(previous.product_id, voided.purchaseToken);
      const verified = normalizeGoogleProduct(previous.user_id, previous.product_id, voided.purchaseToken, "restore", purchase);
      verified.eventRef = `rtdn:${messageId}`;
      verified.eventKind = "refund";
      verified.state = "revoked";
      const result = await applyVerifiedStorePurchase(previous.user_id, verified);
      return NextResponse.json({ ok: true, processing: result.status });
    }
    return NextResponse.json({ ok: true, ignored: "unsupported_notification" });
  } catch {
    // Pub/Sub retries non-2xx. Never acknowledge a lifecycle event that was not re-verified.
    return NextResponse.json({ ok: false, error: "google_notification_processing_failed" }, { status: 503 });
  }
}
