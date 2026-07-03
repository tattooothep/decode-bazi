/**
 * Module · 月空亡 จันทร์ว่าง (Moon Void-of-Course) — r372 · opt-in
 * =====================================================================
 * นิยามคลาสสิก (Lilly-line electional): จันทร์ "ว่าง" ตั้งแต่วินาทีที่ทำมุมใหญ่
 * (conj/sextile/square/trine/opp = 0/60/90/120/180) ครั้งสุดท้ายกับ Sun..Saturn
 * ในราศีปัจจุบัน จนถึงวินาทีที่ย้ายเข้าราศีใหม่ (ingress) — ช่วงนี้ตำราถือว่า
 * "เริ่มงานใหม่ไม่ก่อผล" (nothing will come of the matter)
 *
 * ⚠️ opt-in เหมือน dong_gong/tian_xing (r367): route แนบเฉพาะเมื่อ user ติ๊ก
 *    (moon_void ∈ activeModules) · ไม่ติ๊ก = ไม่แนบ = zero-effect
 * ⚠️ moon_void ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ moon_void (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 *    ตัดฤกษ์ผ่าน caps (max 45) ใน combineScores เท่านั้น
 *
 * กติกา (ตาม spec เจ้านาย r372):
 *   slot (2 ชม.) ซ้อนหน้าต่าง VoC:
 *     กิจกรรมเริ่มงานใหม่ 開市/立約/婚姻/動土/搬家 → cap max 45 (MOON_VOC_CAP)
 *       + reason ระบุช่วง VoC จริง เช่น "จันทร์ว่าง 14:22–17:05"
 *     กิจกรรมอื่น (出行/求財/祭祀) → warning เฉย ๆ (ไม่ตัดคะแนน)
 *
 * การคำนวณ (deterministic · scan+bisect เองด้วย eclipticLon · pattern เดียวกับ events.ts):
 *   - ingress จันทร์ (tropical) ผ่าน findIngresses (events.ts · validated)
 *   - มุมสุดท้ายในราศี: rel(t) = lonMoon − lonPlanet เพิ่มขึ้น monotonic
 *     (จันทร์เร็ว ~12-15°/วัน > ดาวทุกดวง) → หา crossing ของ {0,60,90,120,180,240,270,300}
 *     ในช่วง (prevIngress, ingress) แล้ว bisect ถึงระดับ < 1 นาที
 *   - geocentric → พิกัดสถานที่งานไม่เปลี่ยนผล (รับ loc ไว้บันทึกใน raw เท่านั้น)
 * perf: cache รายวัน + cache ราย sign-period (module-level Map · จำกัด ~2000 entry)
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";
import type { EventLocation } from "../event-location";
import { eclipticLon, norm360 } from "@/lib/astro-core/ephemeris";
import { findIngresses, wrap180 } from "@/lib/astro-core/events";
import {
  DAY_MS, slotWindowUtc, thaiMidnightUtc, fmtThaiRange, overlaps, evictFifo,
} from "./sky-shared";

/** กิจกรรม "เริ่มงานใหม่" ที่ VoC ตัดจริง (ตำรา electional: เริ่มสิ่งใหม่ช่วงว่าง = ไม่ก่อผล) */
const VOC_NEW_WORK = new Set<ActivityType>(["開市", "立約", "婚姻", "動土", "搬家"]);

/** ดาวเป้าหมายมุมใหญ่แบบคลาสสิก · Sun..Saturn (ไม่รวมจันทร์เอง · ไม่รวมดาวนอกตามนิยามดั้งเดิม) */
const VOC_TARGETS = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;
const MAJOR_ASPECT_CROSSINGS = [0, 60, 90, 120, 180, 240, 270, 300]; // rel mod 360 (±มุมรวมแล้ว)

export type VocWindow = {
  startMs: number;      // มุมใหญ่ครั้งสุดท้าย (เริ่มว่าง)
  endMs: number;        // ingress เข้าราศีใหม่ (สิ้นสุดว่าง)
  toSign: number;       // ราศีใหม่ 0=Aries
  fromSign: number;     // ราศีที่ว่างอยู่
  wholeSign: boolean;   // ไม่มีมุมเลยทั้งราศี (ว่างทั้งราศี · หายาก)
  lastAspect?: { body: string; angle: number };
};

// ── caches (module-level · จำกัดขนาด) ─────────────────────────────
const _ingressCache = new Map<string, { ms: number; fromSign: number; toSign: number }[]>(); // key "YYYY-MM"
const _vocBySignPeriod = new Map<number, VocWindow>(); // key = ingress ms (ปัดเป็นวินาที)
const _vocByDay = new Map<string, VocWindow[]>();       // key = YYYY-MM-DD (วันไทย)
const DAY_CACHE_MAX = 2000;

