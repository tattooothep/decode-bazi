/**
 * Module · ราหูกาล (Rahu Kalam · राहु काल) — r372 · opt-in · ศาสตร์ฤกษ์สายอินเดีย
 * =====================================================================
 * ช่วง "ราหูกาล" = 1 ใน 8 ส่วนของกลางวันจริง (sunrise→sunset ณ สถานที่งาน)
 * ที่ตำราอินเดีย (มุหูรตะ/ปัญจางคะ) ถือว่าราหูครอง — งดเริ่มงานมงคลทุกชนิด
 *
 * สูตร index ช่วง (1-based · ตรวจกับแหล่งมาตรฐานปัญจางคะอินเดียใต้ เช่น Drik Panchang):
 *   อาทิตย์ = ช่วงที่ 8 (ช่วงสุดท้ายก่อนตะวันตก)   จันทร์ = 2   อังคาร = 7
 *   พุธ = 5   พฤหัส = 6   ศุกร์ = 4   เสาร์ = 3
 *   (ท่องแบบอินเดีย: "Mother Saw Father Wearing The Turban Suddenly"
 *    = Mon,Sat,Fri,Wed,Thu,Tue,Sun เรียงช่วง 2→8)
 *
 * ⚠️ opt-in เหมือน dong_gong/tian_xing (r367): route แนบเฉพาะเมื่อ user ติ๊ก
 *    (rahu_kalam ∈ activeModules) · ไม่ติ๊ก = ไม่แนบ = zero-effect
 * ⚠️ rahu_kalam ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ rahu_kalam (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 *    ตัดฤกษ์ผ่าน caps (max 50) ใน combineScores เท่านั้น
 *
 * กติกา (ตาม spec เจ้านาย r372):
 *   slot ซ้อนช่วงราหูกาล → cap 50 (RAHU_KALAM_CAP) ทุกกิจกรรม
 *   + reason เวลาจริง เช่น "ราหูกาล 07:39–09:14" (เวลาไทย ณ สถานที่งาน)
 * sunrise/sunset: astronomy-engine SearchRiseSet ณ eventLocation จริง
 *   (route ส่งพิกัดมา · invalid → normalizeEventLocation fallback กรุงเทพแล้ว)
 * perf: cache ราย (วัน,พิกัดปัด 2 ตำแหน่ง) · module-level Map ~2000 entry
 */
import * as A from "astronomy-engine";
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";
import type { EventLocation } from "../event-location";
import { slotWindowUtc, fmtThaiTime, evictFifo, overlaps } from "./sky-shared";

/** ช่วงราหูกาล (1-based) ตามวันสัปดาห์ · index 0=อาทิตย์ .. 6=เสาร์ (JS getUTCDay) */
export const RAHU_OCTANT_BY_WEEKDAY: number[] = [8, 2, 7, 5, 6, 4, 3];

const BKK = { lat: 13.7563, lng: 100.5018 };

export type RahuWindow = {
  startMs: number;
  endMs: number;
  riseMs: number;
  setMs: number;
  octant: number;   // 1-8
  weekday: number;  // 0=อาทิตย์
};

const _dayCache = new Map<string, RahuWindow | null>();
const DAY_CACHE_MAX = 2000;

/** หน้าต่างราหูกาลของวันไทย dateStr ณ พิกัด (null = หา sunrise/sunset ไม่ได้ เช่น ขั้วโลก) */
export function getRahuWindow(dateStr: string, lat: number, lng: number): RahuWindow | null {
  const key = `${dateStr}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
  if (_dayCache.has(key)) return _dayCache.get(key) ?? null;

  let win: RahuWindow | null = null;
  try {
    const dayStart = new Date(`${dateStr}T00:00:00+07:00`);
    if (!isNaN(dayStart.getTime())) {
      const obs = new A.Observer(lat, lng, 0);
      const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, dayStart, 1.2);
      const set = rise ? A.SearchRiseSet(A.Body.Sun, obs, -1, rise.date, 1.2) : null;
      if (rise && set && set.date.getTime() > rise.date.getTime()) {
        const riseMs = rise.date.getTime();
        const setMs = set.date.getTime();
        // วันสัปดาห์ของ "วันไทย" นั้น (dateStr เป็นวันปฏิทินไทยอยู่แล้ว)
        const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
        const octant = RAHU_OCTANT_BY_WEEKDAY[weekday];
        const part = (setMs - riseMs) / 8;
        win = {
          startMs: riseMs + (octant - 1) * part,
          endMs: riseMs + octant * part,
          riseMs, setMs, octant, weekday,
        };
      }
    }
  } catch { win = null; }

  _dayCache.set(key, win);
  evictFifo(_dayCache, DAY_CACHE_MAX);
  return win;
}

function baseResult(status: "missing" | "ready" | "partial", normalized: number, confidence: number): ModuleResult {
  return {
    module: "rahu_kalam",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

export function computeRahuKalam(c: CandidateSlot, activity: ActivityType, loc?: EventLocation): ModuleResult {
  void activity; // ราหูกาลตัดทุกกิจกรรมเท่ากัน (ตำราอินเดีย: งดเริ่มงานมงคลทุกชนิด)
  const slot = slotWindowUtc(c);
  if (!slot) return baseResult("missing", 50, 0);

  const lat = loc?.lat ?? BKK.lat;
  const lng = loc?.lng ?? BKK.lng;
  const win = getRahuWindow(c.calendar.gregorianDate, lat, lng);
  if (!win) return baseResult("partial", 50, 0); // ไม่มี sunrise/sunset (ละติจูดสูงจัด) → ไม่ตัดสิน

  const hit = overlaps(win.startMs, win.endMs, slot.startMs, slot.endMs);
  const rangeTh = `${fmtThaiTime(win.startMs)}–${fmtThaiTime(win.endMs)}`;

  if (!hit) {
    const r = baseResult("ready", 60, 0.85);
    r.tags = ["rahu_clear"];
    r.raw = {
      rahu_kalam_th: rangeTh, octant: win.octant, weekday: win.weekday,
      sunrise_th: fmtThaiTime(win.riseMs), sunset_th: fmtThaiTime(win.setMs),
      lat, lng, system: "indian_muhurta",
    };
    return r;
  }

  const placeTh = loc?.place || "กรุงเทพมหานคร";
  const r = baseResult("ready", 40, 0.85);
  r.pass = false;
  r.tags = ["rahu_hit"];
  r.caps = [{
    type: "max", value: 50,
    reason: `ราหูกาล ${rangeTh} ณ ${placeTh} (ศาสตร์ฤกษ์สายอินเดีย) · เพดานคะแนน 50`,
    source: "rahu_kalam",
    code: "RAHU_KALAM_CAP",
  } as CapRule & { code: string }];
  r.reasons.down.push({
    code: "RAHU_KALAM",
    thai: `ยามนี้คาบช่วงราหูกาล ${rangeTh} ณ ${placeTh} · ตำราสายอินเดียงดเริ่มงานมงคลทุกชนิดในช่วงนี้ · เพดานคะแนน 50`,
    zh: "羅睺時",
    delta: 0,
    severity: "warning",
    source: "rahu_kalam",
  } as Reason);
  r.raw = {
    rahu_kalam_th: rangeTh, octant: win.octant, weekday: win.weekday,
    sunrise_th: fmtThaiTime(win.riseMs), sunset_th: fmtThaiTime(win.setMs),
    start_ms: win.startMs, end_ms: win.endMs,
    lat, lng, place: placeTh, system: "indian_muhurta",
  };
  return r;
}
