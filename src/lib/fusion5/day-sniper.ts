/**
 * fusion5 · r373 "Day Sniper" — ชี้เป้า "วันลั่นไก" ระดับวัน จาก 3 เข็มนาฬิกาอิสระ
 * =====================================================================
 * แนวคิด: วันเตือน/วันโอกาสที่น่าเชื่อ = วันที่ "นาฬิกาอิสระ ≥2 เรือน" ชี้เป้า natal เดียวกันพร้อมกัน
 *   A. 流日 (day ganzhi 60 วัน) vs เสา natal — นาฬิกาเลขคณิตล้วน (ไม่แชร์ฟิสิกส์กับดวงจันทร์/อาทิตย์)
 *   B. จันทร์จริงทำมุม exact กับองศา natal — เข็มเร็วท้องฟ้าจริง (~13°/วัน · geocentric)
 *   C. ดาวช้าจริงทำมุม exact (reuse buildWesternTimeline — คำนวณอยู่แล้ว)
 * ความอิสระของ A กับ B คือหัวใจ: ปฏิทิน 60 วันไม่ได้ derive จากวงโคจรจันทร์ → 2 เข็มตรงกัน = ไม่ใช่เหตุบังเอิญเชิงระบบ
 *
 * deterministic ล้วน (engine คำนวณ → AI แค่ตีความ · กฎข้อ 9 AGENTS.md) · ไม่มี weight แต่งเอง —
 * ใช้การนับเชิงโครงสร้าง (จำนวนเข็มอิสระ) + ประเภทปฏิกิริยาตามตำราเท่านั้น
 *
 * ── canon ที่กฎอ้างอิง (ห้ามแต่งกฎเกินนี้) ──────────────────────────────
 *  · 六合 คู่รวมดิน:      data/library/sifu-extra/bazi-hechong-resolution.md:24  《子平真詮·論刑沖會合解法》「並對為合」
 *  · 三合局/三合半:       data/library/sifu-extra/bazi-hechong-resolution.md:25,143-154 (三合半局 = สองตัวในวง 申子辰/亥卯未/寅午戌/巳酉丑)
 *  · 六沖:                data/library/sifu-extra/bazi-hechong-resolution.md:28  「斜對為沖，擊射之意也」
 *  · 三刑/自刑:           data/library/sifu-extra/bazi-hechong-resolution.md:189-192 (寅巳申·丑戌未·子卯·自刑辰午酉亥 · 任鐵樵ลดน้ำหนัก刑 → จัดเป็นสัญญาณรอง)
 *  · 六害:                data/library/sifu-extra/bazi-hechong-resolution.md:200 「沖我合神，故為之害」(任鐵樵ลดน้ำหนัก → สัญญาณรอง)
 *  · 伏吟:                data/library/sifu-extra/bazi-hechong-resolution.md:367,447-460 《三命通會·總論歲運》「歲運壓日，謂之伏吟…不為吉兆」
 *  · 應期 = หน้าต่างเวลา ไม่ใช่วันลอย ๆ + 空亡冲填(沖起/填實):
 *                          data/library/qmdj/auth-th/yingqi-timing-th.md:8,22-23,35
 *  · ห้ามฟันวันเป๊ะโดยไม่มีหลักฐาน activation ระดับวัน/เดือน:
 *                          data/library/sifu-authority/bazi-authority-yingqi-timing.md:20-39
 *  · เสา↔เรื่องชีวิต (palace-topic): src/lib/chart-packet.ts:711-717 TOPIC_LITE (ปี=ภาพรวม/วัยเด็ก ·
 *    เดือน=อาชีพ/พ่อแม่ · วัน=ตัวตน/คู่ครอง · ยาม=ลูก/บั้นปลาย) + :992-994 (配偶=日支 · 父/母=月柱)
 *  · topic → ดาว/เรือนฝรั่ง: ย่อจาก src/lib/astro/western/packet.ts:274-363 buildTopicLordMatrix
 *  · polarity ดาวช้า: แนวเดียวกับ src/lib/fusion5/resonance.ts:226-230 (Jupiter ทับ/ตรีโกณ=ดี · หนัก+ฉาก/เล็ง=กด)
 *
 * ── การจัดธง (นับโครงสร้าง · ไม่มีคะแนนแต่งเอง) ──────────────────────────
 *  🔴 = เข็มอิสระ ≥2 ฝั่งเตือนชี้วันเดียวกัน: (A เตือน + B เตือน) | (A เตือน + C เตือน) | (B เตือน + C เตือน)
 *  🟡 = สัญญาณแรงเดี่ยว: A แรง (沖/伏吟 — ตำราจัดเป็นปฏิกิริยาแรงสุดของกิ่ง) หรือ C exact เดี่ยว
 *  🟢 = A ฝั่งดี (六合/三合半) + B จันทร์มุมดี (△/✶) ถึงศุภเคราะห์กำเนิด (Jupiter/Venus) วันเดียวกัน
 *  刑/害 = สัญญาณรอง (任鐵樵ลดน้ำหนัก · hechong-resolution.md:192,200) → ร่วมเป็นเข็ม A ฝั่งเตือนได้
 *    แต่ลำพังไม่ติดธง · 值 (กิ่งซ้ำแต่ก้านไม่ซ้ำ) = บริบท ไม่นับเข็ม
 */
import { SolarTime } from "tyme4ts";
import { eclipticLon } from "../astro-core/ephemeris";
import { wrap180 } from "../astro-core/events";
import { westernChart, SIGN_RULER, type Gender, type WesternChart } from "../astro/western/engine";
import { buildWesternTimeline, type WesternTimeline } from "../astro/western/timeline";
import { getVoidWindowsForDate } from "../luck-engine/modules/moon-void";
import { resParsePillars, type ResonanceBirth } from "./resonance";
import type { FusionTimingReference } from "./build-prompt";

export type DaySniperBirth = ResonanceBirth;

const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;
export const DAY_SNIPER_MAX_DAYS = 92;
export const DAY_SNIPER_MAX_FLAGGED = 20;
export const DAY_SNIPER_BLOCK_MAX_CHARS = 2_500;

