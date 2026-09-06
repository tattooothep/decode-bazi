/**
 * /api/internal/jobs/daily-sky — เข็มดาวจริงรายวันสำหรับสรุปดวงเช้า (goal สาย ข)
 *
 * ห่อ buildDaySniper (fusion5 · deterministic ล้วน) ให้ cron กลางคืนเรียกทีละคน
 * ต่อวัน — engine เดิมคำนวณ ที่นี่แค่ประกอบ birth จากโปรไฟล์แล้วคืนผลย่อ
 * ยืนยันตัวตนด้วย HOURKEY_INTERNAL_JOB_TOKEN แบบเดียวกับ internal jobs อื่น
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { parseTz, wallClockToUtc } from "@/lib/birth-timezone";
import { buildDaySniper } from "@/lib/fusion5/day-sniper";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const DEFAULT_LAT = 13.7563;
const DEFAULT_LNG = 100.5018;

function authorized(req: Request): boolean {
  const expected = process.env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length > 0 && supplied === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const profileId = String(body.profileId || "");
  const date = String(body.date || "");
  if (!UUID_RE.test(profileId) || !DATE_RE.test(date)) {
    return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  }
  const row = await q1<{
    id: string; name: string | null; nickname: string | null;
    birth_datetime: string | null; birth_tz: string | null;
    birth_lat: number | null; birth_lng: number | null;
    birth_time_known: boolean | null; gender: string | null;
  }>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_tz, birth_lat, birth_lng, birth_time_known, gender
       FROM profiles
      WHERE id = $1 AND COALESCE(is_archived, false) = false`,
    [profileId],
  );
  if (!row || !row.birth_datetime) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }
  const tz = parseTz(row.birth_tz) || { label: "Asia/Bangkok", kind: "offset" as const, offsetMin: 420 };
  const dtUTC = wallClockToUtc(row.birth_datetime, tz);
  if (!dtUTC || Number.isNaN(dtUTC.getTime())) {
    return NextResponse.json({ ok: false, error: "bad_birth_datetime" }, { status: 400 });
  }
  const lat = Number.isFinite(Number(row.birth_lat)) && row.birth_lat !== null ? Number(row.birth_lat) : DEFAULT_LAT;
  const lng = Number.isFinite(Number(row.birth_lng)) && row.birth_lng !== null ? Number(row.birth_lng) : DEFAULT_LNG;
  // gender ใน DB เป็น "F"/"M"/"male" legacy — เทียบด้วยอักษรแรกเท่านั้น (บทเรียน r105)
  const gender = String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M";
  const birth = {
    name: row.nickname || row.name || "เจ้าของดวง",
    dtUTC, lat, lng,
    hasTime: row.birth_time_known !== false,
    gender: gender as "F" | "M",
  };
  try {
    const result = buildDaySniper([birth], "ภาพรวมวันนี้", date, date);
    const person = result.perPerson[0] || null;
    const day = person && Array.isArray(person.days) ? person.days.find((d) => String((d as { dateISO?: string }).dateISO || "") === date) || person.days[0] || null : null;
    return NextResponse.json({
      ok: true,
      date,
      topic: result.topicTh || result.topicKey || null,
      skipped: person?.skippedNote || null,
      day: day || null,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "day_sniper_failed",
      detail: error instanceof Error ? error.message.slice(0, 120) : "error",
    }, { status: 500 });
  }
}
