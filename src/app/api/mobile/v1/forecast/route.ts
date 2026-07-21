import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const METHODS = new Set(["meihua", "qmdj", "coin"]);
const CATEGORIES = new Set(["general", "business", "love", "finance", "health", "travel", "legal"]);
const LOCALES = new Set(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

function coordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const method = String(body.method || "qmdj").toLowerCase();
  const category = String(body.category || "general").toLowerCase();
  const lang = LOCALES.has(String(body.lang || "")) ? String(body.lang) : "th";
  if (!question || question.length > 500) return NextResponse.json({ ok: false, error: "bad_question" }, { status: 400 });
  if (!METHODS.has(method)) return NextResponse.json({ ok: false, error: "bad_method" }, { status: 400 });
  if (!CATEGORIES.has(category)) return NextResponse.json({ ok: false, error: "bad_category" }, { status: 400 });

  const latitude = coordinate(body.latitude, -90, 90);
  const longitude = coordinate(body.longitude, -180, 180);
  if (method !== "coin" && (latitude === null || longitude === null)) {
    return NextResponse.json({ ok: false, error: "location_required" }, { status: 422 });
  }
  const coinLines = Array.isArray(body.coin_lines) ? body.coin_lines.map(Number) : undefined;
  if (method === "coin" && (!coinLines || coinLines.length !== 6 || coinLines.some((line) => ![6, 7, 8, 9].includes(line)))) {
    return NextResponse.json({ ok: false, error: "six_coin_lines_required" }, { status: 400 });
  }

  const upstream = await fetch(`${internalAppOrigin(req)}/api/forecast`, {
    body: JSON.stringify({ question, method, category, lang, latitude, longitude, coin_lines: coinLines }),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", Cookie: `decode_auth=${bearer}` },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ error: "invalid_forecast_response" })) as Record<string, unknown>;
  const calculationHtml = typeof data.engine === "string" ? data.engine : "";
  delete data.engine;
  return NextResponse.json(publicAiPayload({
    ...data,
    ok: upstream.ok && data.ok !== false,
    calculation_html: calculationHtml,
    request_context: {
      method, category, lang,
      location_source: method === "coin" ? "not_applicable" : "mobile_explicit",
      ...(latitude === null ? {} : { latitude }),
      ...(longitude === null ? {} : { longitude }),
    },
  }), { headers: { "Cache-Control": "no-store, max-age=0" }, status: upstream.status });
}
