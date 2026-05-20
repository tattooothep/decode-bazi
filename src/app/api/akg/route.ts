/**
 * GET /api/akg?key=01_nine_stars
 * GET /api/akg?category=heluo (return all keys in category)
 *
 * Dispatcher สำหรับ data จาก ref_akg_data (อากงอาม่า v1.0)
 * 7 categories: heluo · geju · dayun · liunian · dizhi12 · qimen · mountains24
 * 16 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const category = url.searchParams.get("category");

  if (key) {
    const row = await q1<{ key: string; category: string; description: string; data: unknown }>(
      `SELECT key, category, description, data FROM ref_akg_data WHERE key=$1`,
      [key]
    );
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(row);
  }

  if (category) {
    const rows = await q(
      `SELECT key, description, data FROM ref_akg_data WHERE category=$1 ORDER BY key`,
      [category]
    );
    return NextResponse.json({ category, count: rows.length, items: rows });
  }

  /* List all categories */
  const rows = await q<{ category: string; files: number }>(
    `SELECT category, count(*)::int AS files FROM ref_akg_data GROUP BY category ORDER BY category`
  );
  return NextResponse.json({ categories: rows });
}
