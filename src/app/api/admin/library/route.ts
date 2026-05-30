import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join, extname } from "path";

/**
 * หอสมุดคัมภีร์ (admin only) — อัพโหลดคัมภีร์เป็นไฟล์ภาพ + เขียน memo ต่อท้าย
 *
 * GET  /api/admin/library            → list คัมภีร์ทั้งหมด (+ page_count, memo_count)
 * GET  /api/admin/library?id=N       → รายละเอียดเล่ม (pages + memos)
 * POST /api/admin/library  (multipart form-data, action=create)
 *        title, category, lang, source, files[] (ภาพหลายหน้า)
 * POST /api/admin/library  (json, action=memo)   {scriptureId, pageNo?, body}
 * POST /api/admin/library  (json, action=delete-memo)       {memoId}
 * POST /api/admin/library  (json, action=delete-scripture)  {scriptureId}
 *
 * ภาพเก็บใต้ data/library-scans/<id>/<page>.<ext> (นอก public · เสิร์ฟผ่าน /api/admin/library/file ที่ guard admin)
 */
export const runtime = "nodejs";
// เก็บนอก release dir → persist ข้าม blue-green deploy (release ใหม่ rsync ไม่ทับ)
const SCAN_DIR = process.env.LIBRARY_SCAN_DIR || "/root/decode-shared/library-scans";
const ALLOW_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"]);
const MAX_BYTES = 25 * 1024 * 1024; // 25MB/ไฟล์

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ ok: false, error: "auth" }, { status: 401 }); }
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const sc = await q1(`SELECT * FROM library_scriptures WHERE id=$1`, [Number(id)]);
    if (!sc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const pages = await q(
      `SELECT id, page_no, mime FROM library_pages WHERE scripture_id=$1 ORDER BY page_no`,
      [Number(id)]
    );
    const memos = await q(
      `SELECT id, page_no, body, created_by, created_at FROM library_memos WHERE scripture_id=$1 ORDER BY created_at DESC`,
      [Number(id)]
    );
    return NextResponse.json({ ok: true, scripture: sc, pages, memos });
  }
  const rows = await q(
    `SELECT s.*,
       (SELECT count(*) FROM library_pages p WHERE p.scripture_id=s.id) AS page_count,
       (SELECT count(*) FROM library_memos m WHERE m.scripture_id=s.id) AS memo_count
     FROM library_scriptures s ORDER BY s.created_at DESC`
  );
  return NextResponse.json({ ok: true, scriptures: rows });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try { admin = await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ ok: false, error: "auth" }, { status: 401 }); }
  const ctype = req.headers.get("content-type") || "";

  // ── อัพโหลดคัมภีร์ใหม่ (multipart) ──
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const title = String(form.get("title") || "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "ต้องมีชื่อคัมภีร์" }, { status: 400 });
    const category = String(form.get("category") || "").trim();
    const lang = String(form.get("lang") || "zh").trim();
    const source = String(form.get("source") || "").trim();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

    const row = await q1<{ id: number }>(
      `INSERT INTO library_scriptures (title, category, lang, source, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [title, category, lang, source, admin.email]
    );
    const scId = row!.id;
    const dir = join(SCAN_DIR, String(scId));
    mkdirSync(dir, { recursive: true });

    let pageNo = 0;
    for (const file of files) {
      const ext = (extname(file.name) || ".jpg").toLowerCase();
      if (!ALLOW_EXT.has(ext)) continue;
      if (file.size > MAX_BYTES) continue;
      pageNo += 1;
      const buf = Buffer.from(await file.arrayBuffer());
      const fp = join(dir, `${pageNo}${ext}`);
      writeFileSync(fp, buf);
      const mime = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
      await q(
        `INSERT INTO library_pages (scripture_id, page_no, file_path, mime) VALUES ($1,$2,$3,$4)`,
        [scId, pageNo, fp, mime]
      );
    }
    return NextResponse.json({ ok: true, id: scId, pages: pageNo });
  }

  // ── action ที่เป็น JSON ──
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "memo") {
    const scriptureId = Number(body.scriptureId);
    const text = String(body.body || "").trim();
    if (!scriptureId || !text) return NextResponse.json({ ok: false, error: "ขาดข้อมูล" }, { status: 400 });
    const pageNo = body.pageNo != null && body.pageNo !== "" ? Number(body.pageNo) : null;
    const r = await q1<{ id: number }>(
      `INSERT INTO library_memos (scripture_id, page_no, body, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [scriptureId, pageNo, text, admin.email]
    );
    return NextResponse.json({ ok: true, id: r!.id });
  }

  if (action === "delete-memo") {
    await q(`DELETE FROM library_memos WHERE id=$1`, [Number(body.memoId)]);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-scripture") {
    const scId = Number(body.scriptureId);
    await q(`DELETE FROM library_scriptures WHERE id=$1`, [scId]); // cascade → pages+memos
    try { rmSync(join(SCAN_DIR, String(scId)), { recursive: true, force: true }); } catch {}
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
