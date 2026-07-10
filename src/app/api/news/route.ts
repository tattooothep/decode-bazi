import { NextRequest, NextResponse } from "next/server";
import {
  ensureCommunityTables,
  newsRowToPublic,
  normalizeContentLocale,
  type NewsRow,
} from "@/lib/community-content";
import { q } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureCommunityTables();
    const url = new URL(req.url);
    const locale = normalizeContentLocale(url.searchParams.get("lang") || req.headers.get("accept-language") || "th");
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 20)));
    const rows = await q<NewsRow>(
      `SELECT id::text, kind, title, body, cta_label, cta_url, media_url, video_url, badge,
              sort, active, publish_at, expires_at, created_at, updated_at
         FROM news_items
        WHERE active = true
          AND (publish_at IS NULL OR publish_at <= now())
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY sort DESC, publish_at DESC NULLS LAST, created_at DESC
        LIMIT $1`,
      [limit]
    );
    return NextResponse.json(
      { ok: true, locale, items: rows.map((row) => newsRowToPublic(row, locale)) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    console.error("[api/news] GET failed", err);
    return NextResponse.json({ ok: false, error: "news_failed" }, { status: 500 });
  }
}
