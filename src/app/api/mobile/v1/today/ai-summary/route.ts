/**
 * /api/mobile/v1/today/ai-summary — หน้าอ่านฉบับเต็มของแจ้งเตือนดวงเช้า
 * (goal สาย ข · เคาะ 6 ก.ย. 2569 · รูปแบบ 7 ส่วนตาม artifact ที่อนุมัติ)
 *
 * อ่านจาก snapshot ที่งานกลางคืนเก็บไว้เท่านั้น — ไม่คำนวณใหม่ตอนเปิด
 * (เปิดกี่ครั้งก็เห็นข้อความเดียวกับที่แจ้งเตือนอ้างถึง)
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }
  const url = new URL(req.url);
  const date = String(url.searchParams.get("date") || "");
  const profileId = String(url.searchParams.get("profileId") || "");
  if (!DATE_RE.test(date) || !UUID_RE.test(profileId)) {
    return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  }
  // ดวงของบัญชีตัวเองเท่านั้น — แถวถูกสร้างผูก user_id ตอนกลางคืนอยู่แล้ว
  const row = await q1<{
    forecast_date: string; status: string; facts: unknown; summary: unknown;
    model: string; updated_at: string;
  }>(
    `SELECT to_char(forecast_date, 'YYYY-MM-DD') AS forecast_date,
            status, facts, summary, model, updated_at
       FROM mobile_daily_ai_summaries
      WHERE user_id = $1 AND profile_id = $2 AND forecast_date = $3
        AND status = 'ready'`,
    [session.userId, profileId, date],
  );
  if (!row || !row.summary) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, date: row.forecast_date, facts: row.facts, summary: row.summary, model: row.model, updatedAt: row.updated_at },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
