/**
 * GET/PATCH /api/push/prefs · Web Push Phase C (r380)
 * การตั้งค่าแจ้งเตือนรายประเภท + quiet hours (เวลาไทย 0-23)
 * GET แถม subscribed (มี subscription อย่างน้อย 1 เครื่องไหม) ให้ UI โชว์สถานะจริง
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

type PrefRow = {
  day_sniper: boolean; daily_omens: boolean; fusion_done: boolean; promo: boolean;
  quiet_start: number | null; quiet_end: number | null;
};

const DEFAULTS: PrefRow = { day_sniper: false, daily_omens: false, fusion_done: true, promo: false, quiet_start: null, quiet_end: null };
const BOOL_KEYS = ["day_sniper", "daily_omens", "fusion_done", "promo"] as const;

function cleanHour(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = await rateLimit("push-prefs:" + clientIp(req), 30, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const row = await q1<PrefRow>(
    `SELECT day_sniper, daily_omens, fusion_done, promo, quiet_start, quiet_end
       FROM notification_prefs WHERE user_id=$1`,
    [session.userId]
  );
  const nsub = await q1<{ n: number }>(
    `SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`,
    [session.userId]
  );
  return NextResponse.json(
    { ...(row || DEFAULTS), subscribed: (nsub?.n || 0) > 0 },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const r = await rateLimit("push-prefs-w:" + clientIp(req), 20, 60_000);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // เริ่มจากค่าปัจจุบัน (หรือ default) แล้ว merge เฉพาะ field ที่ส่งมา
  const cur = (await q1<PrefRow>(
    `SELECT day_sniper, daily_omens, fusion_done, promo, quiet_start, quiet_end
       FROM notification_prefs WHERE user_id=$1`,
    [session.userId]
  )) || { ...DEFAULTS };

  for (const k of BOOL_KEYS) {
    if (typeof body[k] === "boolean") cur[k] = body[k] as boolean;
  }
  if ("quiet_start" in body) cur.quiet_start = cleanHour(body.quiet_start);
  if ("quiet_end" in body) cur.quiet_end = cleanHour(body.quiet_end);
  // ต้องมาเป็นคู่ (มีอันเดียว = ปิด quiet hours กันช่วงพิกล)
  if (cur.quiet_start == null || cur.quiet_end == null) { cur.quiet_start = null; cur.quiet_end = null; }

  await q(
    `INSERT INTO notification_prefs (user_id, day_sniper, daily_omens, fusion_done, promo, quiet_start, quiet_end, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (user_id) DO UPDATE
       SET day_sniper=EXCLUDED.day_sniper, daily_omens=EXCLUDED.daily_omens,
           fusion_done=EXCLUDED.fusion_done, promo=EXCLUDED.promo,
           quiet_start=EXCLUDED.quiet_start, quiet_end=EXCLUDED.quiet_end, updated_at=now()`,
    [session.userId, cur.day_sniper, cur.daily_omens, cur.fusion_done, cur.promo, cur.quiet_start, cur.quiet_end]
  );
  return NextResponse.json({ ok: true, ...cur });
}
