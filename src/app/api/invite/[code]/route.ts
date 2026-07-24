/**
 * /api/invite/[code] · เส้นสาธารณะสำหรับหน้ารับเชิญ
 * GET  → ตรวจโค้ด (คืนเฉพาะชื่อเล่นที่คนเชิญตั้งเอง · ห้ามคืนชื่อ/อีเมลจริงของบัญชี)
 * POST → เพื่อนกรอกวันเกิด "ของตัวเอง" → ได้ดวงฟรี + คนเชิญได้ยาม (เฉพาะตอนนี้เท่านั้น)
 *
 * สาธารณะได้ แต่ rate limit ทั้งสองเมท็อด (โค้ดเดาไม่ได้อยู่แล้ว · ยังกันไล่ยิงอีกชั้น)
 */
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { acceptInvite, getInvitePublicView } from "@/lib/invite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function tooMany(retryAfterMs: number) {
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const ip = clientIp(req);
  // 30 ครั้ง/10 นาที ต่อ IP — พอสำหรับคนเปิดลิงก์จริง แต่ไม่พอสำหรับไล่เดาโค้ด
  const rl = await rateLimit(`invite-lookup:${ip}`, 30, 600_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const session = await getMobileSession(req).catch(() => null);
  const view = await getInvitePublicView(code, session?.userId ?? null);
  return NextResponse.json(view, { status: view.ok ? 200 : 404, headers: NO_STORE });
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const ip = clientIp(req);
  // ยืนยันวันเกิดได้ 10 ครั้ง/ชม. ต่อ IP (คนจริงทำครั้งเดียว)
  const rl = await rateLimit(`invite-accept:${ip}`, 10, 3_600_000);
  if (!rl.ok) return tooMany(rl.retryAfterMs);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const session = await getMobileSession(req).catch(() => null);

  const result = await acceptInvite({
    code,
    birth: {
      name: body.name,
      birth_date: body.birth_date,
      birth_time: body.birth_time,
      birth_tz_offset: body.birth_tz_offset,
      gender: body.gender,
      place: body.place,
      longitude: body.longitude,
      consent: body.consent,
    },
    request: req,
    deviceId: body.deviceId,
    viewerUserId: session?.userId ?? null,
  });

  if (!result.ok) {
    const status = result.error === "invite_not_found" ? 404 : 400;
    return NextResponse.json(result, { status, headers: NO_STORE });
  }
  // ไม่คืน fraud flags ออกสาธารณะ (บอกวิธีหลบให้คนปั่น)
  return NextResponse.json(
    {
      ok: true,
      code: result.code,
      chart: result.chart,
      friend_hours_pending: result.friend_hours_pending,
    },
    { headers: NO_STORE }
  );
}
