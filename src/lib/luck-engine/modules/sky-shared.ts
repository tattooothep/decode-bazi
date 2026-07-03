/**
 * sky-shared · helper ร่วมของหมวด ② ท้องฟ้าจริง (r372)
 * =====================================================================
 * ใช้ร่วมกันใน moon-void / retro-window / eclipse-zone / rahu-kalam / moon-sign
 * หลักการ: slot ใน datepick = 時辰 2 ชม. · อิง calendar.gregorianDate + shichen
 * (convention เดียวกับ tian-xing.ts: กลาง時辰 = shichen*2 นาฬิกากรุงเทพ · 子=00:00)
 * ⚠️ engine คำนวณ → AI แค่ตีความ (กฎข้อ 9) · เวลาแสดงผลทั้งหมด = เวลาไทย UTC+7
 */
import type { CandidateSlot } from "../types";

export const DAY_MS = 86400000;
export const TH_OFFSET_MS = 7 * 3600_000; // Asia/Bangkok UTC+7 (ไม่มี DST)

export type SlotWindow = { startMs: number; midMs: number; endMs: number };

/** หน้าต่างเวลา slot (UTC epoch ms) จาก gregorianDate + shichen
 *  กลาง時辰 = shichen*2 นาฬิกาไทย (子=00:00 丑=02:00 … 亥=22:00) · ครอบ ±1 ชม. */
export function slotWindowUtc(c: CandidateSlot): SlotWindow | null {
  const date = c.calendar?.gregorianDate;
  const sc = c.calendar?.shichen;
  if (!date || typeof sc !== "number" || !Number.isFinite(sc)) return null;
  const mid = Date.parse(`${date}T${String((sc * 2) % 24).padStart(2, "0")}:00:00+07:00`);
  if (isNaN(mid)) return null;
  return { startMs: mid - 3600_000, midMs: mid, endMs: mid + 3600_000 };
}

/** epoch ms UTC ของเที่ยงคืนไทย (00:00 UTC+7) ของวัน YYYY-MM-DD */
export function thaiMidnightUtc(dateStr: string): number | null {
  const ms = Date.parse(`${dateStr}T00:00:00+07:00`);
  return isNaN(ms) ? null : ms;
}

/** วันที่ไทย (YYYY-MM-DD) ของ instant UTC */
export function thaiDateStr(ms: number): string {
  return new Date(ms + TH_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" เวลาไทยของ instant UTC */
export function fmtThaiTime(ms: number): string {
  return new Date(ms + TH_OFFSET_MS).toISOString().slice(11, 16);
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "10 ก.ค." เวลาไทย */
export function fmtThaiDate(ms: number): string {
  const d = new Date(ms + TH_OFFSET_MS);
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** ช่วงเวลา "14:22–17:05" · ข้ามวัน = "10 ก.ค. 23:40 – 11 ก.ค. 03:15" (เวลาไทย) */
export function fmtThaiRange(startMs: number, endMs: number): string {
  if (thaiDateStr(startMs) === thaiDateStr(endMs)) {
    return `${fmtThaiTime(startMs)}–${fmtThaiTime(endMs)}`;
  }
  return `${fmtThaiDate(startMs)} ${fmtThaiTime(startMs)} – ${fmtThaiDate(endMs)} ${fmtThaiTime(endMs)}`;
}

/** overlap ระหว่างสองช่วงเวลา (half-open) */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** ตัด cache แบบ FIFO เมื่อเกินเพดาน (module-level Map) */
export function evictFifo<K, V>(map: Map<K, V>, max: number): void {
  if (map.size <= max) return;
  const drop = map.size - max;
  let i = 0;
  for (const k of map.keys()) {
    map.delete(k);
    if (++i >= drop) break;
  }
}
