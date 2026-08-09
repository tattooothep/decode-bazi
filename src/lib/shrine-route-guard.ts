import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * ด่านหน้าเส้นทางพิธีศาลเจ้า — ลอกแบบเดิมจากเส้นทางโยนจอกที่ใช้อยู่แล้ว
 * กันสามชั้น: ตามหมายเลขเครื่อง · ตามบัตรผ่าน · ตามผู้ใช้
 */

export const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const RATE_WINDOW_MS = 60_000;

export function shrineJson(body: unknown, status = 200) {
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

export interface ShrineGuardLimits {
  /** ชื่อกลุ่มโควตา ใช้แยกเส้นทางออกจากกัน */
  scope: string;
  perIp: number;
  perBearer: number;
  perUser: number;
}

export type ShrineGuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function guardShrineRequest(
  req: Request,
  limits: ShrineGuardLimits,
): Promise<ShrineGuardResult> {
  const ip = clientIp(req);
  const ipLimited = await rateLimit(
    `mobile-shrine-${limits.scope}-ip:${ip}`,
    limits.perIp,
    RATE_WINDOW_MS,
  );
  if (!ipLimited.ok) {
    return { ok: false, response: rateLimited(ipLimited.retryAfterMs) };
  }
  const bearer = mobileBearerToken(req);
  if (bearer) {
    const fingerprint = createHash("sha256").update(bearer).digest("hex");
    const bearerLimited = await rateLimit(
      `mobile-shrine-${limits.scope}-bearer:${fingerprint}`,
      limits.perBearer,
      RATE_WINDOW_MS,
    );
    if (!bearerLimited.ok) {
      return { ok: false, response: rateLimited(bearerLimited.retryAfterMs) };
    }
  }
  const session = await getMobileSession(req);
  if (!session) {
    return {
      ok: false,
      response: shrineJson({ ok: false, error: "not_logged_in" }, 401),
    };
  }
  const userLimited = await rateLimit(
    `mobile-shrine-${limits.scope}-user:${session.userId}`,
    limits.perUser,
    RATE_WINDOW_MS,
  );
  if (!userLimited.ok) {
    return { ok: false, response: rateLimited(userLimited.retryAfterMs) };
  }
  return { ok: true, userId: session.userId };
}

export async function readJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
