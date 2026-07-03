/**
 * Event location + True-Solar-Time shichen boundary helper · r367
 * =====================================================================
 * 1) normalizeEventLocation — validate พิกัดสถานที่จัดงานจาก body.options
 *    · invalid/absent → fallback กรุงเทพ (13.7563/100.5018) + note (ไม่ 400 · เอกสารไว้ใน meta)
 * 2) buildTstBoundaryWarning — เช็ค "ยามคาบเส้น ณ สถานที่งาน" ด้วย applyTST (Layer 0 เดิม)
 *    · เทียบยาม (時辰) ตามเวลาสุริยะจริงที่ลองจิจูดงาน vs ยามจาก cache (กทม)
 *    · แจ้งเตือนอย่างเดียว (honest flag) — ห้ามแตะคะแนนจาก cache
 * ห้าม inline tyme.SolarTime ที่นี่ — ใช้ applyTST (src/lib/tyme-tst.ts) เท่านั้น
 */
import { applyTST } from "@/lib/tyme-tst";
import type { Reason } from "./types";

export const EVENT_DEFAULT = { lat: 13.7563, lng: 100.5018, place: "กรุงเทพมหานคร" };
const BKK_LNG = 100.5018;

export type EventLocation = {
  lat: number;
  lng: number;
  place: string;
  /** user = พิกัดจากผู้ใช้ · default_bkk = ไม่ส่งมา · fallback_invalid = ส่งมาแต่ไม่ผ่าน validate */
  source: "user" | "default_bkk" | "fallback_invalid";
  note?: string;
};

export function normalizeEventLocation(options: any): EventLocation {
  const rawLat = options?.eventLat;
  const rawLng = options?.eventLng;
  const place = typeof options?.eventPlace === "string" ? options.eventPlace.trim().slice(0, 120) : "";
  if (rawLat == null && rawLng == null) {
    return { ...EVENT_DEFAULT, source: "default_bkk" };
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  if (!valid) {
    return {
      ...EVENT_DEFAULT,
      source: "fallback_invalid",
      note: "พิกัดสถานที่จัดงานไม่ถูกต้อง · ใช้กรุงเทพมหานครแทน",
    };
  }
  return { lat, lng, place: place || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, source: "user" };
}

const BRANCH_TH: string[] = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

type TstShichen = {
  shichen: number;          // 0-11 (子=0) ตามเวลาสุริยะจริง
  minIntoShichen: number;   // นาทีนับจากขอบยาม (0-119)
  totalShiftMin: number;    // lng-corr + EoT (นาที)
};

/** ยาม 時辰 ตามเวลาสุริยะจริง ณ ลองจิจูดที่กำหนด (clock = เวลานาฬิกา Bangkok UTC+7) */
export function tstShichenAt(y: number, mo: number, d: number, hour: number, minute: number, lng: number): TstShichen {
  const t = applyTST({ year: y, month: mo, day: d, hour, minute, longitude: lng, gmtOffsetHours: 7 });
  // 子時 = 23:00-01:00 → เลื่อน +60 นาทีให้ขอบยามตกที่ 0 mod 120
  const shifted = ((t.appliedHour * 60 + t.appliedMinute + 60) % 1440 + 1440) % 1440;
  return {
    shichen: Math.floor(shifted / 120) % 12,
    minIntoShichen: shifted % 120,
    totalShiftMin: t.totalShiftMin,
  };
}

/** parse "YYYY-MM-DD HH:MM:SS" / ISO (UTC ตาม convention ของ aj_ephemeris_cache) → epoch ms UTC */
function parseUtcText(s: string): number | null {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
}

/**
 * เตือน "ยามคาบเส้น ณ สถานที่งาน" สำหรับ slot เดียว (เฉพาะ top results · ห้ามแตะคะแนน)
 * เงื่อนไข: ยาม TST ณ สถานที่งาน ≠ ยามจาก cache (กทม) หรือ กึ่งกลาง slot ห่างขอบยาม TST ≤ 10 นาที
 */
export function buildTstBoundaryWarning(input: {
  startUtc: string;           // datetime_start (UTC text จาก cache)
  endUtc?: string | null;
  cacheShichen: number;       // c.calendar.shichen (0-11 · กทม clock)
  loc: EventLocation;
}): Reason | null {
  const startMs = parseUtcText(input.startUtc);
  if (startMs == null || !Number.isFinite(input.cacheShichen)) return null;
  const endMs = input.endUtc ? parseUtcText(input.endUtc) : null;
  const midMs = endMs && endMs > startMs ? startMs + (endMs - startMs) / 2 : startMs + 60 * 60_000;
  // UTC → เวลานาฬิกากรุงเทพ (UTC+7)
  const local = new Date(midMs + 7 * 3600_000);
  const y = local.getUTCFullYear(), mo = local.getUTCMonth() + 1, d = local.getUTCDate();
  const hh = local.getUTCHours(), mi = local.getUTCMinutes();

  const atEvent = tstShichenAt(y, mo, d, hh, mi, input.loc.lng);
  const nearBoundary = atEvent.minIntoShichen <= 10 || atEvent.minIntoShichen >= 110;
  const differs = atEvent.shichen !== ((input.cacheShichen % 12) + 12) % 12;
  if (!differs && !nearBoundary) return null;

  // ต่างจาก กทม กี่นาที (เฉพาะส่วนลองจิจูด · EoT หักล้างกันเอง)
  const diffFromBkkMin = Math.abs(Math.round((input.loc.lng - BKK_LNG) * 4));
  const cacheBranch = BRANCH_TH[((input.cacheShichen % 12) + 12) % 12];
  const otherIdx = differs
    ? atEvent.shichen
    : (atEvent.minIntoShichen <= 10 ? (atEvent.shichen + 11) % 12 : (atEvent.shichen + 1) % 12);
  const pairA = cacheBranch;
  const pairB = BRANCH_TH[otherIdx] === cacheBranch ? BRANCH_TH[(otherIdx + 1) % 12] : BRANCH_TH[otherIdx];
  const placeTh = input.loc.place || "สถานที่งาน";

  return {
    code: "TST_HOUR_BOUNDARY",
    thai: `ยามคาบเส้น ณ ${placeTh}: เวลาสุริยะจริงต่างจากกทม ~${diffFromBkkMin} นาที ยามอาจเป็น ยาม${pairA}/ยาม${pairB} — เลื่อนเวลา ±15 นาทีเพื่อความชัวร์`,
    delta: 0,
    severity: "warning",
    source: "ze_ri",
  };
}
