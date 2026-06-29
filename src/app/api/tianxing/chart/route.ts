/**
 * POST /api/tianxing/chart · 天星擇日 ผังดาวจริง (七政四餘)
 * in: { dtUTC: ISO (UTC ดิบ!), lat, lng } · out: TXResult (deterministic · ฟรี · ไม่หักยาม)
 * แยกเด็ดขาดจาก /api/auspicious (LOCKED) · display-only
 */
import { NextRequest, NextResponse } from "next/server";
import { tianxingReading } from "@/lib/tianxing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const dt = new Date(String(b.dtUTC || ""));
    if (isNaN(dt.getTime())) return NextResponse.json({ ok: false, error: "bad_dtUTC" }, { status: 400 });
    const lat = Number(b.lat); const lng = Number(b.lng);
    if (!Number.isFinite(lat) || lat < -89 || lat > 89) return NextResponse.json({ ok: false, error: "bad_lat" }, { status: 400 });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return NextResponse.json({ ok: false, error: "bad_lng" }, { status: 400 });
    const reading = tianxingReading(dt, lat, lng);
    return NextResponse.json({ ok: true, reading });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || "tianxing_failed" }, { status: 500 });
  }
}
