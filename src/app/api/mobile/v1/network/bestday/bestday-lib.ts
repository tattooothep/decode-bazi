// helpers ล้วน (pure) ของเส้น "หาวันนัด" — แยกไฟล์เพื่อเทสได้โดยไม่แตะ DB/HTTP
// ใช้โดย route.ts ข้างกัน + scripts/test-network-bestday.mts
// ⚠️ ห้าม import DB/next/fetch ในไฟล์นี้ — ต้อง pure เท่านั้น
//
// ── ที่มาของคะแนน (สำคัญ · ห้ามเขียนสูตรใหม่ที่นี่) ─────────────────────────
// 1. engine คู่ของเส้น /api/mobile/v1/network คือ computePairReactionV2 ซึ่ง "รับ date แต่ไม่ใช้ date"
//    (ตรวจแล้ว src/lib/scoring/pair-reaction-v2.ts:733 — input.date ไม่ถูกอ่านเลย) → คะแนนคู่คงที่ทุกวัน
//    ใช้เป็น "พื้นฐานความสัมพันธ์" ได้ แต่หาวันดี/วันเลี่ยงรายวันไม่ได้
// 2. ตัวที่แปรตามวันจริงในระบบเดียวกันคือ computeUserDayScore (src/lib/scoring/pair-base.ts)
//    = Single Source of Truth ที่ /today + /calendar + /network/own-score ใช้อยู่แล้ว
//    (มันคือ pairBaseScore ตัวเดียวกับที่ engine เครือข่ายใช้ โดยแปลงเสาวันเป็น "คนของวัน")
// 3. รวมคะแนนสองฝั่งด้วยค่าเฉลี่ย = convention ของ engine เอง (pair-reaction-v2.ts:737 mutual = (atob+btoa)/2)
// 4. label/level แปลงจาก "คะแนนเฉลี่ยสองฝั่ง" ด้วย dayScoreLabelLevel ของ engine เอง (pair-base.ts)
//    → คะแนนกับป้ายตรงกันเสมอ (เจ้านายเคาะ 23 ก.ค.) · ไม่ได้ copy เกณฑ์มาไว้ที่นี่
// ไม่มีตัวเลข/ข้อความชี้ขาดตัวไหนที่เขียนขึ้นเองในไฟล์นี้
//
// ⚠️ ความหมายของเส้นนี้ (ห้ามเขียนคำโฆษณาเกินจริง):
//    = "วันที่ดวงของทั้งสองคนรับพลังของวันนั้นได้ดี" (แต่ละคน × เสาวัน)
//    ≠ "วันที่ความสัมพันธ์ของคู่นี้ดี" — ชั้นความสัมพันธ์คู่คงที่ทุกวัน จึงไม่เข้าคะแนนวัน

import { computeUserDayScore, dayScoreLabelLevel, type Pillar, type Pillars } from "@/lib/scoring/pair-base";

export const BESTDAY_WINDOW_DAYS = 14; // มองไปข้างหน้า 14 วัน (รวมวันนี้)
export const BESTDAY_TTL_MS = 6 * 60 * 60 * 1000; // cache ต่อคู่ 6 ชม.

export type UsefulPair = { yongshen: string[]; jishen: string[] };
export type Side = "self" | "other";

export type SideDay = {
  score: number; // 0-100 (50 = กลาง) · จาก engine
  raw: number; // -100..100 ดิบจาก pairBaseScore
  label: string; // 大吉/吉/中和/凶/大凶 · จาก engine
  level: string; // best/good/ok/caution/avoid · จาก engine
  tags: string[];
  events: string[]; // เหตุผลจริงของ engine เช่น "六合 +12"
};

export type BestdayWhy = {
  day_pillar: string;
  binding: Side; // ฝั่งที่เป็นตัวตัดของวันนั้น (คะแนนต่ำกว่า)
  label: string;
  tags: string[];
  events: string[];
  text: string;
};

export type BestdayRow = {
  date: string;
  score: number; // เฉลี่ยสองฝั่ง (convention ของ engine)
  label: string; // ของฝั่งที่ต่ำกว่า
  level: string;
  binding: Side;
  day_pillar: string;
  self: SideDay;
  other: SideDay;
  why: BestdayWhy;
};

export type BestdayPick = { date: string; score: number; label: string; level: string; why: BestdayWhy };

export type BestdayView = { days: BestdayRow[]; best: BestdayPick | null; avoid: BestdayPick | null };

/* ── คำกำกับที่มาของคะแนน (แอพเอาไปแสดงตรง ๆ · ห้ามแต่งให้เกินจริง) ──
 * เขียนตามที่เจ้านายเคาะ 23 ก.ค.: บอกตรง ๆ ว่าวัดอะไร และ "ไม่ได้" วัดอะไร */
