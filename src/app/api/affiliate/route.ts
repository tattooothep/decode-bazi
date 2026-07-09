import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAffiliateSummary, requestAffiliateAccess } from "@/lib/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const summary = await getAffiliateSummary(s.userId);
  return NextResponse.json({ ok: true, user: { id: s.userId, email: s.email }, ...summary });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "request_access");
  if (action !== "request_access") {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  await requestAffiliateAccess(s.userId, String(body.note || "").slice(0, 500));
  const summary = await getAffiliateSummary(s.userId);
  return NextResponse.json({ ok: true, ...summary });
}
