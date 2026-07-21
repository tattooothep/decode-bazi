/**
 * ศูนย์แจ้งเตือนในแอพ (เจ้านายสั่ง 20 ก.ค.) — กระดิ่ง + หน้ารายการ 3 หัวข้อ
 * GET  ?kind=all|yam|auspicious&limit= → รายการแจ้งเตือนย้อนหลัง + จำนวนที่ยังไม่อ่าน + ตั้งค่า
 * POST {action:"read", ids?:[]} → ทำเครื่องหมายอ่านแล้ว (ไม่ส่ง ids = อ่านทั้งหมด)
 *      {action:"prefs", yam?:bool, auspicious?:bool} → บันทึกตั้งค่ารายหมวด
 * ห้ามปั้นข้อมูล: รายการมาจาก mobile_push_log ที่ตัวยิงจริงเขียนไว้เท่านั้น
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["yam", "auspicious", "daily"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PrefRow = { yam_enabled: boolean; auspicious_enabled: boolean; daily_enabled: boolean };
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
    `SELECT yam_enabled, auspicious_enabled, daily_enabled FROM mobile_notification_prefs WHERE user_id=$1`,
    [userId],
  );
  return row || { yam_enabled: true, auspicious_enabled: true, daily_enabled: true };
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
      prefs: { yam: prefs.yam_enabled, auspicious: prefs.auspicious_enabled, daily: prefs.daily_enabled },
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
    await q(
      `INSERT INTO mobile_notification_prefs (user_id, yam_enabled, auspicious_enabled, daily_enabled, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id) DO UPDATE SET yam_enabled=$2, auspicious_enabled=$3, daily_enabled=$4, updated_at=now()`,
      [session.userId, yam, auspicious, daily],
    );
    return NextResponse.json({ ok: true, prefs: { yam, auspicious, daily } }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
