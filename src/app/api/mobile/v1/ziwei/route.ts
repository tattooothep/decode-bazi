// GET /api/mobile/v1/ziwei — ผัง紫微斗數เต็ม 12 宮สำหรับแอพ (21 ก.ค. 2569 · ⑪ ใน 15 งาน)
// engine เดิม src/lib/astro/ziwei (ใช้ใน fusion5 อยู่แล้ว) — route นี้แค่สะพานอ่านโปรไฟล์→คำนวณ→ส่ง JSON
// AI ไม่เกี่ยว: ผังล้วนจาก engine deterministic · ห้ามปั้นดาวฝั่งแอพ
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ziweiChart, type Gender } from "@/lib/astro/ziwei/engine";

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
  const limited = await rateLimit(`mobile-ziwei:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const url = new URL(req.url);
  const profileId = cleanId(url.searchParams.get("profileId"));
  if (!profileId) return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });

  // สัญญาเดียวกับ fusion5: เวลาเกิดใน DB = เวลากำแพงกรุงเทพ → UTC ด้วย +07:00 · gender charAt(0)==="f"
  const row = await q1<{
    id: string; name: string | null; nickname: string | null; birth_datetime: string | null;
    birth_lat: string | null; birth_lng: string | null; gender: string | null; birth_time_known: boolean | null;
  }>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lat, birth_lng, gender, birth_time_known
       FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [profileId, session.orgId]
  );
  if (!row || !row.birth_datetime) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }
  const dtUTC = new Date(`${row.birth_datetime}+07:00`);
  if (isNaN(dtUTC.getTime())) {
    return NextResponse.json({ ok: false, error: "bad birth datetime" }, { status: 422 });
  }
  const gender: Gender = String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M";
  const chart = ziweiChart(
    dtUTC,
    Number(row.birth_lat || 13.7563),
    Number(row.birth_lng || 100.5018),
    gender,
    row.birth_time_known !== false,
    { refDate: new Date() }
  );
  return NextResponse.json(
    {
      ok: true,
      profile: { id: row.id, name: row.nickname || row.name || "" },
      chart,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
