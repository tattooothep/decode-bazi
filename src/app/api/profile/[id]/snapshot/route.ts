/**
 * GET /api/profile/[id]/snapshot
 *
 * คืน profile snapshot สำหรับ /chart?as=<id> view-as
 * - auth check: session valid + profile.org_id === session.orgId
 * - ส่งเฉพาะ field ที่ chart.html ต้องใช้ render (ไม่ส่ง notes/sensitive)
 *
 * Phase 19-C+ · 20 พ.ค. 2026 · แก้ bug "กดอ่านดวงคนอื่นจากเครือข่ายไม่ได้"
 * Root cause เดิม: sessionStorage ข้าม tab ไม่ได้ + localStorage xfer TTL 60s หมด
 * Solution: DB-as-truth · chart.html fetch จาก endpoint นี้ก่อน fallback storage
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { id } = await ctx.params;
  /* strip optional 'p_' prefix (yongsennetwork ใช้ p_<uuid>) */
  const cleanId = id.replace(/^p_/, "");
  const row = await q1<{
    id: string;
    name: string;
    nickname: string | null;
    birth_date: string;
    birth_time: string;
    birth_lat: string | null;
    birth_lng: string | null;
    birth_location_name: string | null;
    gender: string | null;
    birth_time_known: boolean;
    day_boundary: string | null;
    relationship_type: string | null;
    bazi_pillars: any;
    day_master: string | null;
  }>(
    `SELECT
       id::text AS id,
       name,
       nickname,
       to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS birth_date,
       to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS birth_time,
       birth_lat, birth_lng, birth_location_name,
       gender, birth_time_known, day_boundary, relationship_type,
       bazi_pillars, day_master
     FROM profiles
     WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [cleanId, s.orgId]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  /* snapshot format · ตรงกับสิ่งที่ chart.html readChartSnapshot ใช้ */
  return NextResponse.json({
    snapshot: {
      id: row.id,
      profileId: row.id,
      name: row.name,
      nickname: row.nickname,
      birthDate: row.birth_date,
      birthTime: row.birth_time,
      birthTimeKnown: row.birth_time_known,
      dayBoundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
      day_boundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
      longitude: row.birth_lng ? parseFloat(row.birth_lng) : 100.5018,
      latitude: row.birth_lat ? parseFloat(row.birth_lat) : 13.7563,
      locationName: row.birth_location_name,
      gender: row.gender,
      relationshipType: row.relationship_type,
      pillars: row.bazi_pillars,
      dayMaster: row.day_master,
    },
  });
}
