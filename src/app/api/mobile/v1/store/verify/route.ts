import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { applyVerifiedStorePurchase } from "@/lib/mobile-store-ledger";
import { mobileStorePackage } from "@/lib/mobile-store-products";
import { verifyMobileStorePurchase, type StoreVerifyInput } from "@/lib/mobile-store-verifier";
import { getProductAccess } from "@/lib/product-entitlement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusForError(message: string): number {
  if (message.includes("not_configured") || message.includes("credentials") || message.includes("_http_") || message.includes("_token_failed") || message.includes("apple_app_id_missing")) return 503;
  if (message.includes("binding_mismatch")) return 403;
  if (message.includes("bound_to_other_account")) return 409;
  if (message.includes("unknown_store_product") || message.includes("invalid") || message.includes("mismatch") || message.includes("missing") || message.includes("unsupported")) return 400;
  return 422;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const rl = await rateLimit(`mobile-store-verify:${session.userId}:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  const body = await req.json().catch(() => ({}));
  const platform = body.platform === "apple" ? "apple" : body.platform === "google" ? "google" : null;
  const productId = String(body.product_id || "").trim();
  if (!platform || !mobileStorePackage(productId)) {
    return NextResponse.json({ ok: false, error: "invalid_store_product" }, { status: 400 });
  }
  const input: StoreVerifyInput = {
    platform,
    productId,
    operation: body.operation === "restore" ? "restore" : "purchase",
    transactionId: body.transaction_id == null ? null : String(body.transaction_id),
    purchaseToken: body.purchase_token == null ? null : String(body.purchase_token),
  };
  try {
    const verified = await verifyMobileStorePurchase(session.userId, input);
    const result = await applyVerifiedStorePurchase(session.userId, verified);
    const access = await getProductAccess(session.userId);
    const pkg = mobileStorePackage(verified.productId);
    return NextResponse.json(
      {
        ok: true,
        verified: true,
        processing: result.status,
        product_id: verified.productId,
        package_code: pkg?.code || null,
        purchase_state: verified.state,
        plan: access?.plan || result.plan,
        tier: access?.tier || result.tier,
        sub_expires_at: access?.sub_expires_at ?? result.sub_expires_at,
        hour_balance: access?.hour_balance ?? result.hour_balance,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "store_verification_failed";
    const status = statusForError(message);
    return NextResponse.json(
      { ok: false, verified: false, error: status >= 500 ? "store_verification_unavailable" : message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
