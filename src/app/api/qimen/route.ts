/**
 * GET/POST /api/qimen?date=YYYY-MM-DD&time=HH:MM&lng=&lat=
 * Proxy → qimen-api POST /api/qimen/calculate · 15 พ.ค. 2026 fixed
 */
import { NextResponse } from "next/server";

const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";

/* 📜 school → profile_id mapping · อากง 15 พ.ค. 2026 */
const SCHOOL_TO_PROFILE: Record<string, number> = {
  zhirun: 4,    // zhi_run + true_solar + zhu_que summer (classical)
  chaibu: 1,    // chai_bu + true_solar (recommended)
  yinpan: 5,    // 陰盤 · สำหรับของหาย/ฝัน/เรื่องลึก
  // maoshan: ❌ engine ไม่รองรับ · รอ phase 2
};
function resolveSchool(school?: string | null): string | null {
  const s = (school || "chaibu").toLowerCase();
  return SCHOOL_TO_PROFILE[s] ? s : null;
}

async function callQimen(date: string, time: string, lng: number, lat: number, school: string, context: Record<string, unknown> = {}) {
  const target = `${QIMEN_BASE}/api/qimen/calculate`;
  const datetime = `${date}T${time}:00`;
  const profile_id = SCHOOL_TO_PROFILE[school];
  const payload: Record<string, unknown> = { datetime, longitude: lng, latitude: lat, profile_id };
  for (const key of ["question", "use_case", "activity", "purpose"]) {
    if (context[key]) payload[key] = context[key];
  }
  const r = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "decode-app/1.0" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`qimen-api ${r.status}: ${errText.slice(0, 200)}`);
  }
  const json = await r.json();
  json._profile_id = profile_id;
  json._school = school;
  return json;
}

function nowDateTime() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dt = nowDateTime();
  const date = url.searchParams.get("date") || dt.date;
  const time = url.searchParams.get("time") || dt.time;
  const lng = Number(url.searchParams.get("lng") || 100.5018);
  const lat = Number(url.searchParams.get("lat") || 13.7563);
  const school = resolveSchool(url.searchParams.get("school"));
  if (!school) return NextResponse.json({ error: "unsupported qimen school" }, { status: 400 });
  const context = {
    question: url.searchParams.get("question") || undefined,
    use_case: url.searchParams.get("use_case") || undefined,
    activity: url.searchParams.get("activity") || undefined,
    purpose: url.searchParams.get("purpose") || undefined,
  };

  try {
    const data = await callQimen(date, time, lng, lat, school, context);
    return NextResponse.json({ source: "qimen-api", input: { date, time, lng, lat, school }, ...data });
  } catch (e: unknown) {
    console.error("[qimen] proxy error:", e);  // 1 มิ.ย. · log server (เก็บ URL) · ไม่คืน internal URL ให้ client
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const dt = nowDateTime();
  const date = body.date || dt.date;
  const time = body.time || dt.time;
  const lng = Number(body.lng ?? body.longitude ?? 100.5018);
  const lat = Number(body.lat ?? body.latitude ?? 13.7563);
  const school = resolveSchool(body.school);
  if (!school) return NextResponse.json({ error: "unsupported qimen school" }, { status: 400 });
  const context = {
    question: body.question,
    use_case: body.use_case,
    activity: body.activity,
    purpose: body.purpose,
  };

  try {
    const data = await callQimen(date, time, lng, lat, school, context);
    return NextResponse.json({ source: "qimen-api", input: { date, time, lng, lat, school }, ...data });
  } catch (e: unknown) {
    console.error("[qimen] proxy error:", e);  // 1 มิ.ย. · log server (เก็บ URL) · ไม่คืน internal URL ให้ client
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
