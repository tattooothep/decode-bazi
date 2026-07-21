import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import {
  cleanLocaleTextMap,
  cleanText,
  ensureCommunityTables,
  type NewsRow,
} from "@/lib/community-content";
import { pool, q, q1 } from "@/lib/db";
import { writeAdminAudit } from "@/lib/admin-audit";
import { clientIp } from "@/lib/rate-limit";
import { enqueueNotification } from "@/lib/notification-outbox";

export const runtime = "nodejs";

const NEWS_KINDS = new Set(["update", "promo", "system"]);
const REPORT_STATUSES = new Set(["new", "triaged", "in_progress", "waiting_user", "user_replied", "resolved", "closed"]);

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

function cleanDate(value: unknown): string | null {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function loadPayload(reportId?: string | null) {
  await ensureCommunityTables();
  const [news, reports, messages] = await Promise.all([
    q<NewsRow>(
      `SELECT id::text, kind, title, body, cta_label, cta_url, media_url, video_url, badge,
              sort, active, publish_at, expires_at, created_at, updated_at
         FROM news_items
        ORDER BY created_at DESC
        LIMIT 100`
    ),
    q<Record<string, unknown>>(
      `SELECT r.id::text, r.user_id, r.org_id, r.email, r.category, r.message, r.page_path, r.locale, r.severity,
              r.status, r.admin_note, r.user_agent, r.device_id, r.assignee_id, r.priority,
              r.last_message_at, r.created_at, r.updated_at, a.email AS assignee_email,
              (SELECT count(*)::int FROM support_report_messages m
                WHERE m.report_id=r.id AND m.author_type='user' AND m.read_by_admin_at IS NULL) AS unread_count
         FROM support_reports r
         LEFT JOIN users a ON a.id=r.assignee_id
        ORDER BY created_at DESC
        LIMIT 100`
    ),
    reportId ? q<Record<string, unknown>>(
      `SELECT m.id::text,m.report_id::text,m.author_type,m.author_user_id,m.visibility,m.body,
              m.read_by_user_at,m.read_by_admin_at,m.created_at,u.email AS author_email
         FROM support_report_messages m
         LEFT JOIN users u ON u.id=m.author_user_id
        WHERE m.report_id=$1::bigint
        ORDER BY m.created_at,m.id
        LIMIT 500`,
      [reportId]
    ) : Promise.resolve([]),
  ]);
  return { news, reports, messages };
}

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.community.read"); } catch (e) { return guard(e); }
  try {
    const reportId = new URL(req.url).searchParams.get("report_id");
    if (reportId && !/^\d{1,20}$/.test(reportId)) return NextResponse.json({ ok: false, error: "bad_report_id" }, { status: 400 });
    return NextResponse.json({ ok: true, current_admin: { user_id: admin.userId, email: admin.email }, ...(await loadPayload(reportId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/admin/community] GET failed", err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.community.write"); } catch (e) { return guard(e); }
  await ensureCommunityTables();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");

  try {
    if (action === "save_news") {
      const id = cleanText(body.id, 30);
      const kindRaw = String(body.kind || "update");
      const kind = NEWS_KINDS.has(kindRaw) ? kindRaw : "update";
      const title = cleanLocaleTextMap(body.title, 180);
      const bodyMap = cleanLocaleTextMap(body.body, 1800);
      const ctaLabel = cleanLocaleTextMap(body.ctaLabel ?? body.cta_label, 80);
      if (!Object.values(title).some(Boolean)) {
        return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
      }
      const vals = {
        kind,
        title: JSON.stringify(title),
        body: JSON.stringify(bodyMap),
        ctaLabel: JSON.stringify(ctaLabel),
        ctaUrl: cleanText(body.ctaUrl ?? body.cta_url, 700),
        mediaUrl: cleanText(body.mediaUrl ?? body.media_url, 700),
        videoUrl: cleanText(body.videoUrl ?? body.video_url, 700),
        badge: cleanText(body.badge, 80),
        sort: Math.trunc(Number(body.sort || 0)),
        active: body.active !== false,
        publishAt: cleanDate(body.publishAt ?? body.publish_at) || new Date().toISOString(),
        expiresAt: cleanDate(body.expiresAt ?? body.expires_at),
      };
      if (id) {
        const row = await q1<{ id: string }>(
          `UPDATE news_items
              SET kind=$2, title=$3::jsonb, body=$4::jsonb, cta_label=$5::jsonb,
                  cta_url=$6, media_url=$7, video_url=$8, badge=$9, sort=$10,
                  active=$11, publish_at=$12::timestamptz, expires_at=$13::timestamptz,
                  updated_by=$14, updated_at=now()
            WHERE id=$1
            RETURNING id::text`,
          [
            id,
            vals.kind,
            vals.title,
            vals.body,
            vals.ctaLabel,
            vals.ctaUrl,
            vals.mediaUrl,
            vals.videoUrl,
            vals.badge,
            vals.sort,
            vals.active,
            vals.publishAt,
            vals.expiresAt,
            admin.email,
          ]
        );
        await writeAdminAudit({ actor: admin, action: "admin.community.news.update", targetType: "news_item", targetId: null, payload: { news_item_id: row?.id || id, kind: vals.kind, active: vals.active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
        return NextResponse.json({ ok: true, id: row?.id, ...(await loadPayload()) });
      }
      const row = await q1<{ id: string }>(
        `INSERT INTO news_items
          (kind, title, body, cta_label, cta_url, media_url, video_url, badge, sort, active, publish_at, expires_at, created_by, updated_by)
         VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz,$13,$13)
         RETURNING id::text`,
        [
          vals.kind,
          vals.title,
          vals.body,
          vals.ctaLabel,
          vals.ctaUrl,
          vals.mediaUrl,
          vals.videoUrl,
          vals.badge,
          vals.sort,
          vals.active,
          vals.publishAt,
          vals.expiresAt,
          admin.email,
        ]
      );
      await writeAdminAudit({ actor: admin, action: "admin.community.news.create", targetType: "news_item", targetId: null, payload: { news_item_id: row?.id || null, kind: vals.kind, active: vals.active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, id: row?.id, ...(await loadPayload()) });
    }

    if (action === "delete_news") {
      const id = cleanText(body.id, 30);
      if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      await q1(`DELETE FROM news_items WHERE id=$1`, [id]);
      await writeAdminAudit({ actor: admin, action: "admin.community.news.delete", targetType: "news_item", targetId: null, payload: { news_item_id: id }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, ...(await loadPayload()) });
    }

    if (["update_report", "reply_report", "add_internal_note", "assign_report", "mark_report_read"].includes(action)) {
      const id = cleanText(body.id, 30);
      if (!id || !/^\d{1,20}$/.test(id)) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      const db = await pool.connect();
      let auditAction = "admin.community.report.update";
      let auditPayload: Record<string, unknown> = { support_report_id: id };
      try {
        await db.query("BEGIN");
        const report = (await db.query<{ id: string; user_id: string; status: string; assignee_id: string | null }>(
          `SELECT id::text,user_id,status,assignee_id FROM support_reports WHERE id=$1::bigint FOR UPDATE`, [id]
        )).rows[0];
        if (!report) {
          await db.query("ROLLBACK");
          return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        }

        if (action === "reply_report") {
          const message = cleanText(body.message, 8000);
          if (!message) { await db.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 }); }
          const clientMessageId = cleanText(body.clientMessageId ?? body.client_message_id, 120) || crypto.randomUUID();
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO support_report_messages
              (report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_admin_at)
             VALUES ($1::bigint,'admin',$2,'public',$3,$4,now())
             ON CONFLICT (report_id,author_type,client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING
             RETURNING id::text`,
            [id, admin.userId, message, clientMessageId]
          );
          if (inserted.rows[0]) {
            await db.query(`UPDATE support_reports SET status='waiting_user',last_message_at=now(),updated_at=now() WHERE id=$1::bigint`, [id]);
            await enqueueNotification({
              eventType: "support_admin_reply", severity: "info", audienceKind: "user",
              recipientUserId: report.user_id, dedupeKey: `support-admin-reply:${inserted.rows[0].id}`,
              targetUrl: `/support?report=${id}`, payload: { support_report_id: id },
            }, db);
          }
          auditAction = "admin.community.report.reply";
          auditPayload = { ...auditPayload, message_id: inserted.rows[0]?.id || null, duplicate: !inserted.rows[0] };
        } else if (action === "add_internal_note") {
          const note = cleanText(body.message ?? body.note ?? body.adminNote, 8000);
          if (!note) { await db.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "note_required" }, { status: 400 }); }
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO support_report_messages(report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_admin_at)
             VALUES ($1::bigint,'admin',$2,'internal',$3,$4,now()) RETURNING id::text`,
            [id, admin.userId, note, cleanText(body.clientMessageId, 120) || crypto.randomUUID()]
          );
          await db.query(`UPDATE support_reports SET admin_note=$2,last_message_at=now(),updated_at=now() WHERE id=$1::bigint`, [id, note]);
          auditAction = "admin.community.report.internal_note";
          auditPayload = { ...auditPayload, message_id: inserted.rows[0]?.id || null };
        } else if (action === "assign_report") {
          const assigneeId = cleanText(body.assigneeId ?? body.assignee_id, 50);
          if (assigneeId) {
            const allowed = await db.query(
              `SELECT 1 FROM users u WHERE u.id=$1::uuid AND u.is_active AND u.deleted_at IS NULL
                AND (lower(u.email)=ANY($2::text[]) OR EXISTS (
                  SELECT 1 FROM admin_user_roles ur WHERE ur.user_id=u.id AND ur.revoked_at IS NULL
                    AND (ur.expires_at IS NULL OR ur.expires_at>now())))`,
              [assigneeId, (process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)]
            );
            if (!allowed.rows[0]) { await db.query("ROLLBACK"); return NextResponse.json({ ok: false, error: "assignee_not_admin" }, { status: 400 }); }
          }
          await db.query(`UPDATE support_reports SET assignee_id=$2::uuid,updated_at=now() WHERE id=$1::bigint`, [id, assigneeId || null]);
          auditAction = "admin.community.report.assign";
          auditPayload = { ...auditPayload, before: report.assignee_id, after: assigneeId || null };
        } else if (action === "mark_report_read") {
          await db.query(
            `UPDATE support_report_messages SET read_by_admin_at=COALESCE(read_by_admin_at,now())
              WHERE report_id=$1::bigint AND author_type='user'`, [id]
          );
          await db.query(`UPDATE support_reports SET admin_last_read_at=now() WHERE id=$1::bigint`, [id]);
          auditAction = "admin.community.report.read";
        } else {
          const statusRaw = String(body.status || report.status);
          const status = REPORT_STATUSES.has(statusRaw) ? statusRaw : report.status;
          const adminNote = cleanText(body.adminNote ?? body.admin_note, 1600);
          await db.query(
            `UPDATE support_reports SET status=$2,admin_note=COALESCE($3,admin_note),updated_at=now(),
               resolved_at=CASE WHEN $2='resolved' THEN now() WHEN $2 IN ('new','triaged','in_progress','waiting_user','user_replied') THEN NULL ELSE resolved_at END,
               closed_at=CASE WHEN $2='closed' THEN now() WHEN $2<>'closed' THEN NULL ELSE closed_at END
             WHERE id=$1::bigint`,
            [id, status, adminNote]
          );
          if (status !== report.status) {
            const systemMessage = `status:${status}`;
            const msg = await db.query<{ id: string }>(
              `INSERT INTO support_report_messages(report_id,author_type,author_user_id,visibility,body,client_message_id,read_by_admin_at)
               VALUES ($1::bigint,'system',$2,'public',$3,$4,now()) RETURNING id::text`,
              [id, admin.userId, systemMessage, `status-${status}-${id}-${Date.now()}`]
            );
            await db.query(`UPDATE support_reports SET last_message_at=now() WHERE id=$1::bigint`, [id]);
            await enqueueNotification({
              eventType: "support_status_changed", severity: status === "resolved" || status === "closed" ? "info" : "warning",
              audienceKind: "user", recipientUserId: report.user_id,
              dedupeKey: `support-status:${msg.rows[0].id}`, targetUrl: `/support?report=${id}`,
              payload: { support_report_id: id, status },
            }, db);
          }
          auditPayload = { ...auditPayload, before_status: report.status, status };
        }
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK").catch(() => null);
        throw e;
      } finally {
        db.release();
      }
      await writeAdminAudit({ actor: admin, action: auditAction, targetType: "support_report", targetId: null, payload: auditPayload, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, ...(await loadPayload(id)) });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (err) {
    console.error("[api/admin/community] POST failed", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