/* ==================== ตารางกิ่ง (ค่าคงที่ตำรา · self-contained ตามแบบ resonance.ts/pair-interactions — ไม่แตะ engine LOCKED) ==================== */
const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
/** 六合 · hechong-resolution.md:24 「並對為合」 */
const LIUHE: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
/** 六沖 · hechong-resolution.md:28 「斜對為沖」 */
const CLASH: Record<string, string> = { 子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅", 卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳" };
/** 六害 · hechong-resolution.md:200 「沖我合神，故為之害」 */
const HARM: Record<string, string> = { 子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅", 卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉" };
/** 三合局 4 วง · hechong-resolution.md:25 (สองตัวในวง = 三合半 · :154) */
const SANHE: string[][] = [["申", "子", "辰"], ["亥", "卯", "未"], ["寅", "午", "戌"], ["巳", "酉", "丑"]];
/** 三刑 · hechong-resolution.md:189 (寅巳申 · 丑戌未 · 子卯) + 自刑 辰午酉亥 (:189-192) */
const XING_PAIRS: Array<[string, string]> = [["寅", "巳"], ["巳", "申"], ["申", "寅"], ["丑", "戌"], ["戌", "未"], ["未", "丑"], ["子", "卯"], ["卯", "子"]];
const SELF_XING = new Set(["辰", "午", "酉", "亥"]);
const inSanheHalf = (a: string, b: string) => a !== b && SANHE.some((g) => g.includes(a) && g.includes(b));

const PILLAR_TH: Record<SniperPillarKey, string> = { year: "เสาปี", month: "เสาเดือน", day: "เสาวัน", hour: "เสายาม" };

/* ==================== ชนิดข้อมูล ==================== */
export type SniperPillarKey = "year" | "month" | "day" | "hour";
export type SniperTopicKey = "generic" | "health" | "partner" | "parents" | "children" | "contract" | "travel" | "money" | "career";

export type SniperBaziTarget = { pillarKey: SniperPillarKey; stem: string; branch: string; labelTh: string };
export type SniperDegreeTarget = { name: string; nameTh: string; lon: number };

export type SniperTargets = {
  topicKey: SniperTopicKey;
  topicTh: string;
  bazi: SniperBaziTarget[];              // เสาเป้า (จาก DB bazi_pillars · ไม่คำนวณใหม่ — Layer 0/1 LOCKED)
  western: SniperDegreeTarget[];         // องศา natal เป้าฝั่งเตือน (เข็ม B/C)
  benefic: SniperDegreeTarget[];         // ศุภเคราะห์กำเนิด (Jupiter/Venus) สำหรับวันโอกาส 🟢
  notes: string[];                       // เช่น ไม่มีเวลาเกิด → ตัดลัคนา/เจ้าเรือน
};

export type SniperARel = {
  rule: "沖" | "伏吟" | "刑" | "害" | "六合" | "三合半" | "值";
  strength: "strong_warning" | "warning" | "positive" | "context";
  pillarKey: SniperPillarKey;
  detail: string;                        // "流日辛巳 沖(巳亥) เสาวัน(己亥)"
  canonRef: string;                      // ป้ายอ้างตำราแบบสั้น
};
export type SniperBHit = {
  targetName: string;
  targetTh: string;
  aspect: "conjunction" | "square" | "opposition" | "trine" | "sextile";
  polarity: "warning" | "benefic";
  timeTH: string;                        // "2026-05-07 14:22" (เวลาไทย)
  detail: string;
};
export type SniperCHit = {
  transit: string;
  natal: string;
  aspect: string;
  polarity: "warning" | "benefic" | "neutral";
  dateISO: string;
  detail: string;
};

export type SniperDay = {
  dateISO: string;                       // วันไทย (Bangkok wall date)
  ganzhi: string;                        // 流日 เช่น 辛巳
  flag: "red" | "yellow" | "green";
  needles: Array<"A" | "B" | "C">;       // เข็มอิสระที่ร่วมยิงวันนี้
  a: SniperARel[];
  b: SniperBHit[];
  c: SniperCHit[];
  context: string[];                     // ธงบริบท (ไม่นับเข็ม): จันทร์ว่าง/คราส/ดาวหยุดนิ่ง
};

export type DaySniperPerson = {
  name: string;
  skippedNote: string | null;
  targets: SniperTargets | null;
  days: SniperDay[];                     // เรียงตามวันที่ (คัด rank แล้ว cap 20)
  totals: { red: number; yellow: number; green: number };
  droppedCount: number;                  // วันติดธงที่ถูกคัดออกเพราะเกิน cap
  scannedDays: number;
};

export type DaySniperResult = {
  version: "day_sniper_v1";
  fromISO: string;
  toISO: string;
  topicKey: SniperTopicKey;
  topicTh: string;
  perPerson: DaySniperPerson[];
  notes: string[];
  computeMs: number;
};

/* ==================== topic จากคำถาม ==================== */
const TOPIC_TH: Record<SniperTopicKey, string> = {
  generic: "ภาพรวม", health: "สุขภาพ", partner: "คู่ครอง", parents: "พ่อแม่", children: "ลูก",
  contract: "สัญญา/ตกลง", travel: "เดินทาง", money: "การเงิน", career: "การงาน",
};
/** ลำดับ match มีผล (คำเฉพาะก่อนคำกว้าง) — deterministic first-match */
const TOPIC_PATTERNS: Array<[SniperTopicKey, RegExp]> = [
  ["health", /สุขภาพ|ป่วย|ผ่าตัด|โรค|ร่างกาย|อุบัติเหตุ|health|surgery|illness|疾|病/i],
  ["partner", /คู่ครอง|แฟน|สามี|ภรรยา|แต่งงาน|สมพงษ์|ความรัก|คู่|love|marri|spouse|婚|夫|妻/i],
  ["parents", /พ่อแม่|บิดา|มารดา|พ่อ|แม่|parent|父母/i],
  ["children", /ลูก|บุตร|child|子女/i],
  ["contract", /สัญญา|เซ็น|ลงนาม|ดีล|contract|deal|立約|合同|签/i],
  ["travel", /เดินทาง|ต่างประเทศ|ต่างแดน|ย้ายบ้าน|ย้ายงาน|travel|abroad|relocat|遷|出行|搬/i],
  ["money", /เงิน|ทรัพย์|รายได้|หุ้น|ลงทุน|หนี้|กำไร|money|wealth|invest|debt|財|钱/i],
  ["career", /งาน|อาชีพ|ตำแหน่ง|เลื่อนขั้น|ธุรกิจ|career|job|work|business|官|事業|事业/i],
];
export function resolveSniperTopic(question: string): SniperTopicKey {
  const q = String(question || "");
  for (const [key, re] of TOPIC_PATTERNS) if (re.test(q)) return key;
  return "generic";
}

