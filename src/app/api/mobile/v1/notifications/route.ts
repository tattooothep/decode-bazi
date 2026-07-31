/**
 * ศูนย์แจ้งเตือนในแอพ (เจ้านายสั่ง 20 ก.ค.) — กระดิ่ง + หน้ารายการ 3 หัวข้อ
 * GET  ?kind=all|yam|auspicious&limit= → รายการแจ้งเตือนย้อนหลัง + จำนวนที่ยังไม่อ่าน + ตั้งค่า
 * POST {action:"read", ids?:[]} → ทำเครื่องหมายอ่านแล้ว (ไม่ส่ง ids = อ่านทั้งหมด)
 *      {action:"prefs", yam?:bool, auspicious?:bool, daily?:bool,
 *                        quietStart?:0-23, quietEnd?:0-23, maxPerDay?:0-10,
 *                        pauseDays?:number, muteToday?:true, resume?:true} → บันทึกตั้งค่า
 *        (quietStart=quietEnd คือไม่ตั้งช่วงห้ามรบกวน · pauseDays=พักกี่วัน · resume=เลิกพัก)
 * ห้ามปั้นข้อมูล: รายการมาจาก mobile_push_log ที่ตัวยิงจริงเขียนไว้เท่านั้น
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["yam", "auspicious", "daily", "network"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PrefRow = {
  yam_enabled: boolean;
  auspicious_enabled: boolean;
  daily_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  max_per_day: number;
  paused_until: string | Date | null;
};

/** จำนวนเต็มในช่วงที่ยอมรับ — นอกช่วงถือว่าไม่ได้ส่งมา ไม่ใช่บีบให้เข้าช่วง */
function intInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}
type LogRow = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  payload: unknown;
  sent_at: string;
  read_at: string | null;
};

