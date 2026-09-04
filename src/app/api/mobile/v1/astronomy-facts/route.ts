import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  validScienceNotificationAudience,
  validScienceNotificationUuid,
} from "@/lib/mobile-science-notification-detail-r8";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const limited = await rateLimit(`mobile-astronomy-facts:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: PRIVATE_HEADERS });
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id") || "";
  const audience = url.searchParams.get("audience") || "";
  if (!validScienceNotificationUuid(session.orgId)
    || !validScienceNotificationUuid(installationId)
    || !validScienceNotificationAudience(audience)) {
    return NextResponse.json({ ok: false, error: "notification_detail_unavailable" }, { status: 404, headers: PRIVATE_HEADERS });
  }
  try {
    const result = await pool.query<{
      id: string;
      state: string;
      snapshot_digest: string;
      created_at: Date;
    }>(
      `SELECT o.id::text,o.state,o.snapshot_digest,o.created_at
         FROM mobile_science_notification_occurrences o
         JOIN mobile_science_notification_chains c ON c.id=o.chain_id
         JOIN mobile_science_notification_endpoints e ON e.chain_id=c.id
        WHERE c.user_id=$1::uuid AND c.org_id=$2::uuid
          AND e.installation_id=$3::uuid AND e.audience_binding=$4
          AND c.science_id='astronomy_fact' AND o.science_id='astronomy_fact'
          AND e.active=true AND e.primary_endpoint=true
        ORDER BY o.created_at DESC LIMIT 50`,
      [session.userId,session.orgId,installationId,audience],
    );
    return NextResponse.json({
      ok: true,
      capability: "pull_only",
      items: result.rows.map((row) => ({
        occurrenceId: row.id,
        state: row.state === "shadowed" ? "current" : row.state,
        snapshotDigest: row.snapshot_digest,
        createdAt: row.created_at.toISOString(),
      })),
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "astronomy_facts_unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
