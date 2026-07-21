import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { pool, q } from "@/lib/db";
import { cleanText, ensureCommunityTables, normalizeContentLocale } from "@/lib/community-content";
import { enqueueNotification } from "@/lib/notification-outbox";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CATEGORIES = new Set(["bug", "account", "payment", "language", "notification", "prediction", "other"]);
const STATUSES = new Set(["new", "triaged", "in_progress", "waiting_user", "user_replied", "resolved", "closed"]);
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

type ReportRow = Record<string, unknown> & { id: string };

function publicMessage(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    authorType: ["user", "admin", "system"].includes(String(row.author_type)) ? String(row.author_type) : "system",
    body: String(row.body || ""),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
  };
}

function publicReport(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    category: String(row.category || "other"),
    message: String(row.message || ""),
    pagePath: row.page_path ? String(row.page_path) : "",
    locale: row.locale ? String(row.locale) : "",
    status: STATUSES.has(String(row.status)) ? String(row.status) : "new",
    unreadCount: Math.max(0, Number(row.unread_count || 0)),
    lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)).toISOString() : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

function validReportId(value: unknown): string | null {
  const id = String(value || "").trim();
  return /^\d{1,20}$/.test(id) ? id : null;
}

export async function GET(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401, headers: NO_STORE });
  try {
    await ensureCommunityTables();
    const reportId = validReportId(new URL(req.url).searchParams.get("id"));
    const reports = await q<ReportRow>(
      `SELECT r.id::text, r.category, r.message, r.page_path, r.locale, r.status,
              r.last_message_at, r.created_at, r.updated_at,
              (SELECT count(*)::int FROM support_report_messages m
                WHERE m.report_id=r.id AND m.visibility='public' AND m.author_type IN ('admin','system')
                  AND m.read_by_user_at IS NULL) AS unread_count
         FROM support_reports r
        WHERE r.user_id=$1
          AND ($2::bigint IS NULL OR r.id=$2::bigint)
        ORDER BY COALESCE(r.last_message_at,r.created_at) DESC
        LIMIT 50`,
      [session.userId, reportId]
    );
    if (reportId && !reports.length) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    let messages: ReturnType<typeof publicMessage>[] = [];
    if (reportId) {
      const rows = await q<Record<string, unknown>>(
        `SELECT m.id::text, m.author_type, m.body, m.created_at
           FROM support_report_messages m
           JOIN support_reports r ON r.id=m.report_id
          WHERE m.report_id=$2::bigint AND r.user_id=$1 AND m.visibility='public'
          ORDER BY m.created_at, m.id
          LIMIT 500`,
        [session.userId, reportId]
      );
      messages = rows.map(publicMessage);
    }
    return NextResponse.json({ ok: true, reports: reports.map(publicReport), messages }, { headers: NO_STORE });
  } catch (err) {
    console.error("[api/support/report] GET failed", err);
    return NextResponse.json({ ok: false, error: "support_load_failed" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401, headers: NO_STORE });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "create");
  if (["create", "reply", "reopen"].includes(action)) {
    const limit = action === "create" ? 15 : 60;
    const limited = await rateLimit(`support-report:${action}:${session.userId}:${clientIp(req)}`, limit, 60 * 60_000);
    if (!limited.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (action === "create") {
      const categoryRaw = String(body.category || "other").trim();
      const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
      const message = cleanText(body.message, 4000);
      if (!message || message.length < 8) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "message_required" }, { status: 400, headers: NO_STORE });
      }
      const pagePath = cleanText(body.pagePath, 700);
      const deviceId = cleanText(body.deviceId, 160);
      const locale = normalizeContentLocale(body.locale || req.headers.get("accept-language") || "th");
      const row = (await client.query<ReportRow>(
        `INSERT INTO support_reports
          (user_id,org_id,email,category,message,page_path,locale,severity,user_agent,device_id,last_message_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'normal',$8,$9,now())
         RETURNING id::text,category,message,page_path,locale,status,last_message_at,created_at,updated_at`,
        [session.userId, session.orgId || null, session.email || null, category, message, pagePath, locale, req.headers.get("user-agent") || null, deviceId]
      )).rows[0];
      await client.query(
        `INSERT INTO support_report_messages
          (report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_user_at)
         VALUES ($1::bigint,'user',$2,'public',$3,$4,now())`,
        [row.id, session.userId, message, `initial-${row.id}`]
      );
      await enqueueNotification({
        eventType: "support_report_new",
        severity: category === "payment" ? "critical" : "warning",
        audienceKind: "admin",
        audienceRoles: ["support", "ops", "superadmin"],
        requiredPermission: "admin.community.read",
        dedupeKey: `support-report-new:${row.id}`,
        targetUrl: `/admin/community?report=${row.id}`,
        payload: { support_report_id: row.id, category, page_path: pagePath, locale },
      }, client);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, report: publicReport({ ...row, unread_count: 0 }) }, { status: 201, headers: NO_STORE });
    }

    const reportId = validReportId(body.id ?? body.reportId ?? body.report_id);
    if (!reportId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400, headers: NO_STORE });
    }
    const locked = (await client.query<{ id: string; status: string }>(
      `SELECT id::text,status FROM support_reports WHERE id=$1::bigint AND user_id=$2 FOR UPDATE`,
      [reportId, session.userId]
    )).rows[0];
    if (!locked) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
    }

    if (action === "reply") {
      const message = cleanText(body.message, 8000);
      if (!message || message.length < 2) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "message_required" }, { status: 400, headers: NO_STORE });
      }
      const clientMessageId = cleanText(body.clientMessageId ?? body.client_message_id, 120) || crypto.randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO support_report_messages
          (report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_user_at)
         VALUES ($1::bigint,'user',$2,'public',$3,$4,now())
         ON CONFLICT (report_id,author_type,client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING
         RETURNING id::text`,
        [reportId, session.userId, message, clientMessageId]
      );
      if (inserted.rows[0]) {
        await client.query(
          `UPDATE support_reports SET status='user_replied',last_message_at=now(),updated_at=now(),resolved_at=NULL,closed_at=NULL WHERE id=$1::bigint`,
          [reportId]
        );
        await enqueueNotification({
          eventType: "support_user_reply",
          severity: "warning",
          audienceKind: "admin",
          audienceRoles: ["support", "ops", "superadmin"],
          requiredPermission: "admin.community.read",
          dedupeKey: `support-user-reply:${inserted.rows[0].id}`,
          targetUrl: `/admin/community?report=${reportId}`,
          payload: { support_report_id: reportId },
        }, client);
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, duplicate: !inserted.rows[0] }, { headers: NO_STORE });
    }

    if (action === "mark_read") {
      await client.query(
        `UPDATE support_report_messages SET read_by_user_at=COALESCE(read_by_user_at,now())
          WHERE report_id=$1::bigint AND visibility='public' AND author_type IN ('admin','system')`,
        [reportId]
      );
      await client.query(`UPDATE support_reports SET user_last_read_at=now() WHERE id=$1::bigint`, [reportId]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    if (action === "confirm_resolved" || action === "reopen") {
      const status = action === "confirm_resolved" ? "closed" : "user_replied";
      await client.query(
        `UPDATE support_reports SET status=$2,updated_at=now(),last_message_at=now(),
           closed_at=CASE WHEN $2='closed' THEN now() ELSE NULL END,
           resolved_at=CASE WHEN $2='closed' THEN COALESCE(resolved_at,now()) ELSE NULL END
         WHERE id=$1::bigint`,
        [reportId, status]
      );
      const systemMessage = action === "confirm_resolved" ? "user_confirmed_resolved" : "user_reopened_ticket";
      const statusMessage = await client.query<{ id: string }>(
        `INSERT INTO support_report_messages(report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_user_at)
         VALUES ($1::bigint,'system',$2,'public',$3,$4,now()) ON CONFLICT DO NOTHING RETURNING id::text`,
        [reportId, session.userId, systemMessage, `${systemMessage}-${reportId}-${Date.now()}`]
      );
      if (action === "reopen" && statusMessage.rows[0]) {
        await enqueueNotification({
          eventType: "support_user_reply",
          severity: "warning",
          audienceKind: "admin",
          audienceRoles: ["support", "ops", "superadmin"],
          requiredPermission: "admin.community.read",
          dedupeKey: `support-user-reopen:${statusMessage.rows[0].id}`,
          targetUrl: `/admin/community?report=${reportId}`,
          payload: { support_report_id: reportId, reopened: true },
        }, client);
      }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
    }

    await client.query("ROLLBACK");
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400, headers: NO_STORE });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    console.error("[api/support/report] POST failed", err);
    return NextResponse.json({ ok: false, error: "support_save_failed" }, { status: 500, headers: NO_STORE });
  } finally {
    client.release();
  }
}
