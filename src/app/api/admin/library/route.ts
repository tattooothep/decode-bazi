import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { join, extname } from "path";

/**
 * หอสมุดคัมภีร์ (admin only) — อัพโหลดคัมภีร์เป็นไฟล์ภาพ (อัพทีละรูป) + memo 1 ช่อง/เล่ม
 *
 * GET  /api/admin/library            → list คัมภีร์ (+ page_count)
 * GET  /api/admin/library?id=N       → รายละเอียด (scripture[memo] + pages)
 * POST (json)      action=create        {title,category,lang,source} → คืน {id}
 * POST (multipart) scriptureId + files  → เพิ่มหน้า (อัพทีละรูปก็ได้) · page_no นับต่อ
 * POST (json)      action=save-memo      {scriptureId, memo}
 * POST (json)      action=delete-page    {pageId}
 * POST (json)      action=delete-scripture {scriptureId}
 *
 * ภาพเก็บ /root/decode-shared/library-scans/<id>/<page>.<ext> (persist ข้าม deploy) · เสิร์ฟผ่าน /file (guard admin)
 */
export const runtime = "nodejs";
const SCAN_DIR = process.env.LIBRARY_SCAN_DIR || "/root/decode-shared/library-scans";
const ALLOW_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"]);
const MAX_BYTES = 30 * 1024 * 1024;

/* 1 มิ.ย. · ลบเล่ม = "ซ่อนด้านนอก" เท่านั้น (เจ้านายสั่ง: ห้ามลบในฐานข้อมูล)
 * รายการ id ที่ซ่อนเก็บเป็นไฟล์นอก DB · persist ข้าม deploy · DB/row/memo/ไฟล์สแกน ไม่ถูกแตะ
 * ต้องใส่รหัส LIBRARY_DELETE_PIN ก่อน (fail-closed: ไม่ตั้ง env = ห้ามลบทุกกรณี) */
const HIDDEN_FILE = process.env.LIBRARY_HIDDEN_FILE || join(SCAN_DIR, "_hidden.json");
function readHidden(): number[] {
  try {
    const arr = JSON.parse(readFileSync(HIDDEN_FILE, "utf8"));
    return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch { return []; }
}
function writeHidden(ids: number[]): void {
  mkdirSync(SCAN_DIR, { recursive: true });
  writeFileSync(HIDDEN_FILE, JSON.stringify(Array.from(new Set(ids)).sort((a, b) => a - b)));
}

function mimeOf(ext: string) {
  return ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
}

export async function GET(req: Request) {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ ok: false, error: "auth" }, { status: 401 }); }
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    /* เล่มที่ซ่อนด้านนอก → ปฏิบัติเหมือนไม่มี (กดเข้าไม่ได้) · DB ยังมีจริง กู้ได้ผ่านไฟล์ซ่อน */
    if (readHidden().includes(Number(id))) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const sc = await q1(`SELECT * FROM library_scriptures WHERE id=$1`, [Number(id)]);
    if (!sc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const pages = await q(`SELECT id, page_no, mime FROM library_pages WHERE scripture_id=$1 ORDER BY page_no`, [Number(id)]);
    return NextResponse.json({ ok: true, scripture: sc, pages });
  }
  const rows = await q<{ id: number }>(
    `SELECT s.id, s.title, s.category, s.lang, s.source, s.created_at,
       (SELECT count(*) FROM library_pages p WHERE p.scripture_id=s.id) AS page_count,
       (length(coalesce(s.memo,'')) > 0) AS has_memo
     FROM library_scriptures s ORDER BY s.created_at DESC`
  );
  /* ซ่อน "ด้านนอก" · กรอง id ที่อยู่ในไฟล์ซ่อน (DB ยังมีครบ) */
  const hidden = new Set(readHidden());
  const visible = rows.filter((r) => !hidden.has(Number(r.id)));
  return NextResponse.json({ ok: true, scriptures: visible });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try { admin = await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ ok: false, error: "auth" }, { status: 401 }); }
  const ctype = req.headers.get("content-type") || "";

  // ── เพิ่มหน้า (อัพรูป · ทีละไฟล์หรือหลายไฟล์) เข้าเล่มที่มีอยู่ ──
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const scId = Number(form.get("scriptureId"));
    if (!scId) return NextResponse.json({ ok: false, error: "ต้องมี scriptureId" }, { status: 400 });
    const exists = await q1<{ id: number }>(`SELECT id FROM library_scriptures WHERE id=$1`, [scId]);
    if (!exists) return NextResponse.json({ ok: false, error: "ไม่พบคัมภีร์" }, { status: 404 });

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const dir = join(SCAN_DIR, String(scId));
    mkdirSync(dir, { recursive: true });
    const maxRow = await q1<{ mx: number }>(`SELECT COALESCE(MAX(page_no),0) AS mx FROM library_pages WHERE scripture_id=$1`, [scId]);
    let pageNo = Number(maxRow?.mx || 0);
    const added: number[] = [];
    for (const file of files) {
      const ext = (extname(file.name) || ".jpg").toLowerCase();
      if (!ALLOW_EXT.has(ext) || file.size > MAX_BYTES) continue;
      pageNo += 1;
      const buf = Buffer.from(await file.arrayBuffer());
      const fp = join(dir, `${pageNo}${ext}`);
      writeFileSync(fp, buf);
      const r = await q1<{ id: number }>(
        `INSERT INTO library_pages (scripture_id, page_no, file_path, mime) VALUES ($1,$2,$3,$4) RETURNING id`,
        [scId, pageNo, fp, mimeOf(ext)]
      );
      if (r) added.push(r.id);
    }
    return NextResponse.json({ ok: true, added: added.length, lastPage: pageNo });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "create") {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "ต้องมีชื่อคัมภีร์" }, { status: 400 });
    const r = await q1<{ id: number }>(
      `INSERT INTO library_scriptures (title, category, lang, source, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [title, String(body.category || ""), String(body.lang || "zh"), String(body.source || ""), admin.email]
    );
    return NextResponse.json({ ok: true, id: r!.id });
  }

  if (action === "save-memo") {
    const scId = Number(body.scriptureId);
    if (!scId) return NextResponse.json({ ok: false, error: "ขาด scriptureId" }, { status: 400 });
    await q(`UPDATE library_scriptures SET memo=$1 WHERE id=$2`, [String(body.memo || ""), scId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-page") {
    const row = await q1<{ file_path: string }>(`SELECT file_path FROM library_pages WHERE id=$1`, [Number(body.pageId)]);
    await q(`DELETE FROM library_pages WHERE id=$1`, [Number(body.pageId)]);
    if (row) { try { unlinkSync(row.file_path); } catch {} }
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-scripture") {
    const scId = Number(body.scriptureId);
    if (!scId) return NextResponse.json({ ok: false, error: "ขาด scriptureId" }, { status: 400 });
    /* ต้องใส่รหัสก่อนลบ · fail-closed: env ไม่ตั้ง = ห้ามลบ */
    const pin = process.env.LIBRARY_DELETE_PIN || "";
    if (!pin || String(body.password || "") !== pin) {
      return NextResponse.json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" }, { status: 403 });
    }
    /* ซ่อน "ด้านนอก" เท่านั้น · ห้ามลบ row/memo/ไฟล์สแกนใน DB (เจ้านายสั่ง · 1 มิ.ย.) */
    const hidden = readHidden();
    if (!hidden.includes(scId)) hidden.push(scId);
    writeHidden(hidden);
    return NextResponse.json({ ok: true, hidden: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
