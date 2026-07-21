import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getProductAccess, productAccessToCaps } from "@/lib/product-entitlement";
import { listMobileStoreProducts } from "@/lib/mobile-store-products";
import { storeAccountHash } from "@/lib/mobile-store-verifier";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const access = await getProductAccess(session.userId);
  if (!access) return NextResponse.json({ ok: false, error: "account_not_available" }, { status: 404 });
  return NextResponse.json(
    {
      ok: true,
      products: listMobileStoreProducts(),
      current: {
        plan: access.plan,
        tier: access.tier,
        sub_expires_at: access.sub_expires_at,
        hour_balance: access.hour_balance,
        caps: productAccessToCaps(access),
      },
      account_binding: {
        apple_app_account_token: session.userId,
        google_obfuscated_account_id: storeAccountHash(session.userId),
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