export const BESTDAY_BASIS = {
  engine: "computeUserDayScore (pair-base)",
  measures: {
    th: "วันที่ดวงของทั้งสองคนรับพลังของวันนั้นได้ดี",
    en: "Days when both charts receive the day's energy well",
    zh: "兩人命局皆能承接該日之氣的日子",
  },
  not_measures: {
    th: "ไม่ใช่คะแนนว่าความสัมพันธ์ของคู่นี้ดีหรือไม่ดี — ชั้นความสัมพันธ์ของคู่คงที่ ไม่เปลี่ยนรายวัน",
    en: "Not a score of how good the relationship is — the pair-relationship layer does not change by day",
    zh: "非評斷兩人關係好壞——雙人關係層每日固定不變",
  },
  method: {
    th: "คิดจากเสาวันของแต่ละวัน เทียบกับดวงของแต่ละคนแยกกัน แล้วเฉลี่ยสองฝั่ง",
    en: "Each day's day-pillar is scored against each person's chart separately, then averaged",
    zh: "以每日日柱分別對兩人命局取分，再取兩者平均",
  },
} as const;

/* ── normalize โปรไฟล์ (กระจกจาก mobile/v1/network/route.ts · ตัวแปลงล้วน ไม่ใช่สูตร) ── */

export function unwrapPillars(raw: unknown): Record<string, { stem?: string; branch?: string } | null> {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as { pillars?: Record<string, { stem?: string; branch?: string } | null> };
  return value.pillars && typeof value.pillars === "object"
    ? value.pillars
    : (raw as Record<string, { stem?: string; branch?: string } | null>);
}

export function normalizePillar(pillar: { stem?: string; branch?: string } | null | undefined): Pillar | null {
  const stem = String(pillar?.stem || "").trim();
  const branch = String(pillar?.branch || "").trim();
  return stem && branch ? { stem, branch } : null;
}

/** เสาของโปรไฟล์สำหรับ engine · ไม่มีเสาวัน = null (ห้ามเดา) */
export function profilePillars(rawBaziPillars: unknown): Pillars | null {
  const p = unwrapPillars(rawBaziPillars);
  const day = normalizePillar(p.day);
  if (!day) return null;
  const out: Pillars = { day };
  const year = normalizePillar(p.year);
  const month = normalizePillar(p.month);
  const hour = normalizePillar(p.hour);
  if (year) out.year = year;
  if (month) out.month = month;
  if (hour) out.hour = hour;
  return out;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

/** อ่าน 用神/忌神 จาก column yongshen ของโปรไฟล์ (กระจกจาก network/route.ts) */
export function usefulElements(raw: unknown): UsefulPair {
  if (!raw || typeof raw !== "object") return { yongshen: [], jishen: [] };
  const value = raw as { top3?: unknown[]; yongshenFinal?: unknown[]; primary_yongshen?: unknown[]; jishen?: unknown[] };
  const pickElement = (item: unknown) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") return String((item as { element?: unknown }).element || "");
    return "";
  };
  const top = Array.isArray(value.top3) ? value.top3 : [];
  const final = Array.isArray(value.yongshenFinal) ? value.yongshenFinal : [];
  const primary = Array.isArray(value.primary_yongshen) ? value.primary_yongshen : [];
  const yongshen = Array.from(
    new Set([...top, ...final, ...primary].map(pickElement).map((item) => item.trim()).filter(Boolean))
  );
  return { yongshen, jishen: stringArray(value.jishen) };
}

/**
 * 用神/忌神 ที่จะป้อน engine: เอา wrapper-7 (yongshen_v2 จาก buildNetworkScorePayload) ก่อน
 * ไม่มีค่อยตกมาที่ column yongshen ของโปรไฟล์ — ลำดับเดียวกับ /api/network/own-score
 */
export function usefulFromEngine(yongshenV2Slim: unknown, fallback: UsefulPair): UsefulPair {
  const s = (yongshenV2Slim || {}) as { primary_yongshen?: unknown; jishen?: unknown };
  const yongshen = stringArray(s.primary_yongshen);
  const jishen = stringArray(s.jishen);
  return {
    yongshen: yongshen.length ? yongshen : fallback.yongshen,
    jishen: jishen.length ? jishen : fallback.jishen,
  };
}

/* ── วัน + เสาวัน ── */

