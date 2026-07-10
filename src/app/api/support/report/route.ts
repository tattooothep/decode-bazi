import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { cleanText, ensureCommunityTables, normalizeContentLocale } from "@/lib/community-content";

export const runtime = "nodejs";

const CATEGORIES = new Set(["bug", "account", "payment", "language", "notification", "prediction", "other"]);
const STATUSES = new Set(["new", "triaged", "in_progress", "resolved", "closed"]);

function publicReport(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    category: String(row.category || "other"),
    message: String(row.message || ""),
    pagePath: row.page_path ? String(row.page_path) : "",
    locale: row.locale ? String(row.locale) : "",
    status: STATUSES.has(String(row.status)) ? String(row.status) : "new",
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  try {
    await ensureCommunityTables();
    const rows = await q<Record<string, unknown>>(
      `SELECT id::text, category, message, page_path, locale, status, created_at, updated_at
         FROM support_reports
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [session.userId]
    );
    return NextResponse.json({ ok: true, reports: rows.map(publicReport) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/support/report] GET failed", err);
    return NextResponse.json({ ok: false, error: "support_load_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const categoryRaw = String(body.category || "other").trim();
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
  const message = cleanText(body.message, 4000);
  if (!message || message.length < 8) {
    return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 });
  }
  const pagePath = cleanText(body.pagePath, 700);
  const deviceId = cleanText(body.deviceId, 160);
  const severityRaw = String(body.severity || "normal").trim();
  const severity = ["low", "normal", "high"].includes(severityRaw) ? severityRaw : "normal";
  const locale = normalizeContentLocale(body.locale || req.headers.get("accept-language") || "th");

  try {
    await ensureCommunityTables();
    const row = await q1<Record<string, unknown>>(
      `INSERT INTO support_reports
        (user_id, org_id, email, category, message, page_path, locale, severity, user_agent, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id::text, category, message, page_path, locale, status, created_at, updated_at`,
      [
        session.userId,
        session.orgId || null,
        session.email || null,
        category,
        message,
        pagePath,
        locale,
        severity,
        req.headers.get("user-agent") || null,
        deviceId,
      ]
    );
    return NextResponse.json({ ok: true, report: row ? publicReport(row) : null }, { status: 201 });
  } catch (err) {
    console.error("[api/support/report] POST failed", err);
    return NextResponse.json({ ok: false, error: "support_save_failed" }, { status: 500 });
  }
}
