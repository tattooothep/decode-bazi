import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  mobileBearerToken,
  validateMobileBearerToken,
} from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  cancelShrineOfferingPurchase,
  parseShrineCancelInput,
} from "@/lib/shrine-offering-shop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const RATE_WINDOW_MS = 60_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function rateLimited(retryAfterMs: number) {
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: {
        ...NO_STORE,
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}

/**
 * ยกเลิกการซื้อของบูชา + คืนยาม (ภายในหน้าต่างเวลาสั้น)
 * เส้นทางนี้แตะยอดยามจริง จึงคุมเข้มเท่าเส้นทางซื้อ:
 * บังคับ bearer เท่านั้น (คุกกี้เบราว์เซอร์สั่งไม่ได้) · บังคับ application/json กัน CSRF
 * · จำกัดอัตราตาม IP → ลายนิ้วมือ bearer → ผู้ใช้ ก่อนแตะฐานข้อมูล
 */
export async function POST(req: Request) {
  const bearer = mobileBearerToken(req);
  if (!bearer) return json({ ok: false, error: "bearer_required" }, 401);
  const mediaType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ ok: false, error: "application_json_required" }, 415);
  }
  const ip = clientIp(req);
  const ipLimited = await rateLimit(
    `mobile-shrine-shop-cancel-ip:${ip}`,
    60,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) return rateLimited(ipLimited.retryAfterMs);
  const bearerFingerprint = createHash("sha256").update(bearer).digest("hex");
  const bearerLimited = await rateLimit(
    `mobile-shrine-shop-cancel-bearer:${bearerFingerprint}`,
    30,
    RATE_WINDOW_MS,
  );
  if (!bearerLimited.ok) return rateLimited(bearerLimited.retryAfterMs);
  const session = await validateMobileBearerToken(bearer);
  if (!session) return json({ ok: false, error: "not_logged_in" }, 401);
  const limited = await rateLimit(
    `mobile-shrine-shop-cancel-user:${session.userId}`,
    20,
    RATE_WINDOW_MS,
  );
  if (!limited.ok) return rateLimited(limited.retryAfterMs);

  let input;
  try {
    input = parseShrineCancelInput(await req.json());
  } catch {
    return json({ ok: false, error: "invalid_shrine_cancel" }, 400);
  }
  try {
    const result = await cancelShrineOfferingPurchase(session.userId, input);
    return result.ok ? json(result) : json(result, result.status);
  } catch {
    return json({ ok: false, error: "shrine_shop_unavailable" }, 503);
  }
}
