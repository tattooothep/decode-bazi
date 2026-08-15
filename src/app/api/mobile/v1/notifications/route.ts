/**
 * ศูนย์แจ้งเตือนในแอพ — ประวัติจริงและการตั้งค่า 8 หมวด
 * GET  ?kind=all|<category>&limit= → รายการที่ผู้ให้บริการรับแล้ว + จำนวนที่ยังไม่อ่าน + ตั้งค่า
 * POST {action:"read", ids?:[]} → ทำเครื่องหมายอ่านแล้ว (ไม่ส่ง ids = อ่านทั้งหมด)
 *      {action:"prefs", savedDate?|yam?|daily?|qimen?|shrine?|goal?:bool,
 *                        yamMinQuality?, yamLeadMinutes?, dailySlot?,
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

const KINDS = new Set([
  "security", "saved_date", "daily", "yam", "qimen", "shrine", "goal", "service",
  // legacy rows remain readable after the category split
  "auspicious", "network",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PrefRow = {
  security_enabled: boolean;
  saved_date_enabled: boolean;
  yam_enabled: boolean;
  auspicious_enabled: boolean;
  daily_enabled: boolean;
  qimen_enabled: boolean;
  shrine_enabled: boolean;
  goal_enabled: boolean;
  service_enabled: boolean;
  yam_min_quality: "best" | "good";
  yam_lead_minutes: number;
  daily_slot: "morning" | "evening" | "both";
  quiet_start: number;
  quiet_end: number;
  max_per_day: number;
  paused_until: string | Date | null;
  privacy_preview: boolean;
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
    `SELECT security_enabled, saved_date_enabled, yam_enabled, auspicious_enabled, daily_enabled,
            qimen_enabled, shrine_enabled, goal_enabled, service_enabled,
            yam_min_quality, yam_lead_minutes, daily_slot,
            quiet_start, quiet_end, max_per_day, paused_until, privacy_preview
       FROM mobile_notification_prefs WHERE user_id=$1`,
    [userId],
  );
  // 🔴 ยังไม่เคยตั้งค่า = ยังไม่ยินยอม (ค่าเริ่มต้นเป็นปิด ตรงกับตัวคุมกลาง push-guard)
  // ของเดิมคืน true ทั้งสามหมวด ทำให้หน้าแอพโชว์สวิตช์เปิดทั้งที่เซิร์ฟเวอร์ไม่ส่งจริง
  return row || {
    security_enabled: true,
    saved_date_enabled: false,
    yam_enabled: false,
    auspicious_enabled: false,
    daily_enabled: false,
    qimen_enabled: false,
    shrine_enabled: false,
    goal_enabled: false,
    service_enabled: true,
    yam_min_quality: "best",
    yam_lead_minutes: 60,
    daily_slot: "morning",
    quiet_start: 22,
    quiet_end: 7,
    max_per_day: 2,
    paused_until: null,
    privacy_preview: false,
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
    security: true,
    savedDate: row.saved_date_enabled,
    yam: row.yam_enabled,
    daily: row.daily_enabled,
    qimen: row.qimen_enabled,
    shrine: row.shrine_enabled,
    goal: row.goal_enabled,
    service: true,
    // Kept for V190/V191 clients; this is now the shrine-calendar switch.
    auspicious: row.shrine_enabled,
    yamMinQuality: row.yam_min_quality,
    yamLeadMinutes: row.yam_lead_minutes,
    dailySlot: row.daily_slot,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    maxPerDay: row.max_per_day,
    pausedUntil: untilIso,
    privacyPreview: row.privacy_preview,
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
      WHERE user_id=$1
        AND delivery_status='accepted'
        AND ($2::text IS NULL OR kind=$2)
      ORDER BY sent_at DESC
      LIMIT $3`,
    [session.userId, kind, limit],
  );
  const unread = await q1<{ n: number }>(
    `SELECT count(*)::int AS n FROM mobile_push_log
      WHERE user_id=$1 AND delivery_status='accepted' AND read_at IS NULL`,
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
      await q(`UPDATE mobile_push_log SET read_at=now()
                WHERE user_id=$1 AND delivery_status='accepted'
                  AND id = ANY($2::uuid[]) AND read_at IS NULL`, [
        session.userId,
        ids,
      ]);
    } else {
      await q(`UPDATE mobile_push_log SET read_at=now()
                WHERE user_id=$1 AND delivery_status='accepted' AND read_at IS NULL`, [session.userId]);
    }
    const unread = await q1<{ n: number }>(
      `SELECT count(*)::int AS n FROM mobile_push_log
        WHERE user_id=$1 AND delivery_status='accepted' AND read_at IS NULL`,
      [session.userId],
    );
    return NextResponse.json({ ok: true, unread: unread?.n || 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "prefs") {
    const current = await readPrefs(session.userId);
    const hasQimenLatitude = body?.qimenLatitude !== undefined;
    const hasQimenLongitude = body?.qimenLongitude !== undefined;
    if (hasQimenLatitude !== hasQimenLongitude) {
      return NextResponse.json({ ok: false, error: "qimen_location_incomplete" }, { status: 400 });
    }
    const qimenLatitude = hasQimenLatitude ? Number(body?.qimenLatitude) : null;
    const qimenLongitude = hasQimenLongitude ? Number(body?.qimenLongitude) : null;
    if (
      hasQimenLatitude
      && (!Number.isFinite(qimenLatitude) || qimenLatitude! < -90 || qimenLatitude! > 90
        || !Number.isFinite(qimenLongitude) || qimenLongitude! < -180 || qimenLongitude! > 180)
    ) {
      return NextResponse.json({ ok: false, error: "qimen_location_invalid" }, { status: 400 });
    }
    const savedDate = typeof body?.savedDate === "boolean" ? body.savedDate : current.saved_date_enabled;
    const yam = typeof body?.yam === "boolean" ? body.yam : current.yam_enabled;
    const daily = typeof body?.daily === "boolean" ? body.daily : current.daily_enabled;
    const qimen = typeof body?.qimen === "boolean" ? body.qimen : current.qimen_enabled;
    const shrine = typeof body?.shrine === "boolean"
      ? body.shrine
      : typeof body?.auspicious === "boolean"
        ? body.auspicious
        : current.shrine_enabled;
    const goal = typeof body?.goal === "boolean" ? body.goal : current.goal_enabled;
    const yamMinQuality = body?.yamMinQuality === "good" || body?.yamMinQuality === "best"
      ? body.yamMinQuality
      : current.yam_min_quality;
    const yamLeadMinutes = [15, 30, 60].includes(Number(body?.yamLeadMinutes))
      ? Number(body?.yamLeadMinutes)
      : current.yam_lead_minutes;
    const dailySlot = body?.dailySlot === "morning" || body?.dailySlot === "evening" || body?.dailySlot === "both"
      ? body.dailySlot
      : current.daily_slot;
    const quietStart = intInRange(body?.quietStart, 0, 23) ?? current.quiet_start;
    const quietEnd = intInRange(body?.quietEnd, 0, 23) ?? current.quiet_end;
    const maxPerDay = intInRange(body?.maxPerDay, 0, 10) ?? current.max_per_day;
    const privacyPreview = typeof body?.privacyPreview === "boolean"
      ? body.privacyPreview
      : current.privacy_preview;

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
         (user_id, security_enabled, saved_date_enabled, yam_enabled, auspicious_enabled,
          daily_enabled, qimen_enabled, shrine_enabled, goal_enabled, service_enabled,
          yam_min_quality, yam_lead_minutes, daily_slot,
          quiet_start, quiet_end, max_per_day, paused_until,
          qimen_latitude,qimen_longitude,qimen_location_updated_at,updated_at,privacy_preview)
       VALUES ($1,true,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               CASE WHEN $16::float8 IS NULL THEN NULL ELSE now() END,now(),$18)
       ON CONFLICT (user_id) DO UPDATE SET
         security_enabled=true, saved_date_enabled=$2, yam_enabled=$3,
         auspicious_enabled=$4, daily_enabled=$5, qimen_enabled=$6,
         shrine_enabled=$7, goal_enabled=$8, service_enabled=true,
         yam_min_quality=$9, yam_lead_minutes=$10, daily_slot=$11,
         quiet_start=$12, quiet_end=$13, max_per_day=$14, paused_until=$15, updated_at=now()
         ,qimen_latitude=COALESCE($16::float8,mobile_notification_prefs.qimen_latitude)
         ,qimen_longitude=COALESCE($17::float8,mobile_notification_prefs.qimen_longitude)
         ,qimen_location_updated_at=CASE WHEN $16::float8 IS NULL
           THEN mobile_notification_prefs.qimen_location_updated_at ELSE now() END
         ,privacy_preview=$18
       RETURNING security_enabled, saved_date_enabled, yam_enabled, auspicious_enabled,
                 daily_enabled, qimen_enabled, shrine_enabled, goal_enabled, service_enabled,
                 yam_min_quality, yam_lead_minutes, daily_slot,
                 quiet_start, quiet_end, max_per_day, paused_until, privacy_preview`,
      [
        session.userId, savedDate, yam, shrine, daily, qimen, shrine, goal,
        yamMinQuality, yamLeadMinutes, dailySlot,
        quietStart, quietEnd, maxPerDay, pausedUntil,
        qimenLatitude, qimenLongitude,
        privacyPreview,
      ],
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