/** topic → เสาปาจื้อเป้า · อ้าง chart-packet.ts:711-717 TOPIC_LITE + :992-994 (配偶=日支 · 父母=月柱) — ห้ามตีความเกินนี้ */
const TOPIC_PILLARS: Record<SniperTopicKey, SniperPillarKey[]> = {
  generic: ["year", "month", "day", "hour"],
  health: ["day"],                        // ตัวตน/ร่างกาย = 日柱 (TOPIC_LITE day="ตัวตน")
  partner: ["day"],                       // 配偶=日支 (chart-packet.ts:992)
  parents: ["year", "month"],             // 父/母=月柱 (chart-packet.ts:993-994) + ปี=รากวัยเด็ก (TOPIC_LITE year)
  children: ["hour"],                     // ยาม=ลูก (TOPIC_LITE hour)
  contract: ["month", "day"],             // อาชีพ/อำนาจ=เดือน + ตัวผู้เซ็น=วัน (TOPIC_LITE month/day)
  travel: ["day"],                        // ไม่มีเสาเฉพาะเรื่องเดินทางใน TOPIC_LITE → ใช้ตัวเจ้าชะตา (วัน) เท่านั้น (ไม่แต่งเสาเพิ่ม)
  money: ["day"],                         // ทรัพย์ทาบตัวเจ้าชะตา (財 = 我克 · ไม่มีเสาทรัพย์ตรงใน TOPIC_LITE → ใช้เสาวัน)
  career: ["month"],                      // เดือน=อาชีพ (TOPIC_LITE month)
};

/* ==================== resolveTargets ==================== */
const NAME_TH: Record<string, string> = {
  Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร",
  Jupiter: "พฤหัส", Saturn: "เสาร์", Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
  Ascendant: "ลัคนา", MC: "กลางฟ้า", "Part of Fortune": "จุดโชค", Rahu: "ราหู", Ketu: "เกตุ",
};

function planetLon(chart: WesternChart, name: string): number | null {
  const p = chart.planets.find((x) => x.name === name);
  return p ? p.lon : null;
}
/** เจ้าเรือน (whole-sign จากลัคนา · SIGN_RULER เดียวกับ timeline.ts) — null เมื่อไม่มีเวลาเกิด */
function houseLordLon(chart: WesternChart, house: number): { name: string; lon: number } | null {
  if (chart.ascendant === null) return null;
  const sign = (Math.floor(chart.ascendant / 30) + house - 1) % 12;
  const ruler = SIGN_RULER[sign];
  const lon = planetLon(chart, ruler);
  return lon === null ? null : { name: ruler, lon };
}

/** topic → องศา natal ฝั่งตะวันตก · ย่อจาก packet.ts buildTopicLordMatrix (:274-363) — จุดที่ตำราให้เป็นตัวแทนเรื่องนั้น */
function westernTargetsFor(topic: SniperTopicKey, chart: WesternChart): { targets: SniperDegreeTarget[]; notes: string[] } {
  const notes: string[] = [];
  const add = (map: Map<string, SniperDegreeTarget>, name: string, lon: number | null) => {
    if (lon === null || map.has(name)) return;
    map.set(name, { name, nameTh: NAME_TH[name] || name, lon });
  };
  const m = new Map<string, SniperDegreeTarget>();
  const lord = (h: number) => {
    const l = houseLordLon(chart, h);
    if (l) add(m, l.name, l.lon);
  };
  const noTime = !chart.hasBirthTime || chart.ascendant === null;
  if (noTime) notes.push("ไม่ทราบเวลาเกิด — ตัดลัคนา/MC/เจ้าเรือน/จุดโชคออกจากเป้า (องศาดาวยังใช้ได้)");

  switch (topic) {
    case "health": // packet.ts:349-360 (1st/6th lord + Moon/Saturn/Mars)
      add(m, "Moon", planetLon(chart, "Moon"));
      add(m, "Saturn", planetLon(chart, "Saturn"));
      add(m, "Mars", planetLon(chart, "Mars"));
      if (!noTime) { add(m, "Ascendant", chart.ascendant); lord(1); lord(6); }
      break;
    case "partner": // packet.ts:314-325 (7th lord + Venus/Mars + ตัวแทนคู่ตามเพศ F→Sun M→Moon · Ptolemy Book 4)
      add(m, "Venus", planetLon(chart, "Venus"));
      add(m, "Mars", planetLon(chart, "Mars"));
      add(m, chart.gender === "F" ? "Sun" : "Moon", planetLon(chart, chart.gender === "F" ? "Sun" : "Moon"));
      if (!noTime) lord(7);
      break;
    case "parents": // เรือน4=บ้าน/ครอบครัว (ธีมเดียวกับ resonance.ts RESONANCE_THEMES home) + Sun/Moon ตัวแทนพ่อแม่คลาสสิก
      add(m, "Sun", planetLon(chart, "Sun"));
      add(m, "Moon", planetLon(chart, "Moon"));
      if (!noTime) lord(4);
      break;
    case "children": // packet.ts:326-336 (5th lord + Jupiter/Venus/Sun)
      add(m, "Jupiter", planetLon(chart, "Jupiter"));
      add(m, "Venus", planetLon(chart, "Venus"));
      add(m, "Sun", planetLon(chart, "Sun"));
      if (!noTime) lord(5);
      break;
    case "contract": // packet.ts:319 (เรือน7=คู่สัญญา) + Mercury (ทักษะสื่อสาร/ธุรกิจ :296)
      add(m, "Mercury", planetLon(chart, "Mercury"));
      if (!noTime) lord(7);
      break;
    case "travel": // packet.ts:337-347 (9th lord + Jupiter/Sun)
      add(m, "Jupiter", planetLon(chart, "Jupiter"));
      add(m, "Sun", planetLon(chart, "Sun"));
      if (!noTime) lord(9);
      break;
    case "money": // packet.ts:300-313 (2nd/8th/11th lord + Venus/Jupiter + Lot of Fortune)
      add(m, "Venus", planetLon(chart, "Venus"));
      add(m, "Jupiter", planetLon(chart, "Jupiter"));
      if (!noTime) { lord(2); lord(8); lord(11); }
      if (chart.partOfFortune) add(m, "Part of Fortune", chart.partOfFortune.lon);
      break;
    case "career": // packet.ts:288-299 (10th lord + Sun/Saturn/Mercury + MC)
      add(m, "Sun", planetLon(chart, "Sun"));
      add(m, "Saturn", planetLon(chart, "Saturn"));
      add(m, "Mercury", planetLon(chart, "Mercury"));
      if (!noTime) { add(m, "MC", chart.mc); lord(10); }
      break;
    default: { // generic: Sun/Moon/Asc/Mars/chart ruler (spec r373)
      add(m, "Sun", planetLon(chart, "Sun"));
      add(m, "Moon", planetLon(chart, "Moon"));
      add(m, "Mars", planetLon(chart, "Mars"));
      if (!noTime) add(m, "Ascendant", chart.ascendant);
      const ruler = chart.chartRuler?.ruler;
      if (ruler) add(m, ruler, planetLon(chart, ruler));
      break;
    }
  }
  return { targets: [...m.values()], notes };
}

