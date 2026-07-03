/**
 * GET /api/account/avatar/[userId] · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * เสิร์ฟรูปโปรไฟล์จาก DB (webp 256px) · cache 1 ชม. · ไม่ต้อง login (เหมือน avatar สาธารณะทั่วไป
 * เช่นในเครือข่ายดวง/กลุ่ม) · cache-bust ด้วย ?v= จาก avatar_url
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { userId } = await ctx.params;
  if (!UUID_RE.test(String(userId || ""))) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const row = await q1<{ avatar: Buffer | null; avatar_updated_at: string | null }>(
    `SELECT avatar, avatar_updated_at FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [userId]
  );
  if (!row || !row.avatar || !row.avatar.length) {
    return NextResponse.json({ error: "no avatar" }, { status: 404 });
  }
  const etag = `"av-${new Date(row.avatar_updated_at || 0).getTime()}"`;
  if (_req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const body = new Uint8Array(row.avatar);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=3600",
      ETag: etag,
    },
  });
}