function moonLon(ms: number): number { return eclipticLon("Moon", new Date(ms)); }

/** ingress จันทร์ของเดือน (margin ±5 วัน · sign period จันทร์ ≤ ~2.8 วัน จึงครอบพอ) */
function ingressesForMonth(key: string): { ms: number; fromSign: number; toSign: number }[] {
  const hit = _ingressCache.get(key);
  if (hit) return hit;
  const [y, m] = key.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 5 * DAY_MS);
  const to = new Date(Date.UTC(y, m, 1) + 5 * DAY_MS);
  const list = findIngresses("Moon", from, to, 0).map((e) => ({
    ms: e.date.getTime(), fromSign: e.fromSign, toSign: e.toSign,
  }));
  _ingressCache.set(key, list);
  evictFifo(_ingressCache, 60);
  return list;
}

/** ingress จันทร์ครอบช่วง [fromMs, toMs] (รวมเดือนข้างเคียง · dedupe) */
function ingressesInRange(fromMs: number, toMs: number): { ms: number; fromSign: number; toSign: number }[] {
  const keys = new Set<string>();
  for (let t = fromMs - 5 * DAY_MS; t <= toMs + 5 * DAY_MS; t += 15 * DAY_MS) {
    keys.add(new Date(t).toISOString().slice(0, 7));
  }
  keys.add(new Date(toMs + 5 * DAY_MS).toISOString().slice(0, 7));
  const all: { ms: number; fromSign: number; toSign: number }[] = [];
  for (const k of keys) all.push(...ingressesForMonth(k));
  all.sort((a, b) => a.ms - b.ms);
  const out: typeof all = [];
  for (const e of all) {
    if (out.length && Math.abs(out[out.length - 1].ms - e.ms) < 6 * 3600_000) continue;
    out.push(e);
  }
  return out.filter((e) => e.ms >= fromMs && e.ms <= toMs);
}

