import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  resolveScienceNotificationDetail,
  validScienceNotificationAudience,
  validScienceNotificationUuid,
} from "@/lib/mobile-science-notification-detail-r8";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;
const unavailable = () => NextResponse.json(
  { ok: false, error: "notification_detail_unavailable" },
  { status: 404, headers: PRIVATE_HEADERS },
);

export async function GET(req: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const limited = await rateLimit(`mobile-astronomy-fact-detail:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: PRIVATE_HEADERS });
  const { occurrenceId } = await context.params;
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id") || "";
  const audience = url.searchParams.get("audience") || "";
  if (!validScienceNotificationUuid(session.orgId) || !validScienceNotificationUuid(occurrenceId)
    || !validScienceNotificationUuid(installationId) || !validScienceNotificationAudience(audience)) return unavailable();
  try {
    const detail = await resolveScienceNotificationDetail(pool, {
      userId: session.userId,
      orgId: session.orgId,
      installationId,
      occurrenceId,
      audience,
      category: "astronomy_fact",
    });
    if (!detail) return unavailable();
    // ตีความรายยาม (18 ก.ย.): snapshot ที่ AI แปลไว้ตอนส่ง — อ่านอย่างเดียว ไม่คำนวณใหม่
    // ตาราง/แถวไม่มี = ส่ง null (แอพโชว์เฉพาะตำแหน่งดาวเหมือนเดิม)
    let interpretation: unknown = null;
    try {
      const row = await pool.query<{ locales: unknown }>(
        `SELECT locales FROM mobile_astronomy_interpretations_r8 WHERE occurrence_id=$1::uuid AND user_id=$2::uuid`,
        [occurrenceId, session.userId],
      );
      interpretation = row.rows[0]?.locales ?? null;
    } catch {
      interpretation = null;
    }
    return NextResponse.json({ ok: true, detail, interpretation }, { headers: PRIVATE_HEADERS });
  } catch {
    return unavailable();
  }
}