/** targets ทั้ง 2 กรอบ (ปาจื้อจาก DB + องศาฝรั่งจาก engine) — chart คำนวณครั้งเดียวต่อคนโดย caller */
export function resolveTargets(question: string, b: DaySniperBirth, chart: WesternChart): SniperTargets {
  const topicKey = resolveSniperTopic(question);
  const notes: string[] = [];
  // ---- bazi pillars จาก DB (profiles.bazi_pillars · shape {pillars:{year..}} — resParsePillars รองรับแล้ว) ----
  const pillars = resParsePillars(b.baziPillars);
  const bazi: SniperBaziTarget[] = [];
  if (!pillars) {
    notes.push("โปรไฟล์ไม่มี bazi_pillars ใน DB — เข็ม A (流日) ปิดสำหรับคนนี้ (ไม่คำนวณเสาใหม่เอง)");
  } else {
    for (const key of TOPIC_PILLARS[topicKey]) {
      const p = pillars[key];
      if (p) bazi.push({ pillarKey: key, stem: p.stem, branch: p.branch, labelTh: PILLAR_TH[key] });
      else if (key === "hour") notes.push("ไม่มีเสายาม (ไม่ทราบเวลาเกิด) — ข้ามเป้าเสายาม");
    }
  }
  // ---- western degrees ----
  const { targets: western, notes: wNotes } = westernTargetsFor(topicKey, chart);
  notes.push(...wNotes);
  // ---- ศุภเคราะห์กำเนิด (เป้า 🟢) — Jupiter/Venus ตามขนบ benefics ----
  const benefic: SniperDegreeTarget[] = [];
  for (const name of ["Jupiter", "Venus"]) {
    const lon = planetLon(chart, name);
    if (lon !== null) benefic.push({ name, nameTh: NAME_TH[name], lon });
  }
  return { topicKey, topicTh: TOPIC_TH[topicKey], bazi, western, benefic, notes };
}

/* ==================== เข็ม A · 流日 ganzhi ==================== */

/** day ganzhi ของวันไทย (wall date) — tyme4ts + noon anchor แบบเดียวกับ bazi-calc.ts 3p path (:128-137)
 *  (เที่ยงวัน = พ้นขอบยาม子ทั้งสองข้าง · day_boundary ไม่มีผลกับ "วัน ganzhi ของ date กลางวัน") */
export function dayGanzhiOf(dateISO: string): { stem: string; branch: string; name: string } {
  const [y, m, d] = dateISO.split("-").map(Number);
  const name = SolarTime.fromYmdHms(y, m, d, 12, 0, 0).getLunarHour().getEightChar().getDay().getName();
  return { stem: name[0], branch: name[1], name };
}

