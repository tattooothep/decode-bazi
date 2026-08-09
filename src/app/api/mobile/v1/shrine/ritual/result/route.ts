import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  parseHourKeyRitualInput,
} from "@/lib/shrine-hourkey-ritual-result";
import {
  HourKeyRitualDailyLimitExceeded,
  HourKeyRitualIdempotencyConflict,
  recordHourKeyRitualResult,
} from "@/lib/shrine-hourkey-ritual-ledger";

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

/** คืนผลพิธีภายในวัด HourKey จาก backend สำหรับ Unity และแอพมือถือ */
export async function POST(req: Request) {
  const ipLimited = await rateLimit(
    `mobile-shrine-ritual-result-ip:${clientIp(req)}`,
    180,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) return rateLimited(ipLimited.retryAfterMs);

  const bearer = mobileBearerToken(req);
  if (bearer) {
    const fingerprint = createHash("sha256").update(bearer).digest("hex");
    const bearerLimited = await rateLimit(
      `mobile-shrine-ritual-result-bearer:${fingerprint}`,
      90,
      RATE_WINDOW_MS,
    );
    if (!bearerLimited.ok) return rateLimited(bearerLimited.retryAfterMs);
  }

  const session = await getMobileSession(req);
  if (!session) return json({ ok: false, error: "not_logged_in" }, 401);
  const userLimited = await rateLimit(
    `mobile-shrine-ritual-result-user:${session.userId}`,
    60,
    RATE_WINDOW_MS,
  );
  if (!userLimited.ok) return rateLimited(userLimited.retryAfterMs);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  let input;
  try {
    input = parseHourKeyRitualInput(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "invalid_body",
      },
      400,
    );
  }

  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32) {
    return json(
      { ok: false, error: "ritual_result_unavailable" },
      503,
    );
  }
  try {
    return json(await recordHourKeyRitualResult(
      session.userId,
      input,
      secret,
    ));
  } catch (error) {
    if (error instanceof HourKeyRitualDailyLimitExceeded) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Date.parse(error.resetAt) - Date.now()) / 1000),
      );
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          limit: error.limit,
          resetAt: error.resetAt,
        },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }
    if (error instanceof HourKeyRitualIdempotencyConflict) {
      return json({ ok: false, error: error.message }, 409);
    }
    return json({ ok: false, error: "ritual_result_unavailable" }, 503);
  }
}
