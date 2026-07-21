// POST/GET /api/mobile/v1/sifu/fusion — Master Fusion 5 ศาสตร์สำหรับแอพ (r523)
// สะพานบางๆ ครอบ /api/sifu/fusion5 ของเว็บทั้งชุด (เลือกศาสตร์/entitlement/escrow ยาม/
// job พับจอได้/deliver-once อยู่ฝั่ง fusion5 ทั้งหมด — additive ไม่แตะโค้ดเว็บ)
// auth: Bearer มือถือ = JWT ตัวเดียวกับ cookie decode_auth → forward เป็น Cookie
// (แพทเทิร์นเดียวกับ mobile/v1/sifu/chat ที่ forward เข้า /api/sifu)
import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicAiPayload } from "@/lib/public-ai-response";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCIENCE_RE = /^[a-z_]{2,20}$/;

function cookieHeaderForFusion(req: Request): string {
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

function cleanSciences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => String(s || "").trim().toLowerCase())
    .filter((s) => SCIENCE_RE.test(s))
    .slice(0, 8);
}

function cleanHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as { role?: unknown; content?: unknown };
      return {
        role: row.role === "assistant" || row.role === "sifu" ? "assistant" : "user",
        content: String(row.content || "").slice(0, 2000),
      };
    })
    .filter((item) => item.content.trim())
    .slice(-6);
}

async function parseUpstream(resp: Response) {
  const text = await resp.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 400) || "invalid fusion response" };
  }
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const limited = await rateLimit(`mobile-fusion:${clientIp(req)}:${session.userId}`, 6, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const cookie = cookieHeaderForFusion(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const profileIds = (Array.isArray(body.profileIds) ? body.profileIds : [body.profileId])
    .map(cleanId)
    .filter((x): x is string => !!x)
    .slice(0, 4);
  const sciences = cleanSciences(body.sciences);
  const question = String(body.question || body.message || "").trim().slice(0, 2000);
  if (!profileIds.length) {
    return NextResponse.json({ ok: false, error: "profile_required" }, { status: 400 });
  }
  if (!sciences.length) {
    return NextResponse.json({ ok: false, error: "no_science_selected" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ ok: false, error: "no_question" }, { status: 400 });
  }

  // whitelist payload — ไม่ส่ง __worker/guestBirths จากมือถือ (กัน field ภายในรั่วเข้าเส้น worker)
  const payload = {
    history: cleanHistory(body.history),
    includePalm: body.includePalm === true, // ศาสตร์ที่ 7: ลายมือที่บันทึกไว้ (fusion5 ดึง palm_readings เอง)
    lang: isSifuAnswerLang(body.lang) ? body.lang : "th",
    profileIds,
    question,
    sciences,
    threadId: typeof body.threadId === "string" ? body.threadId.slice(0, 80) : undefined,
    threadProfileId: cleanId(body.threadProfileId) || profileIds[0],
  };
  const idempotency = String(req.headers.get("idempotency-key") || "")
    .replace(/[^a-zA-Z0-9_.:-]/g, "")
    .slice(0, 80);

  const resp = await fetch(`${internalAppOrigin(req)}/api/sifu/fusion5`, {
    body: JSON.stringify(payload),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    method: "POST",
  });
  const data = await parseUpstream(resp);
  return NextResponse.json(
    publicAiPayload({ ok: resp.ok, ...data, source: "/api/sifu/fusion5" }),
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: resp.status }
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  const cookie = cookieHeaderForFusion(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const jobId = cleanId(url.searchParams.get("jobId"));
  if (jobId) qs.set("jobId", jobId);
  if (url.searchParams.get("latest") === "1") qs.set("latest", "1");
  if (url.searchParams.get("resume") === "1") qs.set("resume", "1");
  for (const pid of url.searchParams.getAll("profileIds")) {
    const clean = cleanId(pid);
    if (clean) qs.append("profileIds", clean);
  }
  const question = String(url.searchParams.get("question") || "").trim().slice(0, 2000);
  if (question) qs.set("question", question);
  const sciences = cleanSciences(String(url.searchParams.get("sciences") || "").split(","));
  if (sciences.length) qs.set("sciences", sciences.join(","));

  const resp = await fetch(`${internalAppOrigin(req)}/api/sifu/fusion5?${qs.toString()}`, {
    cache: "no-store",
    headers: { Cookie: cookie },
    method: "GET",
  });
  const data = await parseUpstream(resp);
  return NextResponse.json(
    publicAiPayload({ ok: resp.ok, ...data, source: "/api/sifu/fusion5" }),
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: resp.status }
  );
}
