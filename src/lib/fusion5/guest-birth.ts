/**
 * fusion5 · r381 "ดวงชั่วคราว" (guest births) — ถามดวงโดยกรอกวันเกิดสด ไม่บันทึกเป็นโปรไฟล์
 * =====================================================================
 * หน้าที่ 3 อย่าง (additive · ไม่แตะ /api/sifu LOCKED · ไม่เขียนตาราง profiles เด็ดขาด):
 *   1. parseGuestBirths()        — validate input จาก client (วันเกิด 1900-ปัจจุบัน · เวลา valid|null · lat/lng default กทม)
 *   2. buildGuestFusionBirth()   — คำนวณเสาด้วย calcBazi() (Layer 1 · ห้าม inline tyme) → shape เดียวกับ loadBirth จาก DB
 *                                  (baziPillars = {ge_ju,pillars,day_boundary} เหมือน profiles.bazi_pillars jsonb ·
 *                                   yongshen = null → resonance R5 ข้ามสุภาพ "ไม่มีข้อมูล用神ใน DB — ไม่เดา")
 *   3. buildGuestBaziPanelPrompt() — bazi panel ของ guest ไปทาง externalPrompt (fusion-internal) เหมือน 4 ศาสตร์
 *                                  เพราะ /api/sifu POST ไม่รับ birth ตรง (intro birth params มีเฉพาะ GET stream)
 *                                  → สร้าง packet เองผ่าน buildStructuredChartPacket + renderChartPrompt (chart-packet.ts)
 *
 * convention เดิมที่ตาม:
 *   - ไม่ทราบเวลา → hasTime=false + ใช้ 12:00 noon เป็น birthTime แสดงผล (เหมือน loadBirth) + calcBazi 3p (honest null)
 *   - dayBoundary ของ guest = "23:00" (classical default · UI ไม่มีช่องเลือก — document ให้ทีม UI)
 *   - ชื่อ default "ดวงชั่วคราว 1/2/..." · lat/lng default กรุงเทพ 13.7563/100.5018
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { calcBazi, type BaziAnalysis } from "../bazi-calc";
import { buildChartExtensions } from "../chart-extensions";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "../chart-packet";
import { computeQiyunLock } from "../bazi-qiyun";
import { computeSiLingDays } from "../chart-table";
import { boundaryWarning3p, monthPillarBoundary } from "../bazi-boundary";
import { loadPromptKV } from "../prompt-md";
import { DISCIPLINES } from "./disciplines";
import { FUSION_PANEL_PROMPT_MAX_CHARS, sanitizePromptInline, normalizeTimezoneLabel } from "./build-prompt";
import { NEW_LANG_NAME_TH, LANG_ANSWER_DIRECTIVE } from "../sifu-answer-lang"; // r414-i18n9

/* ── ค่าคงที่แปลไทย (self-contained ตามแบบ resonance.ts/bazi-synastry.ts — ไม่ import จาก route LOCKED) ── */
const STEM_ELEMENT_MAP: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY_MAP: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
const DM_LABEL_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
const DM_POLARITY_TH: Record<string, string> = { yang: "หยาง", yin: "หยิน" };
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};
const LANG_NAME: Record<string, string> = { th: "ไทย", en: "อังกฤษ", zh: "จีน", ...NEW_LANG_NAME_TH }; // r414-i18n9: additive (th/en/zh ค่าเดิม)

export const GUEST_MAX_BIRTHS = 4;
const DEFAULT_LAT = 13.7563;
const DEFAULT_LNG = 100.5018;

/** shape ที่เก็บลง fusion5_jobs.guest_births (jsonb · ไม่มี PII เกินจำเป็น: ชื่อเล่น+วันเวลา+พิกัด) + คืน GET ให้ UI วาดชื่อ */
export type GuestBirthStored = {
  name: string;
  birthDate: string;            // YYYY-MM-DD
  birthTime: string | null;     // HH:MM · null = ไม่ทราบเวลา (hasTime=false)
  gender: "M" | "F";
  lat: number;
  lng: number;
  place: string | null;
};

export type GuestParseResult =
  | { ok: true; list: GuestBirthStored[] }
  | { ok: false; error: string; index: number };

