/**
 * /api/mobile/v1/invite · วงจรเชิญเพื่อนฝั่งแอพ (bearer token)
 * GET  → สรุป: เชิญไปกี่คน · รับแล้วกี่คน · ได้ยามไปเท่าไร · สร้างได้อีกกี่ใบวันนี้
 * POST {action:"create"|"revoke"|"claim", ...}
 *
 * ตรรกะทั้งหมดอยู่ที่ src/lib/invite.ts (เส้นเว็บ /api/invite ใช้ตัวเดียวกัน — ไม่แตกสองสูตร)
 */
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { claimInviteForUser, createInvite, getInviteSummary, revokeInvite } from "@/lib/invite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const rl = await rateLimit(`mobile-invite-get:${session.userId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  return NextResponse.json(await getInviteSummary(session.userId), { headers: NO_STORE });
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "create");
  const budget = action === "claim" ? 10 : 20;
  const rl = await rateLimit(`mobile-invite-post:${action}:${session.userId}:${clientIp(req)}`, budget, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  if (action === "create") {
    const result = await createInvite({
      userId: session.userId,
      alias: body.alias,
      profileId: body.profileId,
      request: req,
      deviceId: body.deviceId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }
  if (action === "revoke") {
    const result = await revokeInvite(session.userId, body.code);
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }
  if (action === "claim") {
    const result = await claimInviteForUser({ userId: session.userId, code: body.code });
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }
  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400, headers: NO_STORE });
}
