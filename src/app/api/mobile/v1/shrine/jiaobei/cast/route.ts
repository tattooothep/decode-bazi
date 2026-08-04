import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { castJiaobei, parseJiaobeiCastInput } from "@/lib/shrine-jiaobei";

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

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLimited = await rateLimit(
    `mobile-shrine-jiaobei-ip:${ip}`,
    60,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) return rateLimited(ipLimited.retryAfterMs);
  const bearer = mobileBearerToken(req);
  if (bearer) {
    const fingerprint = createHash("sha256").update(bearer).digest("hex");
    const bearerLimited = await rateLimit(
      `mobile-shrine-jiaobei-bearer:${fingerprint}`,
      30,
      RATE_WINDOW_MS,
    );
    if (!bearerLimited.ok) return rateLimited(bearerLimited.retryAfterMs);
  }
  const session = await getMobileSession(req);
  if (!session) return json({ ok: false, error: "not_logged_in" }, 401);
  const userLimited = await rateLimit(
    `mobile-shrine-jiaobei-user:${session.userId}`,
    20,
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
    input = parseJiaobeiCastInput(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "invalid_body",
      },
      400,
    );
  }
  const result = await castJiaobei(session.userId, input);
  if (!result.ok) {
    return json(result, "status" in result ? result.status : 400);
  }
  return json(result);
}