async function authorize(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return { ok: false as const, error: "not_authorized", status: 401 };
  const rl = await rateLimit(`mobile-notif:${session.userId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return { ok: false as const, error: "rate_limited", status: 429 };
  return { ok: true as const, session };
}

async function readPrefs(userId: string): Promise<PrefRow> {
  const row = await q1<PrefRow>(
    `SELECT yam_enabled, auspicious_enabled, daily_enabled,
            quiet_start, quiet_end, max_per_day, paused_until
       FROM mobile_notification_prefs WHERE user_id=$1`,
    [userId],
  );
  // 🔴 ยังไม่เคยตั้งค่า = ยังไม่ยินยอม (ค่าเริ่มต้นเป็นปิด ตรงกับตัวคุมกลาง push-guard)
  // ของเดิมคืน true ทั้งสามหมวด ทำให้หน้าแอพโชว์สวิตช์เปิดทั้งที่เซิร์ฟเวอร์ไม่ส่งจริง
  return row || {
    yam_enabled: false,
    auspicious_enabled: false,
    daily_enabled: false,
    quiet_start: 22,
    quiet_end: 7,
    max_per_day: 2,
    paused_until: null,
  };
}

/**
 * สิ้นวันตามปฏิทินท้องถิ่นของผู้ใช้ (เที่ยงคืนถัดไป)
 *
 * ใช้กับปุ่ม "วันนี้พอ" บนใบแจ้งเตือน — เงียบถึงสิ้นวันของ**เขา**
 * 🔴 ห้ามบวก 24 ชั่วโมงตรงๆ เพราะจะกินวันพรุ่งนี้ไปครึ่งวัน
 * และห้ามใช้วันของเครื่องแม่ข่าย คนอยู่ต่างประเทศจะเงียบผิดวันทั้งใบ
 */
function endOfLocalDay(timezone: string | null, at = new Date()): Date {
  const tz = String(timezone || "").trim() || "Asia/Bangkok";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(at);
    const m = /^(\d{2}):(\d{2})$/.exec(parts.trim());
    if (!m) return new Date(at.getTime() + 6 * 3_600_000);
    const minutesLeft = 24 * 60 - (Number(m[1]) * 60 + Number(m[2]));
    return new Date(at.getTime() + minutesLeft * 60_000);
  } catch {
    return new Date(at.getTime() + 6 * 3_600_000);
  }
}

/** รูปแบบเดียวที่ส่งให้แอพ — ใช้ทั้งตอนอ่านและตอนบันทึก จะได้ไม่มีวันไม่ตรงกัน */
function prefsPayload(row: PrefRow) {
  const until = row.paused_until;
  const untilIso = until === null || until === undefined
    ? null
    : (until instanceof Date ? until : new Date(String(until))).toISOString();
  return {
    yam: row.yam_enabled,
    auspicious: row.auspicious_enabled,
    daily: row.daily_enabled,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    maxPerDay: row.max_per_day,
    pausedUntil: untilIso,
  };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const url = new URL(req.url);
  const kindParam = (url.searchParams.get("kind") || "all").trim();
  const kind = kindParam === "all" ? null : KINDS.has(kindParam) ? kindParam : null;
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;

  const rows = await q<LogRow>(
    `SELECT id, kind, title, body, payload, sent_at, read_at
       FROM mobile_push_log
      WHERE user_id=$1 AND ($2::text IS NULL OR kind=$2)
      ORDER BY sent_at DESC
      LIMIT $3`,
    [session.userId, kind, limit],
  );
  const unread = await q1<{ n: number }>(
    `SELECT count(*)::int AS n FROM mobile_push_log WHERE user_id=$1 AND read_at IS NULL`,
    [session.userId],
  );
  const prefs = await readPrefs(session.userId);
  return NextResponse.json(
    {
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title || "",
        body: r.body || "",
        payload: r.payload ?? null,
        sent_at: r.sent_at,
        read: r.read_at !== null,
      })),
      unread: unread?.n || 0,
      prefs: prefsPayload(prefs),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { session } = auth;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "read") {
    const raw = Array.isArray(body?.ids) ? (body.ids as unknown[]) : null;
    if (raw) {
      const ids = raw.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)).slice(0, 200);
      if (!ids.length) return NextResponse.json({ ok: false, error: "invalid_ids" }, { status: 400 });
      await q(`UPDATE mobile_push_log SET read_at=now() WHERE user_id=$1 AND id = ANY($2::uuid[]) AND read_at IS NULL`, [
        session.userId,
        ids,
      ]);
    } else {
      await q(`UPDATE mobile_push_log SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [session.userId]);
    }
    const unread = await q1<{ n: number }>(
      `SELECT count(*)::int AS n FROM mobile_push_log WHERE user_id=$1 AND read_at IS NULL`,
      [session.userId],
    );
    return NextResponse.json({ ok: true, unread: unread?.n || 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "prefs") {
    const current = await readPrefs(session.userId);
    const yam = typeof body?.yam === "boolean" ? body.yam : current.yam_enabled;
    const auspicious = typeof body?.auspicious === "boolean" ? body.auspicious : current.auspicious_enabled;
    const daily = typeof body?.daily === "boolean" ? body.daily : current.daily_enabled;
    const quietStart = intInRange(body?.quietStart, 0, 23) ?? current.quiet_start;
    const quietEnd = intInRange(body?.quietEnd, 0, 23) ?? current.quiet_end;
    const maxPerDay = intInRange(body?.maxPerDay, 0, 10) ?? current.max_per_day;

    // พัก/เลิกพัก — เลิกพักต้องชนะเสมอ ถ้าส่งมาพร้อมกันคนกดคือคนที่อยากกลับมารับ
    let pausedUntil: Date | null =
      current.paused_until === null || current.paused_until === undefined
        ? null
        : new Date(String(current.paused_until));
    if (body?.resume === true) {
      pausedUntil = null;
    } else if (body?.muteToday === true) {
      // ปุ่ม "วันนี้พอ" บนใบแจ้งเตือน — เงียบถึงเที่ยงคืนของเขา แล้วกลับมาเอง
      const tzRow = await q1<{ tz: string | null }>(
        `SELECT COALESCE(np.timezone, u.timezone) AS tz
           FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id = u.id
          WHERE u.id = $1`,
        [session.userId],
      );
      pausedUntil = endOfLocalDay(tzRow?.tz ?? null);
    } else {
      const days = intInRange(body?.pauseDays, 1, 90);
      if (days !== null) pausedUntil = new Date(Date.now() + days * 86_400_000);
    }

    const saved = await q1<PrefRow>(
      `INSERT INTO mobile_notification_prefs
         (user_id, yam_enabled, auspicious_enabled, daily_enabled,
          quiet_start, quiet_end, max_per_day, paused_until, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (user_id) DO UPDATE SET
         yam_enabled=$2, auspicious_enabled=$3, daily_enabled=$4,
         quiet_start=$5, quiet_end=$6, max_per_day=$7, paused_until=$8, updated_at=now()
       RETURNING yam_enabled, auspicious_enabled, daily_enabled,
                 quiet_start, quiet_end, max_per_day, paused_until`,
      [session.userId, yam, auspicious, daily, quietStart, quietEnd, maxPerDay, pausedUntil],
    );
    // 🔴 ตอบด้วยค่าที่ฐานข้อมูลเก็บจริง ไม่ใช่ค่าที่เราตั้งใจจะเก็บ
    // ถ้าข้อบังคับของตารางปัดค่าใด แอพต้องเห็นของจริง ไม่ใช่ของที่เราคิด
    return NextResponse.json(
      { ok: true, prefs: prefsPayload(saved || current) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
