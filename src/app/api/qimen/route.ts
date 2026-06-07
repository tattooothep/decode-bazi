/**
 * GET/POST /api/qimen?date=YYYY-MM-DD&time=HH:MM&lng=&lat=
 * Proxy → qimen-api POST /api/qimen/calculate · 15 พ.ค. 2026 fixed
 */
import { NextResponse } from "next/server";

const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";

class QimenApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QimenApiError";
    this.status = status;
  }
}

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

type QimenSystemType = "hour" | "day" | "month" | "year";

const QIMEN_SYSTEM_SCOPE: Record<QimenSystemType, {
  calculation_scope_th: string;
  source_note_th: string;
  caveat_th: string;
}> = {
  hour: {
    calculation_scope_th: "ผังฉีเหมินยาม 時家奇門",
    source_note_th: "ผังนี้มาจากระบบคำนวณฉีเหมินตามสำนัก เวลา และพิกัดที่ส่งมา ใช้กับคำถามเฉพาะหน้าและการเลือกยาม",
    caveat_th: "ใช้กับคำถามช่วงเวลานี้และการเลือกยาม ไม่ใช่ภาพรวมทั้งวัน/เดือน/ปี",
  },
  day: {
    calculation_scope_th: "ผังฉีเหมินวัน 日家奇門",
    source_note_th: "ผังนี้ใช้ดูแรงของวันและภาพรวมกิจกรรมวันนั้น ไม่ใช่ผังยามเฉพาะชั่วโมง",
    caveat_th: "ไม่ใช่ผังยามเฉพาะชั่วโมง ถ้าจะลงมือจริงยังควรดูผังยาม 時家 ประกอบ",
  },
  month: {
    calculation_scope_th: "ผังฉีเหมินเดือน 月家奇門",
    source_note_th: "ผังนี้ใช้ดูแนวโน้มระดับเดือนและบริบทงานใหญ่ ไม่ใช่คำตัดสินจังหวะลงมือรายชั่วโมง",
    caveat_th: "ใช้เป็นภาพรวมรายเดือน ไม่ควรฟันธงจังหวะลงมือรายชั่วโมงจากผังนี้อย่างเดียว",
  },
  year: {
    calculation_scope_th: "ผังฉีเหมินปี 年家奇門",
    source_note_th: "ผังนี้ใช้ดูภาพใหญ่ระดับปีและทิศทางระยะยาว ไม่ใช่ฤกษ์ยามเฉพาะชั่วโมง",
    caveat_th: "ใช้เป็นภาพรวมรายปี ไม่ใช่คำตัดสินยามลงมือเฉพาะหน้า",
  },
};

function normalizeQimenSystemType(value: unknown): QimenSystemType {
  const raw = String(value || "").toLowerCase();
  return raw === "day" || raw === "month" || raw === "year" ? raw : "hour";
}

function isObjectRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decorateQimenChartScope(chart: unknown, requestedSystemType: unknown): unknown {
  if (!isObjectRecord(chart)) return chart;
  const engineSystemType = normalizeQimenSystemType(chart.system_type || chart.chart_type);
  const requestedRaw = requestedSystemType ? normalizeQimenSystemType(requestedSystemType) : engineSystemType;
  const requestedScope = QIMEN_SYSTEM_SCOPE[requestedRaw];
  const fulfilled = requestedRaw === engineSystemType;
  const scope = QIMEN_SYSTEM_SCOPE[engineSystemType];
  const existingPolicy = isObjectRecord(chart.temporal_context_policy) ? chart.temporal_context_policy : {};
  const existingCapabilities = isObjectRecord(chart.api_capabilities) ? chart.api_capabilities : {};
  const existingContextFlags = isObjectRecord(existingCapabilities.qimen_context_flags)
    ? existingCapabilities.qimen_context_flags
    : {};
  const existingSystemScope = isObjectRecord(existingCapabilities.qimen_system_scope)
    ? existingCapabilities.qimen_system_scope
    : {};

  const temporalContextPolicy = {
    ...existingPolicy,
    context_only: existingPolicy.context_only ?? true,
    verdict_allowed: existingPolicy.verdict_allowed ?? false,
    no_score_mutation: existingPolicy.no_score_mutation ?? true,
    score_effect: existingPolicy.score_effect ?? "none",
    caveat_th: existingPolicy.caveat_th || scope.caveat_th,
  };

  const qimenContextFlags = {
    ...existingContextFlags,
    version: existingContextFlags.version || "qimen-context-flags-v1",
    context_only: existingContextFlags.context_only ?? true,
    verdict_allowed: existingContextFlags.verdict_allowed ?? false,
    no_score_mutation: existingContextFlags.no_score_mutation ?? true,
    score_effect: existingContextFlags.score_effect ?? "none",
  };

  return {
    ...chart,
    system_type: engineSystemType,
    chart_type: chart.chart_type || engineSystemType,
    calculation_scope_th: chart.calculation_scope_th || scope.calculation_scope_th,
    source_note_th: chart.source_note_th || scope.source_note_th,
    requested_system_type: requestedRaw,
    requested_calculation_scope_th: requestedScope.calculation_scope_th,
    qimen_system_scope_request: {
      version: "qimen-system-scope-request-v1",
      requested_system_type: requestedRaw,
      engine_system_type: engineSystemType,
      fulfilled,
      calculation_scope_th: scope.calculation_scope_th,
      requested_calculation_scope_th: requestedScope.calculation_scope_th,
      status_th: fulfilled
        ? "คำขอตรงกับผังที่ engine คำนวณจริง"
        : `ยังไม่ได้คำนวณ ${requestedScope.calculation_scope_th} ในคำตอบนี้ จึงแสดง ${scope.calculation_scope_th} ที่ engine ส่งมาจริง`,
      caveat_th: fulfilled
        ? scope.caveat_th
        : "ห้ามอ่านผังนี้เป็นผังวัน/เดือน/ปี ถ้า engine ยังส่ง system_type เป็น hour",
    },
    temporal_context_policy: temporalContextPolicy,
    api_capabilities: {
      ...existingCapabilities,
      qimen_context_flags: qimenContextFlags,
      qimen_system_scope: {
        ...existingSystemScope,
        version: existingSystemScope.version || "qimen-system-scope-v1",
        system_type: engineSystemType,
        requested_system_type: requestedRaw,
        fulfilled,
        calculation_scope_th: chart.calculation_scope_th || scope.calculation_scope_th,
        source_note_th: chart.source_note_th || scope.source_note_th,
        verdict_allowed: temporalContextPolicy.verdict_allowed,
        no_score_mutation: temporalContextPolicy.no_score_mutation,
        score_effect: temporalContextPolicy.score_effect,
      },
    },
  };
}

function decorateQimenResponseScope(data: Record<string, any>, requestedSystemType: unknown): Record<string, any> {
  if (isObjectRecord(data.data) && isObjectRecord(data.data.chart)) {
    return {
      ...data,
      data: {
        ...data.data,
        chart: decorateQimenChartScope(data.data.chart, requestedSystemType),
      },
    };
  }
  if (isObjectRecord(data.chart)) {
    return {
      ...data,
      chart: decorateQimenChartScope(data.chart, requestedSystemType),
    };
  }
  return data;
}

async function callQimen(date: string, time: string, lng: number, lat: number, school: string, context: Record<string, unknown> = {}) {
  const target = `${QIMEN_BASE}/api/qimen/calculate`;
  const datetime = `${date}T${time}:00`;
  const profile_id = SCHOOL_TO_PROFILE[school];
  const payload: Record<string, unknown> = { datetime, longitude: lng, latitude: lat, profile_id };
  for (const key of ["question", "use_case", "activity", "purpose", "system_type", "chart_type"]) {
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
    let message = errText.slice(0, 200) || "qimen-api request failed";
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error) message = String(parsed.error);
    } catch {
      // Keep plain text.
    }
    throw new QimenApiError(r.status, message);
  }
  const json = await r.json();
  json._profile_id = profile_id;
  json._school = school;
  return decorateQimenResponseScope(json, context.system_type);
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
    system_type: url.searchParams.get("system_type") || url.searchParams.get("chart_type") || undefined,
  };

  try {
    const data = await callQimen(date, time, lng, lat, school, context);
    return NextResponse.json({ source: "qimen-api", input: { date, time, lng, lat, school, system_type: context.system_type }, ...data });
  } catch (e: unknown) {
    console.error("[qimen] proxy error:", e);  // 1 มิ.ย. · log server (เก็บ URL) · ไม่คืน internal URL ให้ client
    if (e instanceof QimenApiError && e.status >= 400 && e.status < 500) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
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
    system_type: body.system_type || body.chart_type,
  };

  try {
    const data = await callQimen(date, time, lng, lat, school, context);
    return NextResponse.json({ source: "qimen-api", input: { date, time, lng, lat, school, system_type: context.system_type }, ...data });
  } catch (e: unknown) {
    console.error("[qimen] proxy error:", e);  // 1 มิ.ย. · log server (เก็บ URL) · ไม่คืน internal URL ให้ client
    if (e instanceof QimenApiError && e.status >= 400 && e.status < 500) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
