// POST/GET /api/mobile/v1/book — คัมภีร์ชะตา (命書 Book of Destiny) สำหรับแอพ (r523)
// สะพานบางๆ ครอบ /api/book ของเว็บ (job + judge-book + natal_books อยู่ฝั่งเว็บทั้งหมด)
// auth: Bearer มือถือ = JWT เดียวกับ cookie decode_auth (แพทเทิร์น mobile/v1/sifu/chat)
import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicAiPayload } from "@/lib/public-ai-response";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCIENCE_RE = /^[a-z_]{2,20}$/;

function cookieHeaderForBook(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

async function parseUpstream(resp: Response) {
  const text = await resp.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 400) || "invalid book response" };
  }
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const limited = await rateLimit(`mobile-book:${clientIp(req)}:${session.userId}`, 4, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const cookie = cookieHeaderForBook(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const profileId = cleanId(body.profileId || body.profile_id);
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });
  }
  const sciences = Array.isArray(body.sciences)
    ? body.sciences
        .map((s) => String(s || "").trim().toLowerCase())
        .filter((s) => SCIENCE_RE.test(s))
        .slice(0, 8)
    : undefined;

  // whitelist payload — force สร้างใหม่ปล่อยผ่านได้ (จ่ายยามตามกติกาเว็บ) · ไม่ส่ง field ภายในอื่น
  const payload: Record<string, unknown> = {
    lang: isSifuAnswerLang(body.lang) ? body.lang : "th",
    profileId,
  };
  if (sciences && sciences.length) payload.sciences = sciences;
  if (body.force === true || body.force === 1 || body.force === "1") payload.force = true;
  if (body.includeSynthesis !== undefined) payload.includeSynthesis = body.includeSynthesis === true;

  const resp = await fetch(`${internalAppOrigin(req)}/api/book`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    method: "POST",
  });
  const data = await parseUpstream(resp);
  return NextResponse.json(
    publicAiPayload({ ok: resp.ok, ...data, source: "/api/book" }),
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: resp.status }
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const cookie = cookieHeaderForBook(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const bookId = cleanId(url.searchParams.get("id") || url.searchParams.get("bookId"));
  if (bookId) qs.set("id", bookId);
  if (url.searchParams.get("list") === "1") qs.set("list", "1");
  const profileId = cleanId(url.searchParams.get("profileId") || url.searchParams.get("profile_id"));
  if (profileId) qs.set("profileId", profileId);
  const lang = url.searchParams.get("lang");
  if (isSifuAnswerLang(lang)) qs.set("lang", String(lang));

  const resp = await fetch(`${internalAppOrigin(req)}/api/book?${qs.toString()}`, {
    cache: "no-store",
    headers: { Cookie: cookie },
    method: "GET",
  });
  const data = await parseUpstream(resp);
  return NextResponse.json(
    publicAiPayload({ ok: resp.ok, ...data, source: "/api/book" }),
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: resp.status }
  );
}
