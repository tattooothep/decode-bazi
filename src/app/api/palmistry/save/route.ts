/* POST /api/palmistry/save · บันทึกผลอ่านลายมือเป็น "ศาสตร์ที่ 7" (ต้อง login)
 * เก็บเฉพาะผล reading (ผ่านคัมภีร์แล้ว) · ไม่เก็บรูป · ต่อเข้า fusion ภายหลัง
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required", message: "กรุณาเข้าสู่ระบบก่อนบันทึก" }, { status: 401 });

  let body: { lang?: string; reading?: unknown; clarity?: number; engine?: string; profile_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 }); }
  if (!body.reading || typeof body.reading !== "object") return NextResponse.json({ ok: false, error: "no_reading" }, { status: 400 });

  const lang = (String(body.lang || "th").toLowerCase().split("-")[0]) || "th";
  const clarity = Number.isFinite(body.clarity) ? Math.max(0, Math.min(100, Math.round(body.clarity as number))) : null;

  // profile_id (optional): เลือกบันทึกเข้าดวงคนอื่นใน network เรา (ดูลายมือให้คนอื่น) · guard กัน IDOR
  let profileId: string | null = null;
  const rawPid = typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  // ตรวจ uuid format ก่อนยิง DB — กัน 500 ดิบจาก ::uuid cast (invalid input syntax)
  if (rawPid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawPid))
    return NextResponse.json({ ok: false, error: "bad_profile_id", message: "รหัสดวงไม่ถูกต้อง" }, { status: 400 });
  if (rawPid) {
    const own = await q1<{ id: string }>(
      `SELECT id FROM profiles WHERE id = $1::uuid
         AND (created_by_user_id = $2 OR ($3::uuid IS NOT NULL AND org_id = $3::uuid)) AND is_archived = false`,
      [rawPid, sess.userId, sess.orgId ?? null]
    );
    if (!own) return NextResponse.json({ ok: false, error: "profile_forbidden", message: "ไม่มีสิทธิ์บันทึกเข้าดวงนี้" }, { status: 403 });
    profileId = rawPid;
  }

  try {
    const row = await q1<{ id: string }>(
      `INSERT INTO palm_readings (user_id, org_id, lang, reading, clarity, engine, profile_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::uuid) RETURNING id`,
      [sess.userId, sess.orgId ?? null, lang, JSON.stringify(body.reading), clarity, body.engine ?? null, profileId]
    );
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    console.error("[palmistry/save]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

/* GET /api/palmistry/save · ดึงผลลายมือล่าสุดของ user (ให้ fusion ดึงไปหลอมรวม) */
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  try {
    const row = await q1<{ id: string; lang: string; reading: unknown; clarity: number | null; created_at: string }>(
      `SELECT id, lang, reading, clarity, created_at FROM palm_readings
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sess.userId]
    );
    return NextResponse.json({ ok: true, latest: row });
  } catch (e) {
    console.error("[palmistry/save GET]", (e as Error).message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
