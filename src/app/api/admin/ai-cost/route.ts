import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

/** AI cost dashboard + kill switch toggles (app_settings, not affiliate) */
export async function GET(req: NextRequest) {
  try { await requirePermission("admin.ai_cost.read"); } catch (e) { return guard(e); }
  const days = Math.min(90, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") || "30", 10) || 30));

  const totals = await q1<{ cost_cents: number; tokens: number; calls: number }>(
    `SELECT COALESCE(SUM(cost_cents),0)::int AS cost_cents,
            COALESCE(SUM(tokens_used),0)::int AS tokens,
            COUNT(*)::int AS calls
       FROM ai_usage WHERE date >= (now() - ($1 || ' days')::interval)::date`,
    [String(days)]
  );
  const byFeature = await q(
    `SELECT COALESCE(feature,'?') AS feature, COUNT(*)::int AS n,
            COALESCE(SUM(cost_cents),0)::int AS cost_cents,
            COALESCE(SUM(tokens_used),0)::int AS tokens
       FROM ai_usage WHERE date >= (now() - ($1 || ' days')::interval)::date
       GROUP BY 1 ORDER BY cost_cents DESC LIMIT 20`,
    [String(days)]
  );
  const topUsers = await q(
    `SELECT u.email, a.user_id,
            COALESCE(SUM(a.cost_cents),0)::int AS cost_cents,
            COALESCE(SUM(a.tokens_used),0)::int AS tokens
       FROM ai_usage a
       LEFT JOIN users u ON u.id=a.user_id
      WHERE a.date >= (now() - ($1 || ' days')::interval)::date
      GROUP BY a.user_id, u.email
      ORDER BY cost_cents DESC LIMIT 20`,
    [String(days)]
  );
  const flags = await q<{ key: string; value: string | null }>(
    `SELECT key, value FROM app_settings
      WHERE key IN ('ai_kill_switch','feature_sifu','feature_fusion','feature_vision','feature_qimen_sifu','feature_palmistry')`
  );

  return NextResponse.json({
    ok: true,
    days,
    totals: {
      cost_thb: Math.round((totals?.cost_cents || 0) / 100),
      tokens: totals?.tokens || 0,
      calls: totals?.calls || 0,
    },
    byFeature,
    topUsers,
    flags: Object.fromEntries(flags.map((f) => [f.key, f.value || "off"])),
  });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.settings.write"); } catch (e) { return guard(e); }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const key = String(body.key || "");
  const value = body.value === true || body.value === "on" ? "on" : "off";
  const allowed = new Set([
    "ai_kill_switch",
    "feature_sifu",
    "feature_fusion",
    "feature_vision",
    "feature_qimen_sifu",
    "feature_palmistry",
  ]);
  if (!allowed.has(key)) return NextResponse.json({ ok: false, error: "bad key" }, { status: 400 });
  await q1(
    `INSERT INTO app_settings(key, value, updated_at, updated_by)
     VALUES ($1,$2,now(),$3)
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now(), updated_by=$3`,
    [key, value, admin.email]
  );
  await writeAdminAudit({
    actor: admin,
    action: "admin.ai_cost.kill_switch",
    targetType: "app_settings",
    payload: { key, value },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true, key, value });
}