/** ปฏิกิริยา 流日 vs เสาเป้า 1 เสา — เฉพาะชนิดที่ตำรารองรับ (ดู canon หัวไฟล์) · ห้ามเพิ่มชนิดเอง */
export function relationsVsPillar(dayStem: string, dayBranch: string, t: SniperBaziTarget): SniperARel[] {
  const out: SniperARel[] = [];
  const gz = dayStem + dayBranch;
  const base = `流日${gz}`;
  const tgt = `${t.labelTh}(${t.stem}${t.branch})`;
  if (dayStem === t.stem && dayBranch === t.branch) {
    out.push({ rule: "伏吟", strength: "strong_warning", pillarKey: t.pillarKey, detail: `${base} 伏吟ทับ${tgt} (干支ซ้ำทั้งเสา)`, canonRef: "三命通會·總論歲運「歲運壓日謂之伏吟」(hechong-resolution.md:367)" });
  }
  if (CLASH[t.branch] === dayBranch) {
    out.push({ rule: "沖", strength: "strong_warning", pillarKey: t.pillarKey, detail: `${base} ${t.branch}${dayBranch}沖 ${tgt}`, canonRef: "子平真詮·論刑沖會合解法「斜對為沖」(hechong-resolution.md:28)" });
  }
  if (LIUHE[t.branch] === dayBranch) {
    out.push({ rule: "六合", strength: "positive", pillarKey: t.pillarKey, detail: `${base} ${t.branch}${dayBranch}六合 ${tgt}`, canonRef: "子平真詮「並對為合」(hechong-resolution.md:24)" });
  }
  if (inSanheHalf(t.branch, dayBranch)) {
    out.push({ rule: "三合半", strength: "positive", pillarKey: t.pillarKey, detail: `${base} ${t.branch}${dayBranch}三合半 ${tgt}`, canonRef: "三合局 申子辰/亥卯未/寅午戌/巳酉丑 (hechong-resolution.md:25,154)" });
  }
  const xing = XING_PAIRS.some(([a, c]) => a === dayBranch && c === t.branch) || (dayBranch === t.branch && SELF_XING.has(dayBranch));
  if (xing) {
    out.push({ rule: "刑", strength: "warning", pillarKey: t.pillarKey, detail: `${base} ${dayBranch}刑${t.branch} ${tgt} (สัญญาณรอง)`, canonRef: "三刑/自刑 (hechong-resolution.md:189-192 · 任鐵樵ลดน้ำหนัก)" });
  }
  if (HARM[t.branch] === dayBranch) {
    out.push({ rule: "害", strength: "warning", pillarKey: t.pillarKey, detail: `${base} ${t.branch}${dayBranch}害 ${tgt} (สัญญาณรอง)`, canonRef: "六害「沖我合神故為之害」(hechong-resolution.md:200)" });
  }
  if (dayBranch === t.branch && dayStem !== t.stem) {
    out.push({ rule: "值", strength: "context", pillarKey: t.pillarKey, detail: `${base} กิ่งซ้ำ${tgt} (值 · บริบท ไม่นับเข็ม)`, canonRef: "值太歲 pattern (resonance.ts R6 · กิ่งเดียวกัน)" });
  }
  return out;
}

/* ==================== เข็ม B · จันทร์จริง (fine scan + bisect · แบบ moon-void.ts) ==================== */

const MOON_STEP_MS = 0.05 * DAY_MS; // จันทร์ ~13°/วัน → 0.05 วัน ≈ 0.65° ต่อ step (ห่างจุดตัดถัดไป ≥30° — ไม่มีทางข้าม 2 จุดใน step เดียว)
const moonLonAt = (ms: number) => eclipticLon("Moon", new Date(ms));

type MoonSampleSet = { t0: number; stepMs: number; lons: number[] };
function buildMoonSamples(fromMs: number, toMs: number): MoonSampleSet {
  const n = Math.ceil((toMs - fromMs) / MOON_STEP_MS) + 1;
  const lons = new Array<number>(n);
  for (let i = 0; i < n; i++) lons[i] = moonLonAt(fromMs + i * MOON_STEP_MS);
  return { t0: fromMs, stepMs: MOON_STEP_MS, lons };
}

