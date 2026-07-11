/**
 * GET/PUT /api/admin/notify-prefs — ตั้งค่าแจ้งเตือนหลังบ้านของแอดมินคนที่ login อยู่ (r497)
 * guard: requireAdmin (แบบเดียวกับ /api/admin/user-stats) — pref เป็นของตัวเองเท่านั้น
 * ตาราง: admin_notify_prefs (migrations/20260711_admin_notify.sql) · ไม่มี row = ปิด
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { requireAdmin, adminHas } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS = ["user_signup", "order_paid", "job_fail_spike"] as const;
type EventType = (typeof EVENTS)[number];

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return guard(e);
  }
  const rows = await q<{ event_type: EventType; enabled: boolean }>(
    `SELECT event_type, enabled FROM admin_notify_prefs WHERE user_id=$1`,
    [admin.userId]
  );
  const prefs: Record<EventType, boolean> = { user_signup: false, order_paid: false, job_fail_spike: false };
  for (const r of rows) if (EVENTS.includes(r.event_type)) prefs[r.event_type] = !!r.enabled;

  const nsub = await q1<{ n: number }>(
    `SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`,
    [admin.userId]
  );
  return NextResponse.json(
    { ok: true, prefs, subscribed: (nsub?.n || 0) > 0, devices: nsub?.n || 0 },
    { headers: NO_STORE }
  );
}

export async function PUT(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return guard(e);
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const incoming = (body.prefs && typeof body.prefs === "object" ? body.prefs : body) as Record<string, unknown>;

  /* ลายเซน 1: เปิดรับเหตุการณ์ที่มี PII/การเงิน ต้องมีสิทธิ์อ่านหมวดนั้นจริง */
  const EVENT_PERM: Partial<Record<EventType, string>> = {
    user_signup: "admin.users.read",
    order_paid: "admin.orders.read",
  };

  let changed = 0;
  for (const ev of EVENTS) {
    if (typeof incoming[ev] !== "boolean") continue;
    const need = EVENT_PERM[ev];
    if (incoming[ev] === true && need && !adminHas(admin, need)) {
      return NextResponse.json({ ok: false, error: "forbidden_event", event: ev }, { status: 403, headers: NO_STORE });
    }
    await q(
      `INSERT INTO admin_notify_prefs (user_id, event_type, enabled, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, event_type) DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=now()`,
      [admin.userId, ev, incoming[ev] as boolean]
    );
    changed++;
  }
  if (!changed) return NextResponse.json({ ok: false, error: "no_valid_event" }, { status: 400, headers: NO_STORE });

  const rows = await q<{ event_type: EventType; enabled: boolean }>(
    `SELECT event_type, enabled FROM admin_notify_prefs WHERE user_id=$1`,
    [admin.userId]
  );
  const prefs: Record<EventType, boolean> = { user_signup: false, order_paid: false, job_fail_spike: false };
  for (const r of rows) if (EVENTS.includes(r.event_type)) prefs[r.event_type] = !!r.enabled;
  return NextResponse.json({ ok: true, prefs }, { headers: NO_STORE });
}
