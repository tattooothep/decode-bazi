/**
 * ตัวอ่าน + parse ไฟล์ตำราใน data/library/naming-canon
 * กฎ: ทุกค่า/ตารางของ engine ต้อง parse จากไฟล์ตำราจริงที่นี่ ห้าม hardcode เดา
 * (อ่านครั้งเดียวแล้ว cache ต่อ process)
 */
import fs from "fs";
import path from "path";

const CANON_DIR = path.join(process.cwd(), "data", "library", "naming-canon");
const fileCache = new Map<string, string>();

export function readCanon(rel: string): string {
  const cached = fileCache.get(rel);
  if (cached != null) return cached;
  const full = path.join(CANON_DIR, rel);
  const txt = fs.readFileSync(full, "utf8");
  fileCache.set(rel, txt);
  return txt;
}

/** ยกบรรทัดที่มี needle ตัวแรกมาเป็น quote หลักฐาน (ตัดช่องว่างหัวท้าย) */
export function quoteLine(text: string, needle: string): string {
  for (const raw of text.split("\n")) {
    if (raw.includes(needle)) return raw.trim();
  }
  return "";
}

/** ยกทุกบรรทัดตั้งแต่ heading ที่ตรง needle จนถึง heading ถัดไป (สำหรับ evidence ที่ต้องหลายบรรทัด) */
export function quoteSection(text: string, headingNeedle: string, maxLines = 6): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(headingNeedle));
  if (start < 0) return "";
  const out: string[] = [lines[start].trim()];
  for (let i = start + 1; i < lines.length && out.length < maxLines; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    if (lines[i].trim()) out.push(lines[i].trim());
  }
  return out.join("\n");
}

/**
 * อ่านทุกแถวของตาราง markdown (บรรทัดที่ขึ้นต้นด้วย "|")
 * คืน array ของ cells (แต่ละแถว = string[] ตัดช่องว่าง) ข้ามแถว header separator (|---|)
 */
export function tableRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue; // แถวขีดคั่น |---|
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

/** ดึงเลขจำนวนเต็มทั้งหมดในสตริง (เช่น "1, 11, 15, 32" → [1,11,15,32]) */
export function extractInts(s: string): number[] {
  const m = s.match(/\d+/g);
  return m ? m.map((x) => parseInt(x, 10)) : [];
}

/** ตัด markdown bold/emoji/ช่องว่างส่วนเกินออกจาก label ในเซลล์ */
export function cleanCell(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/[🚫✅⚠️⭐]/g, "")
    .trim();
}

// ---- ช่วง Unicode อักษรไทย (ใช้จำแนกพยัญชนะ/สระ/วรรณยุกต์) ----
export const isThaiConsonant = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x0e01 && c <= 0x0e2e; // ก(0E01)–ฮ(0E2E) รวม ฤ ฦ
};
export const isThaiVowelSign = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  // สระลอย/บน/ล่าง/หลัง (0E30–0E3A) + สระหน้า เ แ โ ใ ไ ๅ (0E40–0E45)
  return (c >= 0x0e30 && c <= 0x0e3a) || (c >= 0x0e40 && c <= 0x0e45);
};
export const isThaiToneOrMark = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  // ไม้หันอากาศ ั(0E31) + วรรณยุกต์/ไต่คู้/การันต์ (0E47–0E4E)
  return c === 0x0e31 || (c >= 0x0e47 && c <= 0x0e4e);
};

/** ดึงเฉพาะพยัญชนะไทยจากสตริง (unique ตามลำดับ) */
export function thaiConsonantsIn(s: string): string[] {
  const out: string[] = [];
  for (const ch of Array.from(s)) if (isThaiConsonant(ch) && !out.includes(ch)) out.push(ch);
  return out;
}