/** bisect instant ที่ f ข้ามศูนย์ (ละเอียด <30s — จันทร์ 13°/วัน → คลาด <0.005°) */
function bisectMs(f: (ms: number) => number, a0: number, b0: number): number {
  let a = a0, b = b0, fa = f(a);
  for (let i = 0; i < 30 && b - a > 30_000; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

const CROSSINGS_BY_ANGLE: Record<number, number[]> = { 0: [0], 60: [60, 300], 90: [90, 270], 120: [120, 240], 180: [180] };
const ANGLE_TO_ASPECT: Record<number, SniperBHit["aspect"]> = { 0: "conjunction", 60: "sextile", 90: "square", 120: "trine", 180: "opposition" };

/** หา instant มุม exact จันทร์→องศา natal คงที่ ในช่วง [fromMs,toMs] · angles ⊂ {0,60,90,120,180}
 *  จันทร์ไม่มีถอยหลัง → rel เพิ่ม monotonic เสมอ · ตรวจข้ามศูนย์ระยะสั้น (|Δ|<90 กัน wrap หลอก) */
export function findMoonAspectHits(targetLon: number, angles: number[], fromMs: number, toMs: number, samples?: MoonSampleSet): Array<{ ms: number; angle: number }> {
  const s = samples || buildMoonSamples(fromMs, toMs);
  const out: Array<{ ms: number; angle: number }> = [];
  for (const angle of angles) {
    for (const v of CROSSINGS_BY_ANGLE[angle] || []) {
      const f = (ms: number) => wrap180(moonLonAt(ms) - targetLon - v);
      let prev = wrap180(s.lons[0] - targetLon - v);
      for (let i = 1; i < s.lons.length; i++) {
        const cur = wrap180(s.lons[i] - targetLon - v);
        if ((prev < 0) !== (cur < 0) && Math.abs(prev - cur) < 90) {
          const ms = bisectMs(f, s.t0 + (i - 1) * s.stepMs, s.t0 + i * s.stepMs);
          if (ms >= fromMs && ms <= toMs) out.push({ ms, angle });
        }
        prev = cur;
      }
    }
  }
  return out.sort((x, y) => x.ms - y.ms);
}

const ASPECT_SYM: Record<string, string> = { conjunction: "☌", square: "□", opposition: "☍", trine: "△", sextile: "✶" };
const bkkDateISO = (ms: number) => new Date(ms + BKK_MS).toISOString().slice(0, 10);
const bkkTimeTH = (ms: number) => new Date(ms + BKK_MS).toISOString().slice(0, 16).replace("T", " ");

/* ==================== เข็ม C · ดาวช้า (reuse timeline) ==================== */

/** polarity ดาวช้า — แนวเดียวกับ resonance.ts:226-230 ขยายให้ครอบ hard-aspect ทุกดาวช้า (ฉาก/เล็ง = ฝั่งกด)
 *  Jupiter ทับ/ตรีโกณ = ฝั่งดี · ดาวหนัก (Saturn/Mars/Pluto/Uranus/Neptune/Rahu) ทับ = ฝั่งกด · อื่น = กลาง */
function slowPolarity(transit: string, aspect: string): SniperCHit["polarity"] {
  const MALEFIC = ["Saturn", "Mars", "Pluto", "Uranus", "Neptune", "Rahu"];
  if (aspect === "square" || aspect === "opposition") return "warning";
  if (aspect === "conjunction") return MALEFIC.includes(transit) ? "warning" : transit === "Jupiter" ? "benefic" : "neutral";
  if (aspect === "trine") return transit === "Jupiter" ? "benefic" : "neutral";
  return "neutral";
}

/* ==================== scanDays (ต่อคน) ==================== */

function* eachDateISO(fromISO: string, toISO: string): Generator<string> {
  let t = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const end = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  for (; t <= end; t += DAY_MS) yield new Date(t).toISOString().slice(0, 10);
}

export function scanDays(b: DaySniperBirth, question: string, fromISO: string, toISO: string): DaySniperPerson {
  const name = b.name || "ดวง";
  // clamp ช่วงสแกน ≤92 วัน (deterministic — ตัดท้าย)
  const fromMsWall = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  let toMsWall = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  if ((toMsWall - fromMsWall) / DAY_MS + 1 > DAY_SNIPER_MAX_DAYS) toMsWall = fromMsWall + (DAY_SNIPER_MAX_DAYS - 1) * DAY_MS;
  const toISOc = new Date(toMsWall).toISOString().slice(0, 10);

  const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, (b.gender as Gender) || "M");
  const targets = resolveTargets(question, b, chart);

  // ---- B: จันทร์จริง (สแกนทั้งช่วงครั้งเดียว · จัดเข้าวันไทย) ----
  const scanFromMs = fromMsWall - BKK_MS;                 // 00:00 วันแรก (เวลาไทย) เป็น UTC
  const scanToMs = toMsWall + DAY_MS - BKK_MS;            // 24:00 วันสุดท้าย
  const samples = buildMoonSamples(scanFromMs, scanToMs);
  const bByDay = new Map<string, SniperBHit[]>();
  const pushB = (day: string, hit: SniperBHit) => (bByDay.get(day) ?? bByDay.set(day, []).get(day)!).push(hit);
  for (const t of targets.western) {
    for (const h of findMoonAspectHits(t.lon, [0, 90, 180], scanFromMs, scanToMs, samples)) {
      const aspect = ANGLE_TO_ASPECT[h.angle];
      pushB(bkkDateISO(h.ms), {
        targetName: t.name, targetTh: t.nameTh, aspect, polarity: "warning",
        timeTH: bkkTimeTH(h.ms), detail: `จันทร์${ASPECT_SYM[aspect]}${t.nameTh}กำเนิด ${bkkTimeTH(h.ms).slice(11)}น.`,
      });
    }
  }
  for (const t of targets.benefic) {
    for (const h of findMoonAspectHits(t.lon, [60, 120], scanFromMs, scanToMs, samples)) {
      const aspect = ANGLE_TO_ASPECT[h.angle];
      pushB(bkkDateISO(h.ms), {
        targetName: t.name, targetTh: t.nameTh, aspect, polarity: "benefic",
        timeTH: bkkTimeTH(h.ms), detail: `จันทร์${ASPECT_SYM[aspect]}${t.nameTh}กำเนิด ${bkkTimeTH(h.ms).slice(11)}น. (มุมดี)`,
      });
    }
  }

  // ---- C: ดาวช้า (reuse buildWesternTimeline ต่อปีที่ช่วงสแกนคาบ) ----
  const years = new Set<number>([+fromISO.slice(0, 4), +toISOc.slice(0, 4)]);
  const cByDay = new Map<string, SniperCHit[]>();
  const timelines: WesternTimeline[] = [];
  const westNames = new Set(targets.western.map((t) => t.name));
  for (const y of [...years].sort()) {
    const tl = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, y);
    timelines.push(tl);
    for (const h of tl.transitHits) {
      if (h.dateISO < fromISO || h.dateISO > toISOc) continue;
      // topic เฉพาะ: กรองเฉพาะจุด natal ในชุดเป้า · generic: ทุกจุดที่ timeline ติดตาม
      if (targets.topicKey !== "generic" && !westNames.has(h.natal)) continue;
      const polarity = slowPolarity(h.transit, h.aspect);
      (cByDay.get(h.dateISO) ?? cByDay.set(h.dateISO, []).get(h.dateISO)!).push({
        transit: h.transit, natal: h.natal, aspect: h.aspect, polarity, dateISO: h.dateISO,
        detail: `${h.transitTh}${h.aspectTh.split(" ")[0]}${h.natalTh}กำเนิด (exact ${h.dateISO})`,
      });
    }
  }

  // ---- เดินรายวัน: A + ประกอบธง ----
  type Ranked = { day: SniperDay; prio: number; needleCount: number; hasStrongA: number };
  const flagged: Ranked[] = [];
  let scanned = 0;
  for (const dateISO of eachDateISO(fromISO, toISOc)) {
    scanned++;
    const gz = dayGanzhiOf(dateISO);
    const a: SniperARel[] = [];
    for (const t of targets.bazi) a.push(...relationsVsPillar(gz.stem, gz.branch, t));
    const bHits = bByDay.get(dateISO) || [];
    const cHits = cByDay.get(dateISO) || [];

    const warnA = a.some((r) => r.strength === "strong_warning" || r.strength === "warning");
    const strongA = a.some((r) => r.strength === "strong_warning");
    const posA = a.some((r) => r.strength === "positive");
    const warnB = bHits.some((h) => h.polarity === "warning");
    const benB = bHits.some((h) => h.polarity === "benefic");
    const warnC = cHits.some((h) => h.polarity === "warning");

    // นับโครงสร้างล้วน (ดูกติกาหัวไฟล์) — ไม่มีคะแนนแต่งเอง
    let flag: SniperDay["flag"] | null = null;
    const needles: SniperDay["needles"] = [];
    if ((warnA && warnB) || (warnA && warnC) || (warnB && warnC)) {
      flag = "red";
      if (warnA) needles.push("A");
      if (warnB) needles.push("B");
      if (warnC) needles.push("C");
    } else if (posA && benB) {
      flag = "green";
      needles.push("A", "B");
    } else if (strongA || cHits.length > 0) {
      flag = "yellow";
      needles.push(strongA ? "A" : "C");
    }
    if (!flag) continue;
    flagged.push({
      day: { dateISO, ganzhi: gz.name, flag, needles, a, b: bHits, c: cHits, context: [] },
      prio: flag === "red" ? 0 : flag === "green" ? 1 : 2,
      needleCount: needles.length,
      hasStrongA: strongA ? 1 : 0,
    });
  }

  // ---- rank + cap 20 (deterministic): แดง > เขียว > เหลือง · เข็มมากก่อน · A แรงก่อน · วันเช้ากว่าก่อน ----
  flagged.sort((x, y) => x.prio - y.prio || y.needleCount - x.needleCount || y.hasStrongA - x.hasStrongA || x.day.dateISO.localeCompare(y.day.dateISO));
  const kept = flagged.slice(0, DAY_SNIPER_MAX_FLAGGED).map((r) => r.day).sort((x, y) => x.dateISO.localeCompare(y.dateISO));
  const droppedCount = flagged.length - kept.length;

  // ---- context flags (ไม่นับเข็ม) เฉพาะวันที่ติดธง — จันทร์ว่าง / คราส / ดาวหยุดนิ่ง ----
  for (const d of kept) {
    try {
      const voc = getVoidWindowsForDate(d.dateISO);
      if (voc.length) d.context.push(`จันทร์ว่าง ${voc.map((w) => `${bkkTimeTH(w.startMs).slice(11)}–${bkkTimeTH(w.endMs).slice(11)}`).join(", ")}`);
    } catch { /* บริบทเสริม — พังไม่ล้มงาน */ }
    for (const tl of timelines) {
      for (const e of tl.eclipses) if (e.dateISO === d.dateISO) d.context.push(`วันคราส${e.kind === "solar" ? "สุริยะ" : "จันทร์"}`);
      for (const s of tl.stations) if (s.dateISO === d.dateISO) d.context.push(`${s.bodyTh}หยุดนิ่ง(${s.type === "station_retrograde" ? "เริ่มถอย" : "กลับเดินหน้า"})`);
    }
  }

  const totals = {
    red: flagged.filter((r) => r.day.flag === "red").length,
    yellow: flagged.filter((r) => r.day.flag === "yellow").length,
    green: flagged.filter((r) => r.day.flag === "green").length,
  };
  return { name, skippedNote: null, targets, days: kept, totals, droppedCount, scannedDays: scanned };
}

