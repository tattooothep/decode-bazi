import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { SIFU_PROMPT_FILES } from "@/lib/sifu-prompt-files";

/**
 * GET  /api/admin/sifu-prompts          → list 3 sifu prompt md + content
 * POST /api/admin/sifu-prompts {file, content}  → save (backup ก่อนเขียน)
 *
 * เขียนลง process.cwd()/data/library/ = release dir ที่ live อ่านจริง
 * (ajek+interaction cache 60s · hourkey_interpret cache ตอน start ต้อง restart)
 */
const DIR = join(process.cwd(), "data/library");
const FILES = SIFU_PROMPT_FILES;

/* จัดกลุ่ม prompt ตามหน้าเว็บที่ใช้ (ให้ admin หาง่าย · กดหน้าแล้วเห็นเฉพาะ prompt ของหน้านั้น) */
function pageOf(name: string): string {
  if (name.includes("compare-")) return "⚖️ เทียบดวง (comparison)";
  if (name.includes("network-") || name.includes("ai-parse-bulk")) return "🌐 เครือข่าย (yongsennetwork)";
  if (name.includes("qimen-sifu") || name.includes("activity-classify")) return "📅 เลือกฤกษ์/ฉีเหมิน (datepick · qimen)";
  if (name.includes("forecast")) return "🎴 พยากรณ์ (forecast)";
  if (name.includes("hourkey_interpret")) return "📊 ภาพรวมดวง (chart)";
  return "🔮 ซินแสหลัก (master · master-m · chart)"; // sifu-* · ajek · interaction
}
/* ลำดับการประกอบ prompt จริงตอนกด "ถาม"/"เปิดดวง" (กลุ่มซินแสหลัก) · flow = ชุดย่อย · step = ลำดับต่อ prompt */
const FLOW: Record<string, { flow: string; step: number }> = {
  // ① ถาม-ตอบ (กดถาม บน /master · /master-m · /chart)
  "prompts/sifu-qa.md": { flow: "① ถาม-ตอบ", step: 1 },
  "prompts/sifu-lang.md": { flow: "① ถาม-ตอบ", step: 2 },
  "prompts/sifu-rules-header.md": { flow: "① ถาม-ตอบ", step: 3 },
  "ajek-bazi-rules.md": { flow: "① ถาม-ตอบ", step: 4 },
  "prompts/sifu-interaction-header.md": { flow: "① ถาม-ตอบ", step: 5 },
  "bazi-interaction-master.md": { flow: "① ถาม-ตอบ", step: 6 },
  "prompts/sifu-ctx-guards.md": { flow: "① ถาม-ตอบ", step: 7 },
  "prompts/sifu-topics.md": { flow: "① ถาม-ตอบ", step: 8 },
  // ② เปิดดวงครั้งแรก (/master?intro=1)
  "prompts/sifu-intro.md": { flow: "② เปิดดวง", step: 1 },
  "prompts/sifu-intro-lang.md": { flow: "② เปิดดวง", step: 2 },
  "prompts/sifu-intro-interaction-header.md": { flow: "② เปิดดวง", step: 3 },
  "prompts/sifu-warmup.md": { flow: "② เปิดดวง", step: 4 },
  "prompts/sifu-warmup-bodies.md": { flow: "② เปิดดวง", step: 5 },
  "prompts/sifu-intro-resume-note.md": { flow: "② เปิดดวง", step: 6 },
};

/* ลำดับการแสดงกลุ่ม */
const PAGE_ORDER = [
  "🔮 ซินแสหลัก (master · master-m · chart)",
  "📊 ภาพรวมดวง (chart)",
  "📅 เลือกฤกษ์/ฉีเหมิน (datepick · qimen)",
  "🌐 เครือข่าย (yongsennetwork)",
  "🎴 พยากรณ์ (forecast)",
  "⚖️ เทียบดวง (comparison)",
];

export async function GET() {
  try { await requireAdmin(); } catch (e) { return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 }); }
  const files = Object.entries(FILES).map(([name, meta]) => {
    let content = "", size = 0, mtime = "";
    try { const p = join(DIR, name); content = readFileSync(p, "utf8"); const st = statSync(p); size = st.size; mtime = st.mtime.toISOString(); }
    catch (e) { content = `(โหลดไม่ได้: ${(e as Error).message})`; }
    return { name, label: meta.label, note: meta.note, page: pageOf(name), flow: FLOW[name]?.flow || "", step: FLOW[name]?.step ?? 99, content, size, mtime };
  });
  files.sort((a, b) => (PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page)) || a.flow.localeCompare(b.flow) || (a.step - b.step));
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
      const safe = file.replace(/\//g, "_");
      writeFileSync(join(bkDir, `${safe}.${ts}.bak`), old, "utf8");
    } catch {}
    writeFileSync(target, content, "utf8");
    return NextResponse.json({ ok: true, file, bytes: content.length, by: admin.email, savedAt: new Date().toISOString(),
      hint: file === "hourkey_interpret_prompt.refined.md" ? "ไฟล์นี้ต้อง pm2 restart ถึงเห็นผล" : "เห็นผลใน ~60 วินาที (cache)" });
  } catch (e) {
    return NextResponse.json({ error: "เขียนไฟล์ไม่ได้: " + (e as Error).message }, { status: 500 });
  }
}
