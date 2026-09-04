import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  resolveScienceNotificationDetail,
  validScienceNotificationAudience,
  validScienceNotificationUuid,
} from "@/lib/mobile-science-notification-detail-r8";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;
const unavailable = () => NextResponse.json(
  { ok: false, error: "notification_detail_unavailable" },
  { status: 404, headers: PRIVATE_HEADERS },
);

export async function GET(req: Request, context: { params: Promise<{ occurrenceId: string }> }) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const limited = await rateLimit(`mobile-qizheng-notification-detail:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: PRIVATE_HEADERS });
  const { occurrenceId } = await context.params;
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id") || "";
  const audience = url.searchParams.get("audience") || "";
  if (!validScienceNotificationUuid(session.orgId) || !validScienceNotificationUuid(occurrenceId)
    || !validScienceNotificationUuid(installationId) || !validScienceNotificationAudience(audience)) return unavailable();
  try {
    const detail = await resolveScienceNotificationDetail(pool, {
      userId: session.userId,
      orgId: session.orgId,
      installationId,
      occurrenceId,
      audience,
      category: "qizheng",
    });
    return detail ? NextResponse.json({ ok: true, detail }, { headers: PRIVATE_HEADERS }) : unavailable();
  } catch {
    return unavailable();
  }
}
