import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { publicAiPayload } from "@/lib/public-ai-response";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";
import { mobileBillingOperation } from "@/lib/mobile-billing-operation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_GROUP_PROFILES = 2;

function cookieHeaderForGroupSifu(req: Request): string {
  const bearer = mobileBearerToken(req);
  if (bearer) return `decode_auth=${bearer}`;
  return req.headers.get("cookie") || "";
}

function cleanString(value: unknown, max = 120): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function cleanHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as { role?: unknown; content?: unknown };
      return {
        role: row.role === "assistant" || row.role === "sifu" ? "assistant" : "user",
        content: String(row.content || "").slice(0, MAX_MESSAGE_LENGTH),
      };
    })
    .filter((item) => item.content.trim())
    .slice(-6);
}

function cleanProfileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().replace(/^hk_/, "") : ""))
        .filter((item) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)
        )
    )
  ).slice(0, MAX_GROUP_PROFILES);
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = cleanString((body as { message?: unknown }).message, MAX_MESSAGE_LENGTH) || "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "no message" }, { status: 400 });
  }

  const profileIds = cleanProfileIds((body as { profileIds?: unknown }).profileIds);
  if (!profileIds.length) {
    return NextResponse.json({ ok: false, error: "profileIds ว่าง" }, { status: 400 });
  }

  const cookie = cookieHeaderForGroupSifu(req);
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "mobile session token missing" }, { status: 401 });
  }

  const origin = internalAppOrigin(req);
  const billingOperation = mobileBillingOperation((body as { billingOperationId?: unknown }).billingOperationId);
  const groupResp = await fetch(`${origin}/api/sifu/group`, {
    body: JSON.stringify({
      groupLabel: cleanString((body as { groupLabel?: unknown }).groupLabel, 60) || "ดวงคู่",
      history: cleanHistory((body as { history?: unknown }).history),
      lang: isSifuAnswerLang((body as { lang?: unknown }).lang) ? (body as { lang?: string }).lang : "th",
      message,
      profileIds,
      stream: false,
    }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Hourkey-Billing-Operation": billingOperation,
    },
    method: "POST",
  });

  const text = await groupResp.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 400) || "invalid sifu group response" };
  }

  return NextResponse.json(
    publicAiPayload({
      ok: groupResp.ok,
      ...data,
      source: "/api/sifu/group",
    }),
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
      status: groupResp.status,
    }
  );
}
