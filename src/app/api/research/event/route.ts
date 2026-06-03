import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logResearchEvent } from "@/lib/research-log";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "datepick_search",
  "sifu_question",
  "network_question",
  "qimen_question",
  "ui_action",
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const eventName = typeof body.eventName === "string" && ALLOWED_EVENTS.has(body.eventName)
    ? body.eventName
    : "ui_action";
  const pagePath = typeof body.pagePath === "string" ? body.pagePath.slice(0, 1_000) : null;
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 1_000) : null;
  const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 160) : null;
  const profileId = typeof body.profileId === "string" ? body.profileId : null;
  const payload = body.payload && typeof body.payload === "object" ? body.payload : null;

  const id = await logResearchEvent({
    session,
    req,
    eventName,
    pagePath,
    referrer,
    sessionKey,
    profileId,
    payload,
  });

  return NextResponse.json({ ok: true, id });
}
