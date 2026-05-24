import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * GET  /api/admin/sifu-prompts          → list 3 sifu prompt md + content
 * POST /api/admin/sifu-prompts {file, content}  → save (backup ก่อนเขียน)
 *
 * เขียนลง process.cwd()/data/library/ = release dir ที่ live อ่านจริง
 * (ajek+interaction cache 60s · hourkey_interpret cache ตอน start ต้อง restart)
 */
const DIR = join(process.cwd(), "data/library");
const FILES: Record<string, { label: string; note: string }> = {
  "ajek-bazi-rules.md": { label: "สูตรอ่านปาจื้อ 13 ขั้น · อาเจ๊กฮ้ง", note: "ซินแสหลัก (/api/sifu) · เห็นผลใน ~60 วิ" },
  "bazi-interaction-master.md": { label: "คัมภีร์ปฏิกิริยา 合冲刑害破", note: "ซินแสหลัก (/api/sifu) · เห็นผลใน ~60 วิ" },
  "hourkey_interpret_prompt.refined.md": { label: "System prompt · คำอ่านภาพรวม", note: "/api/chart/overview · ต้อง restart ถึงเห็นผล" },
};

export async function GET() {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 }); }
  const files = Object.entries(FILES).map(([name, meta]) => {
    let content = "", size = 0, mtime = "";
    try { const p = join(DIR, name); content = readFileSync(p, "utf8"); const st = statSync(p); size = st.size; mtime = st.mtime.toISOString(); }
    catch (e) { content = `(โหลดไม่ได้: ${(e as Error).message})`; }
    return { name, label: meta.label, note: meta.note, content, size, mtime };
  });
  return NextResponse.json({ files, dir: DIR });
}

export async function POST(req: Request) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const file: string = body.file;
  const content: string = body.content;
  if (!file || !(file in FILES)) return NextResponse.json({ error: "ไฟล์ไม่อยู่ใน whitelist" }, { status: 400 });
  if (typeof content !== "string" || content.length < 10) return NextResponse.json({ error: "เนื้อหาว่าง/สั้นเกินไป" }, { status: 400 });
  if (content.length > 500_000) return NextResponse.json({ error: "เนื้อหายาวเกิน 500KB" }, { status: 400 });
  const target = join(DIR, file);
  try {
    // backup เดิมก่อนเขียน
    const bkDir = join(DIR, "_prompt-backups");
    try { mkdirSync(bkDir, { recursive: true }); } catch {}
    try {
      const old = readFileSync(target, "utf8");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(join(bkDir, `${file}.${ts}.bak`), old, "utf8");
    } catch {}
    writeFileSync(target, content, "utf8");
    return NextResponse.json({ ok: true, file, bytes: content.length, by: admin.email, savedAt: new Date().toISOString(),
      hint: file === "hourkey_interpret_prompt.refined.md" ? "ไฟล์นี้ต้อง pm2 restart ถึงเห็นผล" : "เห็นผลใน ~60 วินาที (cache)" });
  } catch (e) {
    return NextResponse.json({ error: "เขียนไฟล์ไม่ได้: " + (e as Error).message }, { status: 500 });
  }
}
