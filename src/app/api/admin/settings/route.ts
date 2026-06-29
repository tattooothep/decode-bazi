import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAllSettings, setSetting, SETTING_DEFAULTS } from "@/lib/app-settings";

/**
 * หลังบ้าน · ตั้งค่าเว็บ (admin only)
 * GET  /api/admin/settings        → ค่าทั้งหมด (รวม default)
 * POST { settings: {key:value,...} } → บันทึก (เฉพาะ key ที่รู้จัก)
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

const ALLOWED = new Set(Object.keys(SETTING_DEFAULTS));

export async function GET() {
  try { await requireAdmin(); } catch (e) { return guard(e); }
  const map = await getAllSettings(true);
  return NextResponse.json({ ok: true, settings: map, keys: Object.keys(SETTING_DEFAULTS) });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return guard(e); }
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const incoming = (b.settings && typeof b.settings === "object") ? b.settings as Record<string, unknown> : {};
  const saved: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (!ALLOWED.has(k)) continue;
    await setSetting(k, String(v ?? "").slice(0, 2000), admin.email);
    saved.push(k);
  }
  const map = await getAllSettings(true);
  return NextResponse.json({ ok: true, saved, settings: map });
}
