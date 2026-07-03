/**
 * Module · 日月食 โซนอับคราส (Eclipse Zone) — r372 · opt-in
 * =====================================================================
 * ใช้ findEclipses (astro-core/events · astronomy-engine ให้ instant peak ตรง ๆ)
 * เทียบ "วันไทย" ของ peak คราสกับวันของ slot
 *
 * ⚠️ opt-in เหมือน dong_gong/tian_xing (r367): route แนบเฉพาะเมื่อ user ติ๊ก
 *    (eclipse_zone ∈ activeModules) · ไม่ติ๊ก = ไม่แนบ = zero-effect
 * ⚠️ eclipse_zone ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ eclipse_zone (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 *    ตัดฤกษ์ผ่าน caps (max 35/55) ใน combineScores เท่านั้น
 *
 * กติกา (ตาม spec เจ้านาย r372):
 *   วันคราสพอดี (วันไทยเดียวกับ peak)       → cap 35 (ECLIPSE_DAY_CAP) ทุกกิจกรรม
 *   ±3 วัน + กิจกรรมเปิดตัวใหญ่ 開市/婚姻/動土 → cap 55 (ECLIPSE_ZONE_CAP)
 *   reason บอกชนิดคราส + วันที่จริง
 * perf: cache รายปี (module-level Map)
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";
import { findEclipses } from "@/lib/astro-core/events";
import { DAY_MS, thaiDateStr, thaiMidnightUtc, fmtThaiDate, evictFifo } from "./sky-shared";

/** กิจกรรมเปิดตัวใหญ่ที่โซน ±3 วันตัดจริง */
const ECLIPSE_BIG_LAUNCH = new Set<ActivityType>(["開市", "婚姻", "動土"]);

const KIND_TH: Record<string, string> = { solar: "สุริยคราส", lunar: "จันทรคราส" };
const SUBTYPE_TH: Record<string, string> = {
  total: "เต็มดวง", annular: "วงแหวน", partial: "บางส่วน", penumbral: "เงามัว", hybrid: "ผสม",
};

export type EclipseDay = {
  kind: "solar" | "lunar";
  subtype: string;
  peakMs: number;
  thaiDate: string;   // วันไทยของ peak (YYYY-MM-DD)
  labelTh: string;    // เช่น "สุริยคราสเต็มดวง 13 ส.ค. 2026"
};

const _yearCache = new Map<number, EclipseDay[]>();

/** คราสทั้งหมดที่ peak ตกใน "ปีไทย" นั้น (pad ขอบปี ±4 วันกัน timezone/โซน ±3) */
export function getEclipsesForYear(year: number): EclipseDay[] {
  const hit = _yearCache.get(year);
  if (hit) return hit;
  const from = new Date(Date.UTC(year, 0, 1) - 8 * DAY_MS);
  const to = new Date(Date.UTC(year + 1, 0, 1) + 8 * DAY_MS);
  const list = findEclipses(from, to).map((e) => {
    const peakMs = e.date.getTime();
    const thaiDate = thaiDateStr(peakMs);
    return {
      kind: e.kind,
      subtype: e.subtype,
      peakMs,
      thaiDate,
      labelTh: `${KIND_TH[e.kind] || e.kind}${SUBTYPE_TH[e.subtype] || ""} ${fmtThaiDate(peakMs)} ${new Date(peakMs + 7 * 3600_000).getUTCFullYear()}`,
    } as EclipseDay;
  });
  _yearCache.set(year, list);
  evictFifo(_yearCache, 24);
  return list;
}

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "eclipse_zone",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

