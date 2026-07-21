// GET /api/mobile/v1/tianxing — 七政四餘/天星 ผังดาวจริงสำหรับแอพ (21 ก.ค. 2569 · ⑫ ใน 15 งาน)
// engine เดิม src/lib/tianxing (astronomy-engine · ใช้ในเว็บ /tianxing แล้ว) — deterministic · ไม่หักยาม
// รับ profileId (คิดจากเวลาเกิด) หรือ dtUTC ตรง (ดูฟ้าเวลาอื่น เช่น ตอนนี้/ฤกษ์ที่จะใช้)
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { tianxingReading } from "@/lib/tianxing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-tianxing:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const url = new URL(req.url);
  const profileId = cleanId(url.searchParams.get("profileId"));
  let dt: Date | null = null;
  let lat = 13.7563;
  let lng = 100.5018;
  let profileOut: { id: string; name: string } | null = null;

  if (profileId) {
    const row = await q1<{
      id: string; name: string | null; nickname: string | null; birth_datetime: string | null;
      birth_lat: string | null; birth_lng: string | null;
    }>(
      `SELECT id, name, nickname,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lat, birth_lng
         FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
      [profileId, session.orgId]
    );
    if (!row || !row.birth_datetime) {
      return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
    }
    dt = new Date(`${row.birth_datetime}+07:00`);
    lat = Number(row.birth_lat || 13.7563);
    lng = Number(row.birth_lng || 100.5018);
    profileOut = { id: row.id, name: row.nickname || row.name || "" };
  } else {
    const dtRaw = String(url.searchParams.get("dtUTC") || "");
    dt = dtRaw ? new Date(dtRaw) : new Date();
    const latRaw = Number(url.searchParams.get("lat"));
    const lngRaw = Number(url.searchParams.get("lng"));
    if (Number.isFinite(latRaw) && latRaw >= -89 && latRaw <= 89) lat = latRaw;
    if (Number.isFinite(lngRaw) && lngRaw >= -180 && lngRaw <= 180) lng = lngRaw;
  }
  if (!dt || isNaN(dt.getTime())) {
    return NextResponse.json({ ok: false, error: "bad_dtUTC" }, { status: 400 });
  }
  const reading = tianxingReading(dt, lat, lng);
  return NextResponse.json(
    { ok: true, profile: profileOut, reading },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