/** วันตามเวลาไทย tz+7 (สัญญาเดียวกับ goals-lib/checkin) */
export function thaiDay(offsetDays = 0, nowMs = Date.now()): string {
  return new Date(nowMs + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** เสาวันของวันที่นั้น (เที่ยงวัน) — convention เดียวกับ /api/network/own-score + daily-personal-verdict */
export async function dayPillarOf(date: string): Promise<string> {
  const [yy, mm, dd] = date.split("-").map(Number);
  const tyme = await import("tyme4ts");
  return tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0).getLunarHour().getEightChar().getDay().getName();
}

/** รายการวัน + เสาวัน ตั้งแต่ startDay ไป n วัน */
export async function dayPillarWindow(startDay: string, days = BESTDAY_WINDOW_DAYS, nowMs = Date.now()): Promise<Array<{ date: string; pillar: string }>> {
  // thaiDay() บวก +7 ชม. เองอยู่แล้ว · ถ้าลบ 7 ชม. ตรงนี้จะหักล้างกันจนหน้าต่างถอยไป 1 วัน (แก้ 23 ก.ค.)
  const base = Date.parse(`${startDay}T00:00:00+07:00`);
  const anchor = Number.isFinite(base) ? base : nowMs;
  const out: Array<{ date: string; pillar: string }> = [];
  for (let i = 0; i < days; i += 1) {
    const date = thaiDay(i, anchor);
    out.push({ date, pillar: await dayPillarOf(date) });
  }
  return out;
}

/* ── คิดคะแนนวันหนึ่งของ "คู่" (ทุกค่าจาก engine) ── */

function sideScore(pillars: Pillars, dayPillar: string, useful: UsefulPair): SideDay {
  const r = computeUserDayScore(
    pillars,
    dayPillar,
    useful.yongshen.length ? useful.yongshen : undefined,
    useful.jishen.length ? useful.jishen : undefined
  );
  return {
    score: r.score,
    raw: r.raw,
    label: r.label,
    level: r.level,
    tags: r.tags,
    events: r.breakdown?.events || [],
  };
}

function buildWhy(dayPillar: string, binding: Side, self: SideDay, other: SideDay): BestdayWhy {
  const bindingSide = binding === "self" ? self : other;
  const selfEvents = self.events.slice(0, 3).join(" · ");
  const otherEvents = other.events.slice(0, 3).join(" · ");
  return {
    day_pillar: dayPillar,
    binding,
    label: bindingSide.label,
    tags: bindingSide.tags,
    events: bindingSide.events,
    // ประกอบจากข้อความของ engine ล้วน (ไม่มีคำวินิจฉัยที่เขียนเอง)
    text: `${dayPillar} · ฝั่งเรา ${self.label}${selfEvents ? ` (${selfEvents})` : ""} · ฝั่งเขา ${other.label}${otherEvents ? ` (${otherEvents})` : ""}`,
  };
}

export function scoreDayForPair(args: {
  date: string;
  dayPillar: string;
  selfPillars: Pillars;
  selfUseful: UsefulPair;
  otherPillars: Pillars;
  otherUseful: UsefulPair;
}): BestdayRow {
  const self = sideScore(args.selfPillars, args.dayPillar, args.selfUseful);
  const other = sideScore(args.otherPillars, args.dayPillar, args.otherUseful);
  // convention ของ engine เอง: รวมสองทิศด้วยค่าเฉลี่ย (pair-reaction-v2.ts:737)
  const score = Math.round((self.score + other.score) / 2);
  // ป้ายมาจากคะแนนเฉลี่ยตัวเดียวกัน ด้วยเกณฑ์ของ engine → คะแนนกับป้ายตรงกันเสมอ
  const { label, level } = dayScoreLabelLevel(score);
  // ฝั่งที่คะแนนต่ำกว่า = ตัวถ่วงของวันนั้น (ใช้เล่าเหตุผล ไม่ใช่ตัวตัดป้ายแล้ว · เท่ากันให้ฝั่งเรา)
  const binding: Side = other.score < self.score ? "other" : "self";
  return {
    date: args.date,
    score,
    label,
    level,
    binding,
    day_pillar: args.dayPillar,
    self,
    other,
    why: buildWhy(args.dayPillar, binding, self, other),
  };
}

/* ── เลือกวันดีสุด / วันควรเลี่ยง ── */

const AVOID_LEVELS = new Set(["caution", "avoid"]); // ระดับของ engine เอง (computeUserDayScore)

function toPick(row: BestdayRow): BestdayPick {
  return { date: row.date, score: row.score, label: row.label, level: row.level, why: row.why };
}

/**
 * best = คะแนนสูงสุด (เท่ากันเอาวันที่มาถึงก่อน)
 * avoid = คะแนนต่ำสุด และต้องถูก engine ตีระดับว่า caution/avoid จริงเท่านั้น ไม่งั้น null
 *         (ห้ามตั้งเกณฑ์เอง — ใช้ level ที่ engine ให้มา)
 */
export function buildBestdayView(rows: BestdayRow[]): BestdayView {
  if (!rows.length) return { days: [], best: null, avoid: null };
  let best = rows[0];
  let worst = rows[0];
  for (const row of rows) {
    if (row.score > best.score) best = row;
    if (row.score < worst.score) worst = row;
  }
  // ใช้ level ของแถว (= มาจากคะแนนเฉลี่ยที่โชว์) เท่านั้น
  // ถ้าไปดูระดับรายฝั่งด้วย จะเกิดวันที่ป้ายว่า 中和 แต่ถูกชูเป็น "ควรเลี่ยง" = ขัดกับคะแนนที่แสดง
  const avoidOk = worst.date !== best.date && AVOID_LEVELS.has(worst.level);
  return { days: rows, best: toPick(best), avoid: avoidOk ? toPick(worst) : null };
}

/** key cache ต่อคู่ + วันเริ่มหน้าต่าง (TTL จัดการที่ route) */
export function bestdayCacheKey(selfProfileId: string, otherProfileId: string, startDay: string): string {
  return `${selfProfileId}|${otherProfileId}|${startDay}`;
}

/** uuid v1-v5 (แบบเดียวกับ goals-lib) · ไม่ตรง = null */
export function cleanUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text.toLowerCase()
    : null;
}
