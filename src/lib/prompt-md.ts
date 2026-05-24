import { readFileSync } from "fs";
import { join } from "path";

/**
 * โหลด prompt template จาก data/library/<relPath> (แก้ได้ผ่าน /admin/sifu-prompts)
 * - cache 60 วิ
 * - fallback = ค่าคงที่ที่ส่งมา ถ้าไฟล์หาย/อ่านไม่ได้ → ไม่ crash, prompt ยังทำงาน
 * relPath เช่น "prompts/network-sifu-pair.md"
 */
const _cache: Record<string, { text: string; ts: number }> = {};

export function loadPromptMd(relPath: string, fallback: string): string {
  const now = Date.now();
  const c = _cache[relPath];
  if (c && now - c.ts < 60_000) return c.text;
  try {
    const text = readFileSync(join(process.cwd(), "data/library", relPath), "utf8");
    _cache[relPath] = { text, ts: now };
    return text;
  } catch {
    return fallback;
  }
}