export function computeEclipseZone(c: CandidateSlot, activity: ActivityType): ModuleResult {
  const date = c.calendar?.gregorianDate;
  const dayMs = date ? thaiMidnightUtc(date) : null;
  if (!date || dayMs == null) return baseResult("missing", 50, 0);

  const year = Number(date.slice(0, 4));
  const eclipses = getEclipsesForYear(year);
  // หา diff (จำนวนวัน · เทียบวันไทยระดับวัน) ที่ใกล้ที่สุด
  let best: { e: EclipseDay; diffDays: number } | null = null;
  for (const e of eclipses) {
    const eMs = thaiMidnightUtc(e.thaiDate);
    if (eMs == null) continue;
    const diffDays = Math.abs(Math.round((dayMs - eMs) / DAY_MS));
    if (!best || diffDays < best.diffDays) best = { e, diffDays };
  }

  if (!best || best.diffDays > 3) {
    const r = baseResult("ready", 60, 0.9);
    r.tags = ["eclipse_clear"];
    r.raw = { nearest: best ? { label: best.e.labelTh, diff_days: best.diffDays } : null };
    return r;
  }

  const { e, diffDays } = best;
  if (diffDays === 0) {
    const r = baseResult("ready", 20, 0.9);
    r.pass = false;
    r.tags = ["eclipse_day", `eclipse_${e.kind}`];
    r.caps = [{
      type: "max", value: 35,
      reason: `วันเกิดคราส · ${e.labelTh} · ทุกกิจกรรมงดฤกษ์แรง · เพดานคะแนน 35`,
      source: "eclipse_zone",
      code: "ECLIPSE_DAY_CAP",
    } as CapRule & { code: string }];
    r.reasons.down.push({
      code: "ECLIPSE_DAY",
      thai: `วันเกิดคราสพอดี · ${e.labelTh} · ตำราถือเป็นวันแสงถูกบัง ไม่เริ่มงานมงคล · เพดานคะแนน 35`,
      zh: e.kind === "solar" ? "日食" : "月食",
      delta: 0,
      severity: "critical",
      source: "eclipse_zone",
    } as Reason);
    r.raw = { hit: { ...e, diff_days: 0 } };
    return r;
  }

  if (ECLIPSE_BIG_LAUNCH.has(activity)) {
    const r = baseResult("ready", 40, 0.85);
    r.pass = false;
    r.tags = ["eclipse_zone", `eclipse_${e.kind}`];
    r.caps = [{
      type: "max", value: 55,
      reason: `โซนอับคราส ±3 วัน (${e.labelTh} · ห่าง ${diffDays} วัน) · งานเปิดตัวใหญ่ไม่ดันเป็นฤกษ์แรง · เพดานคะแนน 55`,
      source: "eclipse_zone",
      code: "ECLIPSE_ZONE_CAP",
    } as CapRule & { code: string }];
    r.reasons.down.push({
      code: "ECLIPSE_ZONE",
      thai: `อยู่ในโซนอับคราส ±3 วันของ ${e.labelTh} (ห่าง ${diffDays} วัน) · งานเปิดตัวใหญ่ควรขยับออกจากโซน · เพดานคะแนน 55`,
      zh: e.kind === "solar" ? "日食" : "月食",
      delta: 0,
      severity: "warning",
      source: "eclipse_zone",
    } as Reason);
    r.raw = { hit: { ...e, diff_days: diffDays } };
    return r;
  }

  // ใกล้คราสแต่กิจกรรมไม่ใช่เปิดตัวใหญ่ → แจ้งเป็นข้อมูล (ไม่ตัด)
  const r = baseResult("ready", 55, 0.85);
  r.tags = ["eclipse_near", `eclipse_${e.kind}`];
  r.reasons.warning.push({
    code: "ECLIPSE_NEAR",
    thai: `ใกล้ ${e.labelTh} (ห่าง ${diffDays} วัน) · กิจกรรมนี้กระทบน้อย แต่งานเปิดตัวใหญ่ควรเลี่ยงโซนนี้`,
    delta: 0,
    severity: "warning",
    source: "eclipse_zone",
  } as Reason);
  r.raw = { hit: { ...e, diff_days: diffDays }, capped: false };
  return r;
}
