// POST /api/daily-activity/signals · staging/debug
// Body: { date, time, longitude?, gender?, target_hour_branch? }
// คืน 16 signal fields สำหรับ §11 Day Activity rule engine ใช้
// ไม่ใช่ user-facing · ไม่มี wording · ไม่ recommend activity จนกว่าจะมี formula ซินแส
import { NextResponse } from "next/server";
import { computeDayActivitySignals } from "@/lib/day-activity-signals";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || "");
  const time = String(body.time || "12:00");
  const longitude = typeof body.longitude === "number" ? body.longitude : 100.5018;
  const gender = body.gender === "F" ? "F" : "M";
  const target_hour_branch = typeof body.target_hour_branch === "string" ? body.target_hour_branch : undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const out = await computeDayActivitySignals({ date, time, longitude, gender, target_hour_branch });
    return NextResponse.json(out);
  } catch (e: unknown) {
    console.error("[daily-activity/signals]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "signal compute failed" }, { status: 500 });
  }
}