/** bisect หา instant ที่ f (monotonic ในช่วง) ข้ามศูนย์ · ละเอียด < 1 นาที */
function bisectMinute(f: (ms: number) => number, a0: number, b0: number): number {
  let a = a0, b = b0;
  let fa = f(a);
  for (let i = 0; i < 26 && b - a > 30_000; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

/** หน้าต่าง VoC ของ sign period ที่จบด้วย ingress นี้ (cache ราย period) */
function vocWindowForIngress(ing: { ms: number; fromSign: number; toSign: number }, prevIngressMs: number): VocWindow {
  const key = Math.round(ing.ms / 1000);
  const hit = _vocBySignPeriod.get(key);
  if (hit) return hit;

  // rel(t) = lonMoon − lonPlanet · monotonic เพิ่ม (จันทร์เร็วกว่าดาวทุกดวง >10°/วัน)
  // ช่วงราศีเดียว Δrel ~26-34° < 360 → unwrap ง่าย · crossing = ค่า aspect mod 360 ใน (rel0, rel0+Δ)
  const t0 = prevIngressMs + 60_000; // กันขอบ ingress พอดี
  const t1 = ing.ms - 30_000;
  let lastMs = -Infinity;
  let lastAspect: { body: string; angle: number } | undefined;
  for (const body of VOC_TARGETS) {
    const relAt = (ms: number) => moonLon(ms) - eclipticLon(body, new Date(ms));
    const r0 = norm360(relAt(t0));
    const dTotal = norm360(relAt(t1) - r0); // 0..~35°
    for (const v of MAJOR_ASPECT_CROSSINGS) {
      const x = norm360(v - r0);
      if (x <= 0.0001 || x >= dTotal) continue; // ไม่มี crossing ของมุมนี้ในราศีนี้
      const f = (ms: number) => wrap180(relAt(ms) - v); // ลบ→บวก ครั้งเดียว (monotonic)
      const hitMs = bisectMinute(f, t0, t1);
      if (hitMs > lastMs) {
        lastMs = hitMs;
        lastAspect = { body, angle: v > 180 ? 360 - v : v };
      }
    }
  }
  const wholeSign = !isFinite(lastMs);
  const win: VocWindow = {
    startMs: wholeSign ? prevIngressMs : lastMs,
    endMs: ing.ms,
    toSign: ing.toSign,
    fromSign: ing.fromSign,
    wholeSign,
    lastAspect,
  };
  _vocBySignPeriod.set(key, win);
  evictFifo(_vocBySignPeriod, 500);
  return win;
}

/** หน้าต่าง VoC ทั้งหมดที่ "แตะ" วันไทย dateStr (รวมชั่วโมง 23:00 คืนก่อนของยาม子) · cache รายวัน ~2000 entry */
export function getVoidWindowsForDate(dateStr: string): VocWindow[] {
  const hit = _vocByDay.get(dateStr);
  if (hit) return hit;
  const mid0 = thaiMidnightUtc(dateStr);
  if (mid0 == null) return [];
  const rangeStart = mid0 - 3 * 3600_000;       // ครอบยาม子 (23:00 คืนก่อน) + เผื่อ
  const rangeEnd = mid0 + DAY_MS;
  // window ที่ overlap ช่วงนี้ต้องจบด้วย ingress ใน (rangeStart, rangeEnd + 2.9d]
  // ดึงย้อนหลังเพิ่ม 3.5 วันเพื่อให้ได้ prev ingress จริงของ period แรกเสมอ
  // (ingress จันทร์ห่างกัน ≤ ~2.8 วัน → ช่วง 3.5 วันมี ingress อย่างน้อย 1 ครั้งแน่นอน)
  const ings = ingressesInRange(rangeStart - Math.ceil(3.5 * DAY_MS), rangeEnd + Math.ceil(2.9 * DAY_MS));
  const out: VocWindow[] = [];
  for (let i = 1; i < ings.length; i++) {
    if (ings[i].ms <= rangeStart) continue; // window จบก่อนช่วงที่สนใจ
    const win = vocWindowForIngress(ings[i], ings[i - 1].ms);
    if (overlaps(win.startMs, win.endMs, rangeStart, rangeEnd)) out.push(win);
    if (win.startMs > rangeEnd) break;
  }
  _vocByDay.set(dateStr, out);
  evictFifo(_vocByDay, DAY_CACHE_MAX);
  return out;
}

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "moon_void",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

/** compute · loc ใช้บันทึก raw เท่านั้น (VoC เป็น geocentric · ไม่ขึ้นกับพิกัด) */
export function computeMoonVoid(c: CandidateSlot, activity: ActivityType, loc?: EventLocation): ModuleResult {
  const slot = slotWindowUtc(c);
  if (!slot) return baseResult("missing", 50, 0);

  const windows = getVoidWindowsForDate(c.calendar.gregorianDate);
  const hitWin = windows.find((w) => overlaps(w.startMs, w.endMs, slot.startMs, slot.endMs));

  if (!hitWin) {
    const r = baseResult("ready", 60, 0.85);
    r.tags = ["voc_clear"];
    r.raw = { voc: null, windows_today: windows.map((w) => fmtThaiRange(w.startMs, w.endMs)), lat: loc?.lat, lng: loc?.lng };
    return r;
  }

  const rangeTh = fmtThaiRange(hitWin.startMs, hitWin.endMs);
  const isNewWork = VOC_NEW_WORK.has(activity);
  const r = baseResult("ready", isNewWork ? 35 : 50, 0.85);
  r.tags = ["voc_hit", isNewWork ? "voc_cap" : "voc_warn"];
  if (isNewWork) {
    r.pass = false;
    r.caps = [{
      type: "max", value: 45,
      reason: `จันทร์ว่าง (Void of Course) ${rangeTh} · เริ่มงานใหม่ช่วงนี้ไม่ก่อผลตามตำรา · เพดานคะแนน 45`,
      source: "moon_void",
      code: "MOON_VOC_CAP",
    } as CapRule & { code: string }];
    r.reasons.down.push({
      code: "MOON_VOC",
      thai: `จันทร์ว่าง ${rangeTh} · ยามนี้คาบช่วงจันทร์ไร้มุมก่อนย้ายราศี (เริ่มงานใหม่ควรเลี่ยง) · เพดานคะแนน 45`,
      zh: "月空亡",
      delta: 0,
      severity: "warning",
      source: "moon_void",
    } as Reason);
  } else {
    r.reasons.warning.push({
      code: "MOON_VOC_WARN",
      thai: `จันทร์ว่าง ${rangeTh} · กิจกรรมนี้ไม่ใช่งานเริ่มใหม่ กระทบน้อย แต่เรื่องที่หวังผลใหม่ควรเลี่ยงช่วงนี้`,
      zh: "月空亡",
      delta: 0,
      severity: "warning",
      source: "moon_void",
    } as Reason);
  }
  r.raw = {
    voc: {
      range_th: rangeTh,
      start_ms: hitWin.startMs,
      end_ms: hitWin.endMs,
      from_sign: hitWin.fromSign,
      to_sign: hitWin.toSign,
      whole_sign: hitWin.wholeSign,
      last_aspect: hitWin.lastAspect || null,
    },
    activity_new_work: isNewWork,
    lat: loc?.lat, lng: loc?.lng,
  };
  return r;
}