/* ==================== entry หลัก ==================== */

export function buildDaySniper(
  births: DaySniperBirth[],
  question: string,
  fromISO: string,
  toISO: string,
  timeBudgetMs = 5_000,
): DaySniperResult {
  const t0 = Date.now();
  const topicKey = resolveSniperTopic(question);
  const perPerson: DaySniperPerson[] = [];
  // คน 1-2 (focus + คู่) — คนแรกคำนวณเสมอ · คนถัดไปข้ามถ้าเกินงบเวลา (แนวเดียวกับ buildResonance)
  for (let i = 0; i < Math.min(births.length, 2); i++) {
    const b = births[i];
    const name = b.name || `คนที่${i + 1}`;
    if (i > 0 && Date.now() - t0 > timeBudgetMs) {
      perPerson.push({ name, skippedNote: `ข้ามเพราะเกินงบเวลาคำนวณ day sniper (${timeBudgetMs / 1000}s) — มีผลเฉพาะดวง focus`, targets: null, days: [], totals: { red: 0, yellow: 0, green: 0 }, droppedCount: 0, scannedDays: 0 });
      continue;
    }
    try {
      perPerson.push(scanDays(b, question, fromISO, toISO));
    } catch (e) {
      perPerson.push({ name, skippedNote: `คำนวณไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 80) : "error"}`, targets: null, days: [], totals: { red: 0, yellow: 0, green: 0 }, droppedCount: 0, scannedDays: 0 });
    }
  }
  return {
    version: "day_sniper_v1",
    fromISO,
    toISO,
    topicKey,
    topicTh: TOPIC_TH[topicKey],
    perPerson,
    notes: [
      "เข็ม A(流日 60 วัน) กับ B(จันทร์จริง) เป็นนาฬิกาอิสระต่อกันจริง (เลขคณิต vs ดาราศาสตร์) — ตรงกัน = สัญญาณแข็ง",
      "應期ตามตำรา = หน้าต่างเวลา ไม่ใช่คำพิพากษาวันตายตัว (bazi-authority-yingqi-timing.md:20-39) — ใช้เป็นวันเฝ้าระวัง/วันได้เปรียบ",
      "เข็ม C ครอบเฉพาะจุด natal ที่ timeline ติดตาม (ดาวเร็ว 5 + ลัคนา/MC/จุดโชค) — natal ดาวช้าไม่อยู่ในชุด (ซื่อตรง ไม่เดา)",
    ],
    computeMs: Date.now() - t0,
  };
}

/* ==================== ช่วงสแกนจากคำถาม (route wiring) ==================== */

