import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import {
  cleanLocaleTextMap,
  cleanText,
  ensureCommunityTables,
  type NewsRow,
} from "@/lib/community-content";
import { q, q1 } from "@/lib/db";
import { writeAdminAudit } from "@/lib/admin-audit";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const NEWS_KINDS = new Set(["update", "promo", "system"]);
const REPORT_STATUSES = new Set(["new", "triaged", "in_progress", "resolved", "closed"]);

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

async function loadPayload() {
  await ensureCommunityTables();
  const [news, reports] = await Promise.all([
    q<NewsRow>(
      `SELECT id::text, kind, title, body, cta_label, cta_url, media_url, video_url, badge,
              sort, active, publish_at, expires_at, created_at, updated_at
         FROM news_items
        ORDER BY created_at DESC
        LIMIT 100`
    ),
    q<Record<string, unknown>>(
      `SELECT id::text, user_id, org_id, email, category, message, page_path, locale, severity,
              status, admin_note, user_agent, device_id, created_at, updated_at
         FROM support_reports
        ORDER BY created_at DESC
        LIMIT 100`
    ),
  ]);
  return { news, reports };
}

export async function GET() {
  try { await requirePermission("admin.community.read"); } catch (e) { return guard(e); }
  try {
    return NextResponse.json({ ok: true, ...(await loadPayload()) }, { headers: { "Cache-Control": "no-store" } });
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
        await writeAdminAudit({ actor: admin, action: "admin.community.news.update", targetType: "news_item", targetId: row?.id || id, payload: { kind: vals.kind, active: vals.active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
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
      await writeAdminAudit({ actor: admin, action: "admin.community.news.create", targetType: "news_item", targetId: row?.id || null, payload: { kind: vals.kind, active: vals.active }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, id: row?.id, ...(await loadPayload()) });
    }

    if (action === "delete_news") {
      const id = cleanText(body.id, 30);
      if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      await q1(`DELETE FROM news_items WHERE id=$1`, [id]);
      await writeAdminAudit({ actor: admin, action: "admin.community.news.delete", targetType: "news_item", targetId: id, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, ...(await loadPayload()) });
    }

    if (action === "update_report") {
      const id = cleanText(body.id, 30);
      const statusRaw = String(body.status || "new");
      const status = REPORT_STATUSES.has(statusRaw) ? statusRaw : "new";
      if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      await q1(
        `UPDATE support_reports
            SET status=$2, admin_note=$3, updated_at=now()
          WHERE id=$1`,
        [id, status, cleanText(body.adminNote ?? body.admin_note, 1600)]
      );
      await writeAdminAudit({ actor: admin, action: "admin.community.report.update", targetType: "support_report", targetId: id, payload: { status }, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      return NextResponse.json({ ok: true, ...(await loadPayload()) });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (err) {
    console.error("[api/admin/community] POST failed", err);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
