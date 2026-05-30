import { requireAdmin } from "@/lib/admin-guard";
import { q1 } from "@/lib/db";
import { readFileSync } from "fs";

/**
 * GET /api/admin/library/file?pageId=N  → ส่งไฟล์ภาพหน้าคัมภีร์ (admin only)
 * ภาพเก็บนอก public · เสิร์ฟผ่าน route นี้เพื่อกัน admin เท่านั้น
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : new Response("auth", { status: 401 }); }
  const pageId = new URL(req.url).searchParams.get("pageId");
  if (!pageId) return new Response("missing pageId", { status: 400 });
  const row = await q1<{ file_path: string; mime: string }>(
    `SELECT file_path, mime FROM library_pages WHERE id=$1`,
    [Number(pageId)]
  );
  if (!row) return new Response("not found", { status: 404 });
  try {
    const buf = readFileSync(row.file_path);
    return new Response(buf, {
      headers: { "Content-Type": row.mime || "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("file missing", { status: 404 });
  }
}
