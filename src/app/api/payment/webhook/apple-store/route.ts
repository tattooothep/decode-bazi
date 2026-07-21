import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { applyVerifiedStorePurchase } from "@/lib/mobile-store-ledger";
import { normalizeAppleTransaction, verifyAppleServerNotification } from "@/lib/mobile-store-verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const signedPayload = String(body.signedPayload || "");
  if (!signedPayload || signedPayload.length > 1_000_000) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  try {
    const decoded = await verifyAppleServerNotification(signedPayload);
    const notification = decoded.notification;
    if (!decoded.transaction) {
      return NextResponse.json({ ok: true, ignored: notification.notificationType || "no_transaction" });
    }
    const userId = String(decoded.transaction.appAccountToken || "").toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) {
      return NextResponse.json({ ok: false, error: "account_binding_missing" }, { status: 422 });
    }
    const user = await q1<{ id: string }>(`SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL`, [userId]);
    if (!user) return NextResponse.json({ ok: true, ignored: "account_not_available" });

    const type = String(notification.notificationType || "");
    const subtype = String(notification.subtype || "");
    const operation = type === "DID_RENEW" ? "restore" : "purchase";
    const verified = normalizeAppleTransaction(userId, operation, decoded.transaction);
    verified.eventRef = `asn:${notification.notificationUUID || `${verified.eventRef}:${notification.signedDate || "unknown"}`}`;
    verified.eventKind = type === "DID_RENEW" ? "renewal"
      : type === "REFUND" ? "refund"
      : type === "REVOKE" ? "revoke"
      : type === "SUBSCRIBED" ? "purchase"
      : "status_sync";
    verified.autoRenewing = Number(decoded.renewal?.autoRenewStatus) === 1;

    const status = Number(notification.data?.status || 0);
    if (type === "REFUND" || type === "REVOKE" || status === 5) {
      verified.state = "revoked";
    } else if (type === "EXPIRED" || type === "GRACE_PERIOD_EXPIRED" || status === 2) {
      verified.state = "expired";
    } else if (status === 4 || subtype === "GRACE_PERIOD") {
      verified.state = "grace";
      if (decoded.renewal?.gracePeriodExpiresDate) verified.expiresAt = new Date(decoded.renewal.gracePeriodExpiresDate).toISOString();
    } else if (status === 3 || type === "DID_FAIL_TO_RENEW") {
      verified.state = "pending";
    } else if (type === "DID_CHANGE_RENEWAL_STATUS" && Number(decoded.renewal?.autoRenewStatus) === 0) {
      verified.state = "canceled";
    }
    verified.summary = {
      ...(verified.summary || {}),
      notification_type: type,
      notification_subtype: subtype || null,
      notification_uuid: notification.notificationUUID || null,
    };
    const result = await applyVerifiedStorePurchase(userId, verified);
    return NextResponse.json({ ok: true, processing: result.status });
  } catch {
    // Apple retries non-2xx. Never acknowledge a notification that was not verified.
    return NextResponse.json({ ok: false, error: "apple_notification_verification_failed" }, { status: 401 });
  }
}
