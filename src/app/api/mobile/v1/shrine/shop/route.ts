import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  getMobileSession,
  mobileBearerToken,
  validateMobileBearerToken,
} from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getShrineOfferingShop,
  parseShrinePurchaseInput,
  purchaseShrineOffering,
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

export async function GET(req: Request) {
  const ip = clientIp(req);
  const ipLimited = await rateLimit(
    `mobile-shrine-shop-list-ip:${ip}`,
    120,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) return rateLimited(ipLimited.retryAfterMs);
  const bearer = mobileBearerToken(req);
  if (bearer) {
    const bearerFingerprint = createHash("sha256").update(bearer).digest("hex");
    const bearerLimited = await rateLimit(
      `mobile-shrine-shop-list-bearer:${bearerFingerprint}`,
      60,
      RATE_WINDOW_MS,
    );
    if (!bearerLimited.ok) return rateLimited(bearerLimited.retryAfterMs);
  }
  const session = await getMobileSession(req);
  if (!session) return json({ ok: false, error: "not_logged_in" }, 401);
  const limited = await rateLimit(
    `mobile-shrine-shop-list-user:${session.userId}`,
    60,
    RATE_WINDOW_MS,
  );
  if (!limited.ok) return rateLimited(limited.retryAfterMs);
  try {
    const shop = await getShrineOfferingShop(session.userId);
    return shop
      ? json(shop)
      : json({ ok: false, error: "account_not_available" }, 404);
  } catch {
    return json({ ok: false, error: "shrine_shop_unavailable" }, 503);
  }
}

export async function POST(req: Request) {
  const bearer = mobileBearerToken(req);
  if (!bearer) return json({ ok: false, error: "bearer_required" }, 401);
  const mediaType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return json({ ok: false, error: "application_json_required" }, 415);
  }
  const ip = clientIp(req);
  const ipLimited = await rateLimit(
    `mobile-shrine-shop-buy-ip:${ip}`,
    60,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) return rateLimited(ipLimited.retryAfterMs);
  const bearerFingerprint = createHash("sha256").update(bearer).digest("hex");
  const bearerLimited = await rateLimit(
    `mobile-shrine-shop-buy-bearer:${bearerFingerprint}`,
    30,
    RATE_WINDOW_MS,
  );
  if (!bearerLimited.ok) return rateLimited(bearerLimited.retryAfterMs);
  const session = await validateMobileBearerToken(bearer);
  if (!session) return json({ ok: false, error: "not_logged_in" }, 401);
  const limited = await rateLimit(
    `mobile-shrine-shop-buy-user:${session.userId}`,
    20,
    RATE_WINDOW_MS,
  );
  if (!limited.ok) return rateLimited(limited.retryAfterMs);

  let input;
  try {
    input = parseShrinePurchaseInput(await req.json());
  } catch {
    return json({ ok: false, error: "invalid_shrine_purchase" }, 400);
  }
  try {
    const result = await purchaseShrineOffering(session.userId, input);
    return result.ok ? json(result) : json(result, result.status);
  } catch {
    return json({ ok: false, error: "shrine_shop_unavailable" }, 503);
  }
}