/** ค่าที่ buildGuestFusionBirth คืน — route spread เข้า FusionBirthData ได้ตรงๆ */
export type GuestComputedBirth = {
  profileId: null;
  isGuest: true;
  name: string;
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  gender: "M" | "F";
  /* r510-tz: เดิมล็อก literal "Asia/Bangkok" — เปิดเป็น string เพื่อรองรับดวงต่างประเทศ (ค่า default ยังกรุงเทพ) */
  timezone: string;
  /* r510-tz: ชื่อสถานที่เกิดที่ user กรอก (GuestBirthStored.place) — ส่งต่อเข้า prompt */
  place?: string;
  birthDate: string;
  birthTime: string;            // "12:00" เมื่อไม่ทราบเวลา (convention loadBirth เดิม)
  dayBoundary: "23:00";
  relationshipType: string;
  isSelf: false;
  baziPillars: { ge_ju: string | null; pillars: BaziAnalysis["pillars"]; day_boundary: "23:00" };
  yongshen: null;
  guestCalc: BaziAnalysis;      // in-memory เท่านั้น (worker ใช้สร้าง bazi prompt · ห้าม serialize ลง job)
};

function bangkokTodayISO(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function isRealDate(dateISO: string): boolean {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** validate + normalize guestBirths จาก body (additive) · ผิด = บอก index ที่ผิดชัด (400 ฝั่ง route) */
export function parseGuestBirths(raw: unknown): GuestParseResult {
  if (raw === undefined || raw === null) return { ok: true, list: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_guest_births", index: -1 };
  if (raw.length > GUEST_MAX_BIRTHS) return { ok: false, error: "too_many_births", index: -1 };
  const todayISO = bangkokTodayISO();
  const list: GuestBirthStored[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (!g || typeof g !== "object") return { ok: false, error: "invalid_guest_birth", index: i };
    const r = g as Record<string, unknown>;
    const birthDate = String(r.birthDate || r.birth_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !isRealDate(birthDate)) {
      return { ok: false, error: "invalid_guest_birth_date", index: i };
    }
    if (birthDate < "1900-01-01" || birthDate > todayISO) {
      return { ok: false, error: "guest_birth_date_out_of_range", index: i };
    }
    const timeRaw = r.birthTime ?? r.birth_time ?? null;
    let birthTime: string | null = null;
    if (timeRaw !== null && timeRaw !== undefined && String(timeRaw).trim() !== "") {
      const t = String(timeRaw).trim().slice(0, 5);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { ok: false, error: "invalid_guest_birth_time", index: i };
      birthTime = t;
    }
    const genderRaw = String(r.gender || "").trim().toLowerCase().charAt(0);
    if (genderRaw !== "m" && genderRaw !== "f") return { ok: false, error: "invalid_guest_gender", index: i };
    const gender: "M" | "F" = genderRaw === "f" ? "F" : "M";
    let lat = DEFAULT_LAT, lng = DEFAULT_LNG;
    if (r.lat !== undefined && r.lat !== null && String(r.lat) !== "") {
      const v = Number(r.lat);
      if (!Number.isFinite(v) || v < -90 || v > 90) return { ok: false, error: "invalid_guest_lat", index: i };
      lat = v;
    }
    if (r.lng !== undefined && r.lng !== null && String(r.lng) !== "") {
      const v = Number(r.lng);
      if (!Number.isFinite(v) || v < -180 || v > 180) return { ok: false, error: "invalid_guest_lng", index: i };
      lng = v;
    }
    const name = String(r.name || "").replace(/\s+/g, " ").trim().slice(0, 40) || `ดวงชั่วคราว ${i + 1}`;
    const place = String(r.place || "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
    list.push({ name, birthDate, birthTime, gender, lat, lng, place });
  }
  return { ok: true, list };
}

/** guest → birth data พร้อมเสาปาจื้อจาก calcBazi() (Layer 1 single source · ห้าม inline tyme)
 *  shape baziPillars ทำให้เหมือน profiles.bazi_pillars jsonb จริง: {ge_ju,pillars:{year,month,day,hour|null},day_boundary}
 *  → unwrapBaziPillars (pair synastry) / resParsePillars (resonance R4-R6, day-sniper) อ่านได้ทันที */
export async function buildGuestFusionBirth(gs: GuestBirthStored): Promise<GuestComputedBirth> {
  const hasTime = gs.birthTime !== null;
  const time = gs.birthTime || "12:00"; // noon convention เดิม (แสดงผล/ผัง astro · เสาปาจื้อใช้ 3p honest null)
  const dtUTC = new Date(`${gs.birthDate}T${time}:00+07:00`);
  if (isNaN(dtUTC.getTime())) throw new Error("guest_birth_invalid_datetime");
  const calc = hasTime
    ? await calcBazi({ date: gs.birthDate, time, longitude: gs.lng, gmtOffsetHours: 7, gender: gs.gender, dayBoundary: "23:00", birthTimeKnown: true })
    : await calcBazi({ date: gs.birthDate, longitude: gs.lng, gmtOffsetHours: 7, gender: gs.gender, birthTimeKnown: false });
  return {
    profileId: null,
    isGuest: true,
    name: gs.name,
    dtUTC,
    lat: gs.lat,
    lng: gs.lng,
    hasTime,
    gender: gs.gender,
    timezone: "Asia/Bangkok",
    place: (gs.place || "").trim() || undefined, // r510-tz: ต่อท่อสถานที่เกิด guest เข้า prompt
    birthDate: gs.birthDate,
    birthTime: time,
    dayBoundary: "23:00",
    relationshipType: "ดวงชั่วคราว (กรอกสด · ไม่บันทึกเป็นโปรไฟล์)",
    isSelf: false,
    baziPillars: { ge_ju: calc.geJu.structure || null, pillars: calc.pillars, day_boundary: "23:00" },
    yongshen: null, // ไม่มี用神บันทึก → R5 สะพานธาตุข้ามสุภาพ (ห้ามเดา) · pair synastry yongEls=[]
    guestCalc: calc,
  };
}

/* ── คัมภีร์ปาจื้อสำหรับ guest panel: bazi-interaction-master.md (แก่นปฏิกิริยา · cache 60s) ── */
let canonCache: { text: string; hash: string; ts: number } | null = null;
function loadBaziCanon(): { text: string; hash: string } {
  const now = Date.now();
  if (canonCache && now - canonCache.ts < 60_000) return canonCache;
  let text = "";
  try {
    text = readFileSync(join(process.cwd(), "data/library/bazi-interaction-master.md"), "utf8");
  } catch { text = ""; }
  const hash = text ? createHash("sha256").update(text, "utf8").digest("hex") : "";
  canonCache = { text, hash, ts: now };
  return canonCache;
}

export type GuestBaziPromptArgs = {
  focus: GuestComputedBirth;
  allNames: string[];          // ชื่อทุกดวงในงาน (เรียงตามลำดับ births)
  question: string;
  lang?: string;
  timingLine?: string;         // บรรทัดจังหวะเวลา (timingNote จาก worker)
  notes?: string[];            // BAZI_DECISIVE_READING_NOTE + SUBJECT_LOCK/specificity จาก worker (ข้อความเดียวกับ profile path)
  pairPacket?: string;         // PAIR_INTERACTION_PACKET bazi (มีเมื่อ ≥2 ดวง)
  now?: Date;                  // เทส inject ได้
};

/** bazi panel prompt สำหรับ "ดวงชั่วคราว" — ส่งเป็น externalPrompt เข้า /api/sifu (fusion-internal)
 *  โครง: หัวซินแส+guard → คัมภีร์ปฏิกิริยา (ย่อได้เมื่อชนเพดาน) → FACT/PILLAR LOCK + packet canonical → pair → คำถาม → format
 *  เพดาน: FUSION_PANEL_PROMPT_MAX_CHARS − headroom (เผื่อ PRIOR_FUSION_THREAD_CONTEXT ~1.7K ที่ worker เติมหน้า prompt) */
export async function buildGuestBaziPanelPrompt(args: GuestBaziPromptArgs): Promise<string> {
  const { focus, question } = args;
  const lang = args.lang || "th";
  const bind = DISCIPLINES.bazi;
  const now = args.now || new Date();
  const calc = focus.guestCalc;
  const g = loadPromptKV("prompts/sifu-ctx-guards.md");
  const is3p = calc.mode === "3p";

  /* วัยจร/เรือน/ปฏิกิริยา — pipeline เดียวกับ buildBaziContext ฝั่ง profile (Layer 2 wrapper · ไม่แตะ engine LOCKED) */
  const qiyunLock = await computeQiyunLock({
    date: focus.birthDate, time: focus.birthTime, gender: focus.gender,
    lng: focus.lng, birthTimeKnown: focus.hasTime, dayBoundary: "23:00",
  });
  const startAge = qiyunLock.representativeStartAge ?? 0;
  const ext = buildChartExtensions(
    calc.pillars, now, focus.gender, focus.dtUTC, startAge,
    calc.geJu.structure || null, calc.strength.percent, calc.yongshen[0]?.element || null
  );
  const dm = calc.dayMaster;
  const ageNow = Math.max(0, now.getUTCFullYear() - focus.dtUTC.getUTCFullYear());
  const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
  const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
  const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
  const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;

  /* 通根 wrapper-7 (optional เหมือน route: พังคืน null ไม่ล้ม) */
  let rootedness: Parameters<typeof buildStructuredChartPacket>[5] = null;
  try {
    const w7 = await import("../../../data/library/wrappers/7-yongshen-v2.js") as unknown as {
      dmRootProfile: (n: unknown) => { dm_element: string; rootedness_label: string; is_extremely_weak: boolean; is_token_only: boolean };
      rootednessAll: (n: unknown) => Record<string, { rootedness_label: string }>;
    };
    const dmR = w7.dmRootProfile(calc.pillars);
    const allR = w7.rootednessAll(calc.pillars);
    const lab = (e: string) => (allR[e]?.rootedness_label || "no_root");
    rootedness = {
      dmElement: dmR.dm_element, dmLabel: dmR.rootedness_label,
      isExtremelyWeak: dmR.is_extremely_weak, isTokenOnly: dmR.is_token_only,
      all: { wood: lab("wood"), fire: lab("fire"), earth: lab("earth"), metal: lab("metal"), water: lab("water") },
    } as Parameters<typeof buildStructuredChartPacket>[5];
  } catch { rootedness = null; }

  const [slY, slMo, slD] = focus.birthDate.split("-").map(Number);
  const [slH, slMi] = focus.birthTime.split(":").map(Number);
  const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);
  const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, focus.gender, siLingDays, {
    dayBoundary: "23:00",
    dayBoundarySource: "default",
    monthBoundary: is3p ? monthPillarBoundary(focus.birthDate) : null,
    qiyunLock,
  });
  validateChartPacket(packet);

  const pillarLine = is3p
    ? `年${calc.pillarsZh.year} 月${calc.pillarsZh.month} 日${calc.pillarsZh.day} 時—(ไม่ทราบเวลาเกิด)`
    : `年${calc.pillarsZh.year} 月${calc.pillarsZh.month} 日${calc.pillarsZh.day} 時${calc.pillarsZh.hour}`;
  const ugTh = (arr: string[]) => (arr.length ? arr.map((e) => DM_LABEL_TH[e] || e).join("·") : "-");

  const buildChartLines = (renderOpts: { includeTransitDrilldown?: boolean; includeTransitMonthlyDrilldown?: boolean }): string[] => [
    `=== ผังดวง ${focus.name} (ดวงชั่วคราว) ===`,
    `GUEST_NOTE: ดวงนี้เป็น "ดวงชั่วคราว" — ผู้ใช้กรอกวันเกิดสด ไม่ได้บันทึกเป็นโปรไฟล์ · ไม่มีข้อมูล用神ที่บันทึกไว้ในระบบ (บรรทัด YONG_LOCK ด้านล่างเป็นค่าจาก engine ของผังนี้เท่านั้น) · ห้ามอ้างประวัติ/บริบทเก่าของโปรไฟล์ใดๆ`,
    `ชื่อ: ${focus.name} · เพศ ${focus.gender} · อายุปัจจุบันประมาณ ${ageNow}`,
    /* r510-tz: ป้ายเขตเวลาตามดวงจริง (validate IANA · default กรุงเทพ) + สถานที่เกิดถ้ามี — place เป็นข้อความ user กรอก ล้าง+cap+ครอบเครื่องหมายคำพูดก่อนเสมอ (กัน prompt injection) */
    ((): string => {
      const gp = sanitizePromptInline(focus.place, 80);
      const gtz = normalizeTimezoneLabel(focus.timezone);
      const placeSeg = gp ? ` · สถานที่เกิด: "${gp}"` : "";
      return focus.hasTime
        ? `เกิด: ${focus.birthDate} ${focus.birthTime}${placeSeg} · lat ${focus.lat} lng ${focus.lng} · timezone ${gtz} · ขอบวัน 23:00 (default ดวงชั่วคราว)`
        : `เกิด: ${focus.birthDate} · ไม่ทราบเวลาเกิด (อ่านแบบ 3 เสา · ห้ามเดายาม)${placeSeg} · lat ${focus.lat} lng ${focus.lng} · timezone ${gtz}`;
    })(),
    `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement}${g.DM_FACT_LOCK ? ` · ${g.DM_FACT_LOCK}` : ""}`,
    `PILLAR LOCK (ก้าน/กิ่งทุกเสา · เวลาอ้างเสาใดให้คัดจากบรรทัดนี้ตรงๆ ห้ามประกอบ/เดาเอง): ${pillarLine}`,
    ...(g.DM_THAI_LOCK ? [g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh)] : []),
    `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
    `YONG_LOCK (engine ของผังนี้ · ดวงชั่วคราวไม่มี用神ที่ยืนยันจากชีวิตจริง — ให้บอกผู้ใช้ตามจริงถ้าคำตอบพึ่ง用神หนัก): ` +
      `engineรวม 用神=${ugTh(packet.usefulGods.yong)} · 喜=${ugTh(packet.usefulGods.xi)} · 忌=${ugTh(packet.usefulGods.ji)}` +
      (packet.structure.confidence ? ` · ความมั่นใจโครง=${packet.structure.confidence}` : ""),
    renderChartPrompt(packet, { subjectLabel: `${focus.name}·guest`, ...renderOpts }),
    ...(is3p ? [g.LIMIT_3P_QA || "", boundaryWarning3p(focus.birthDate)].filter(Boolean) : []),
  ];

  const canon = loadBaziCanon();
  const cap = FUSION_PANEL_PROMPT_MAX_CHARS - 2_000; // headroom ให้ PRIOR_FUSION_THREAD_CONTEXT ที่ worker เติมหน้า prompt
  const assemble = (canonText: string, truncated: boolean, chartLines: string[]) => {
    const L: string[] = [];
    L.push(`คุณคือซินแสผู้เชี่ยวชาญ "${bind.labelTh}" (${bind.labelZh})`);
    L.push(`อ่านดวงจาก "ผังที่ระบบคำนวณ" ด้านล่างเท่านั้น · ⚠️ ${bind.termGuard}`);
    L.push(`ห้ามเดาเสา/ก้าน/กิ่ง/ธาตุ/วัยจร · field ไหนไม่มีให้บอกว่าไม่มี · ตอบภาษา${LANG_NAME[lang] || "ไทย"}นำ`);
    if (LANG_ANSWER_DIRECTIVE[lang]) L.push(LANG_ANSWER_DIRECTIVE[lang]); // r414-i18n9: เฉพาะภาษาใหม่
    for (const n of args.notes || []) if (n && n.trim()) L.push(n.trim());
    if (args.timingLine && args.timingLine.trim()) L.push(args.timingLine.trim());
    if (canonText) {
      L.push(`\n=== คัมภีร์ปาจื้อ ปฏิกิริยาธาตุ/ก้านกิ่ง (หลักการตีความ — ใช้เป็นฐาน) ===`);
      L.push(canonText);
      L.push(`=== จบคัมภีร์ · hash=${canon.hash.slice(0, 16)} · chars=${canonText.length}${truncated ? " · truncated" : ""} ===`);
    }
    L.push("");
    L.push(chartLines.join("\n"));
    if (args.pairPacket && args.pairPacket.trim()) {
      L.push(`\n${args.pairPacket.trim()}`);
      L.push(`\n=== ดูคู่ ===\nกำลังอ่านฝั่ง "${focus.name}" ในกลุ่ม ${args.allNames.map((n) => `"${n}"`).join(" กับ ")} · ใช้เฉพาะ PAIR_INTERACTION_PACKET bazi เป็นรายการปฏิกิริยาข้ามคน ห้ามสร้างคู่เพิ่มเอง · แยกแรงหนุนกับแรงเสียดทานให้ชัด`);
    } else {
      L.push(`\n=== โหมดเดี่ยว ===\nมีผังเดียวโดยเจตนา · อย่านับ "ไม่มีดวงคู่/ไม่มีปฏิกิริยาข้ามสองผัง" เป็นข้อมูลขาดของการดูดวงเดี่ยว เว้นแต่คำถามผู้ใช้ถามเรื่องดูคู่/สมพงษ์โดยตรง`);
    }
    L.push(`\n=== คำถามผู้ถาม ===\n${question}`);
    L.push([
      "",
      "รูปแบบการจัดหน้า (บังคับ · หน้าเว็บ render markdown):",
      "- ใช้หัวข้อ ## คั่นแต่ละส่วน · เว้นบรรทัดว่างระหว่างย่อหน้า ห้ามเขียนติดกันเป็นพืด",
      "- ถ้าเทียบหลายรายการ/หลายเดือน/หลายปี/หลายคน ตั้งแต่ 3 แถวขึ้นไป ต้องใช้ตาราง markdown",
      "- หลักฐานหลายจุดใช้ bullet (- ) จุดละบรรทัด · เน้นคำสำคัญ/วันที่/ชื่อเสาด้วย **ตัวหนา**",
      "รูปแบบตอบบังคับ:",
      `1) ฟันธงเฉพาะ ${focus.name} 1-2 ประโยค ห้ามขึ้นต้นด้วยภาพรวมทั่วไป`,
      `2) หลักฐานเฉพาะจากผังอย่างน้อย ${args.pairPacket ? 6 : 5} จุด (ก้าน/กิ่ง/เสา/วัยจร/ปฏิกิริยาจริงจาก packet) แต่ละจุดโยงกับคำถามโดยตรง`,
      "3) คำตอบตรงคำถามแบบลงลึก ไม่ใช่สรุปกว้างทุกมิติ",
      "4) คำแนะนำปฏิบัติ 3 ข้อ ที่สัมพันธ์กับหลักฐานดวง",
      "ห้ามพูดคำว่า packet/engine/prompt/CLI/คัมภีร์ในคำตอบ",
    ].join("\n"));
    return L.join("\n");
  };

  /* งบพื้นที่ (เพดาน 118K-2K): คัมภีร์ย่อก่อน → ตัด drilldown จรรายเดือน → ตัด drilldown จรทั้งชุด →
   * สุดท้ายถ้ายังเกิน ตัด "กลาง" prompt พร้อม marker (หัว=กติกา/LOCK · ท้าย=คำถาม+format ต้องรอด — ห้ามตัดท้ายทิ้ง) */
  const renderLevels: Array<{ includeTransitDrilldown?: boolean; includeTransitMonthlyDrilldown?: boolean }> = [
    {},
    { includeTransitMonthlyDrilldown: false },
    { includeTransitDrilldown: false },
  ];
  let out = "";
  for (const lvl of renderLevels) {
    const chartLines = buildChartLines(lvl);
    let canonBudget = Math.min(canon.text.length, 56_000);
    out = assemble(canon.text.slice(0, canonBudget), canonBudget < canon.text.length, chartLines);
    while (out.length > cap && canonBudget > 4_000) {
      canonBudget = Math.max(4_000, canonBudget - (out.length - cap + 2_000));
      out = assemble(canon.text.slice(0, canonBudget), true, chartLines);
    }
    if (out.length <= cap) return withLangTail(out);
  }
  const marker = `\n[TRUNCATED_NONCRITICAL_MIDDLE_FOR_PROMPT_CAP originalChars=${out.length}]\n`;
  const headBudget = 12_000;
  const tailBudget = cap - headBudget - marker.length;
  return withLangTail(`${out.slice(0, headBudget)}${marker}${out.slice(-tailBudget)}`);

  // r414-i18n9: ย้ำ directive ภาษาใหม่ท้าย prompt (th/en/zh ไม่มี entry = byte-identical)
  function withLangTail(p: string): string {
    return LANG_ANSWER_DIRECTIVE[lang] ? `${p}\n\n${LANG_ANSWER_DIRECTIVE[lang]}` : p;
  }
}
