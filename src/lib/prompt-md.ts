import { readFileSync } from "fs";
import { join } from "path";

/**
 * โหลด prompt template จาก data/library/<relPath> (แก้ได้ผ่าน /admin/sifu-prompts)
 * ลำดับการหา (กันพัง · ไม่ผูก persona ในโค้ด):
 *   1) ไฟล์หลัก relPath (แก้ได้ผ่าน admin)
 *   2) ถ้าหาย/ว่าง → ไฟล์สำรอง relPath.default.md (ห้ามแก้ · ติดไปกับ release)
 *   3) ถ้ายังไม่มี → fallback string (ปกติส่ง "" สำหรับ sifu)
 * cache 60 วิ · key รวมผลลัพธ์สุดท้าย
 * relPath เช่น "prompts/sifu-lang.md"
 */
const _cache: Record<string, { text: string; ts: number }> = {};

function readRaw(relPath: string): string | null {
  try {
    return readFileSync(join(process.cwd(), "data/library", relPath), "utf8");
  } catch {
    return null;
  }
}

export function loadPromptMd(relPath: string, fallback = ""): string {
  const now = Date.now();
  const c = _cache[relPath];
  if (c && now - c.ts < 60_000) return c.text;

  let text = readRaw(relPath);
  if (text == null || text.trim().length < 1) {
    // safety net = ไฟล์ .default.md (ไม่ผูกโค้ด · ห้ามแก้)
    const def = relPath.replace(/\.md$/, ".default.md");
    text = readRaw(def);
  }
  if (text == null) return fallback;
  _cache[relPath] = { text, ts: now };
  return text;
}

/** parse section markers `===KEY===` (บรรทัดเดียว) → { KEY: body } · body ตัด \n หัว-ท้าย */
export function parsePromptSections(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = raw.split(/^===([A-Za-z0-9_:.\-]+)===$/m);
  for (let i = 1; i < parts.length; i += 2) {
    out[parts[i].trim()] = (parts[i + 1] || "").replace(/^\n/, "").replace(/\n+$/, "");
  }
  return out;
}

/** parse `key = value` ต่อบรรทัด (ข้าม comment # และบรรทัดว่าง) · ใช้กับ topic/warmup-body map */
export function parsePromptKV(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

/** โหลด + parse section ในก้าวเดียว (ใช้ .default chain) */
export function loadPromptSections(relPath: string): Record<string, string> {
  return parsePromptSections(loadPromptMd(relPath, ""));
}

/** โหลด + parse key=value ในก้าวเดียว (ใช้ .default chain) */
export function loadPromptKV(relPath: string): Record<string, string> {
  return parsePromptKV(loadPromptMd(relPath, ""));
}