const MONTH_PATTERNS: Array<[number, RegExp]> = [
  [1, /มกราคม|ม\.?ค\.?(?![ก-ฮ])|january|\bjan\b|一月/i], [2, /กุมภาพันธ์|ก\.?พ\.?(?![ก-ฮ])|february|\bfeb\b|二月/i],
  [3, /มีนาคม|มี\.?ค\.?(?![ก-ฮ])|march|\bmar\b|三月/i], [4, /เมษายน|เม\.?ย\.?(?![ก-ฮ])|april|\bapr\b|四月/i],
  [5, /พฤษภาคม|พ\.?ค\.?(?![ก-ฮ])|\bmay\b|五月/i], [6, /มิถุนายน|มิ\.?ย\.?(?![ก-ฮ])|june|\bjun\b|六月/i],
  [7, /กรกฎาคม|ก\.?ค\.?(?![ก-ฮ])|july|\bjul\b|七月/i], [8, /สิงหาคม|ส\.?ค\.?(?![ก-ฮ])|august|\baug\b|八月/i],
  [9, /กันยายน|ก\.?ย\.?(?![ก-ฮ])|september|\bsep\b|九月/i], [10, /ตุลาคม|ต\.?ค\.?(?![ก-ฮ])|october|\boct\b|十月/i],
  [11, /พฤศจิกายน|พ\.?ย\.?(?![ก-ฮ])|november|\bnov\b|十一月/i], [12, /ธันวาคม|ธ\.?ค\.?(?![ก-ฮ])|december|\bdec\b|十二月/i],
];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ช่วงสแกน 92 วัน: เดือนที่ระบุ → เริ่มต้นเดือนนั้น (ปีเป้าหมาย) · วันที่ระบุ → คร่อมวันนั้น · default → คร่อม refDate */
export function resolveDaySniperRange(question: string, timingRef: FusionTimingReference): { fromISO: string; toISO: string; label: string } {
  const span = (fromMs: number, label: string) => ({ fromISO: iso(fromMs), toISO: iso(fromMs + (DAY_SNIPER_MAX_DAYS - 1) * DAY_MS), label });
  for (const [m, re] of MONTH_PATTERNS) {
    if (re.test(String(question || ""))) {
      return span(Date.UTC(timingRef.targetYear, m - 1, 1), `เดือน ${m}/${timingRef.targetYear} จากคำถาม (+2 เดือนถัดไป)`);
    }
  }
  const refWallMs = timingRef.refDate.getTime() + BKK_MS;
  const refDayMs = Math.floor(refWallMs / DAY_MS) * DAY_MS;
  if (timingRef.source === "question_date") {
    return span(refDayMs - 14 * DAY_MS, `คร่อมวันที่ผู้ใช้ระบุ (${iso(refDayMs)} −14/+77 วัน)`);
  }
  return span(refDayMs - 31 * DAY_MS, `3 เดือนคร่อมวันอ้างอิงจร (${iso(refDayMs)})`);
}

/* ==================== render บล็อก prompt (ไทย · cap ≤2500 · ตัดฉลาด) ==================== */

const FLAG_EMOJI: Record<SniperDay["flag"], string> = { red: "🔴", yellow: "🟡", green: "🟢" };

export function renderDaySniperTh(ds: DaySniperResult): string {
  const head = [
    "=== DAY_SNIPER (คำนวณจริง ห้ามเลื่อนวันเอง) ===",
    `ช่วงสแกน ${ds.fromISO}→${ds.toISO} · หัวข้อ: ${ds.topicTh} · เข็มอิสระ 3 เรือน: A=流日60วัน · B=จันทร์จริง(exact) · C=ดาวช้าจริง(exact)`,
    "กติกา: 🔴=เข็มอิสระ≥2ชี้วันเดียวกัน(ฝั่งเตือน) · 🟡=สัญญาณแรงเดี่ยว(沖/伏吟 หรือดาวช้า exact) · 🟢=六合/三合半+จันทร์มุมดีถึงศุภเคราะห์",
  ];
  const body: { s: string; prio: 1 | 2 | 3 }[] = [];
  const push = (s: string, prio: 1 | 2 | 3 = 1) => body.push({ s, prio });
  for (const p of ds.perPerson) {
    push(`-- ${p.name} (🔴${p.totals.red} 🟡${p.totals.yellow} 🟢${p.totals.green} จาก ${p.scannedDays} วัน${p.droppedCount ? ` · แสดง ${p.days.length} วันแรกตาม rank` : ""}) --`);
    if (p.skippedNote) { push(`  (${p.skippedNote})`); continue; }
    if (!p.days.length) { push("  ไม่มีวันที่เข็ม ≥2 หรือสัญญาณแรงเดี่ยวในช่วงนี้"); continue; }
    for (const d of p.days) {
      const prio: 1 | 2 | 3 = d.flag === "red" ? 1 : d.flag === "green" ? 2 : 3;
      const aTxt = d.a.filter((r) => r.strength !== "context").map((r) => r.detail).join(" + ") || "—";
      const bTxt = d.b.slice(0, 2).map((h) => h.detail).join(" + ") || "—";
      const cTxt = d.c.slice(0, 2).map((h) => h.detail).join(" + ") || "—";
      push(`${d.dateISO} ${FLAG_EMOJI[d.flag]} [เข็ม ${d.needles.join("+")}] A:${aTxt} · B:${bTxt} · C:${cTxt}${d.context.length ? ` · บริบท:${d.context.join("/")}` : ""}`, prio);
    }
    if (p.targets?.notes.length) for (const n of p.targets.notes) push(`  (หมายเหตุ: ${n})`, 3);
  }
  const tail = [
    "คู่เข็ม A×B คือนาฬิกาอิสระจริง (ปฏิทิน 60 วัน ไม่ derive จากวงโคจรจันทร์/อาทิตย์) — วันที่ตรงกัน = หลักฐานแข็งสุดของชั้นนี้",
    "วันนอกลิสต์ = engine สแกนแล้วไม่พบสัญญาณ · ห้ามแต่งวันเพิ่ม/เลื่อนวัน",
    "=== END_DAY_SNIPER ===",
  ];
  // คุมงบ ≤2500 ตัดฉลาด: ตัดบรรทัด prio 3 (เหลือง/หมายเหตุ) ก่อน → prio 2 (เขียว) → ท้ายสุดตัดแดงจากท้าย
  const joined = () => [...head, ...body.map((x) => x.s), ...tail].join("\n");
  if (joined().length > DAY_SNIPER_BLOCK_MAX_CHARS) {
    const fits = () => [...head, ...body.map((x) => x.s), "[ตัดบางวันเพราะเกินงบพื้นที่]", ...tail].join("\n").length <= DAY_SNIPER_BLOCK_MAX_CHARS;
    for (const prio of [3, 2] as const) {
      while (!fits() && body.some((x) => x.prio === prio)) body.splice(body.map((x) => x.prio).lastIndexOf(prio), 1);
    }
    while (!fits() && body.length > 0) body.pop();
    body.push({ s: "[ตัดบางวันเพราะเกินงบพื้นที่]", prio: 1 });
  }
  return joined().slice(0, DAY_SNIPER_BLOCK_MAX_CHARS);
}
