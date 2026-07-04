/**
 * fusion5 · r369 "Cross-Science Resonance Layer" + r370 "Resonance v2"
 * engine deterministic หา "จุดที่หลายศาสตร์เห็นตรงกัน" ก่อนส่งให้ AI (AI ห้ามแก้ตัวเลข)
 * ศาสตร์ที่ร่วมชั้นนี้ v1: western / vedic / ziwei / qizheng (bazi ยังไม่ร่วม R1-R3 — ระบบเรือน/จรคนละตรรกะ)
 * เงื่อนไข: คำนวณเฉพาะดวงที่มีเวลาเกิด (ทุกชั้นที่ใช้ต้องมีลัคนา/宮) · ศาสตร์ใดพังคำนวณ = ข้ามศาสตร์นั้น ไม่ล้มทั้งก้อน
 *
 * 3 ชนิด resonance (r369 · ห้าม regress):
 *   R1 ปีเรือนตรงกัน  — western annual profection (2 ช่วงอายุ) · vedic Muntha (varshaphala) · ziwei 流年命宮ตกวัง natal
 *   R2 ดาวจริงดวงเดียวกันชนหลายกรอบ — western exact transit vs qizheng 木土羅計火 hits vs vedic (Saturn/Jupiter เปลี่ยนราศี + SadeSati เข้าเฟส)
 *   R3 คราส/ราหูเกตุ — western eclipse แตะดวง + western Rahu transit + qizheng 羅睺/計都 hits (เดือนเดียวกัน ≥2 ศาสตร์)
 * CONFLICT (v1 แบบซื่อตรง): เดือนที่ศาสตร์หนึ่งมีแต่เหตุการณ์ดี อีกศาสตร์มีแต่เหตุการณ์ร้าย → "มุมมองต่าง"
 *   ข้อจำกัด v1: polarity ประเมินจากชนิดดาว+มุม/恩用仇難 เท่านั้น (ไม่ชั่งน้ำหนักบริบทดวง) · vedic ไม่ร่วม conflict (event ไม่ละเอียดพอรายเดือน)
 *
 * r370 "Resonance v2" — 3 ชั้นใหม่ (additive · version คง "resonance_v1" กัน consumer เดิมพัง · ดูธง fields ใหม่แทน):
 *   R4 เสียงสะท้อนดวงคู่ (births ≥2 · ต่อคู่ i<j) — 4 มิติความเข้ากันข้ามระบบ: อารมณ์-จิตใจ / สื่อสาร / เสน่หา / เสถียรภาพ
 *      แต่ละระบบโหวต ดี/กลาง/ตึง จากค่า engine ตรง (ไม่ parse ข้อความ render) · ≥2 ระบบโหวตเหมือนกัน = สะท้อน · ดี vs ตึง = ขัด
 *   R5 สะพานธาตุ — 用神 จาก DB (profiles.yongshen shape {top3:[{element,…}],climate}) เทียบปีเป้าหมาย:
 *      western ดาวช้าธาตุนั้น (map ดาว→ธาตุจีนโบราณ 木星/火星/土星/金星/水星) + qizheng 流年ดาวธาตุ用神 · ziwei ข้ามอย่างซื่อสัตย์ (engine ไม่มีตารางธาตุดาว化曜)
 *   R6 ปีชง 3 อารยธรรม — จีน (กิ่งปีเกิด vs กิ่งปีเป้าหมาย: 值太歲/沖/刑/害/破) · western (Saturn hard aspect → natal Sun/Moon/Asc)
 *      · vedic (SadeSati activeAnyTimeInYear) → นับเสียง 0-3
 *
 * "Resonance v3" — independence tagging บน R2/R3 (additive · กัน overcount · version คง "resonance_v1"):
 *   การซ้อนบางคู่ "ต้องตรงกันโดยโครงสร้าง" เพราะสองฝั่งวัดของชิ้นเดียวกัน → ห้ามนับเป็นการยืนยันอิสระ
 *   ดู mapping เต็มที่ block comment เหนือ classify helpers ด้านล่าง · independent มาก่อนเสมอ (ลำดับ array + render)
 */
import { SolarTime } from "tyme4ts";
import { ASPECTS } from "../astro-core/aspects";
import { westernChart, type Gender, type WesternChart } from "../astro/western/engine";
import { buildWesternTimeline, type WesternTimeline } from "../astro/western/timeline";
import { vedicChart } from "../astro/vedic/engine";
import { buildVedicTimeline, type VedicTimeline } from "../astro/vedic/timeline";
import { ashtakoota } from "../astro/vedic/ashtakoota";
import { ziweiChart } from "../astro/ziwei/engine";
import { qizhengNatal } from "../astro/qizheng/engine";
import { buildQizhengTimeline, type QizhengTimeline } from "../astro/qizheng/timeline";
// r400: ยูเรเนียนเข้า R6 เท่านั้น (เสียงอารยธรรมที่ 4 · นาฬิกาทุติยภูมิ directed/progressed) — import อ่านอย่างเดียว (engine/packet LOCKED)
import { uranianChart } from "../astro/uranian/engine";
import { computeUranianAuslosung, type UranianAuslosung, type AuslosungMethod } from "../astro/uranian/auslosung";
import type { ScienceId } from "./disciplines";
import type { FusionBirthLike } from "./multi-year";
import type { DaySniperResult } from "./day-sniper"; // r373 · type-only (ไม่มี runtime cycle — day-sniper import ค่าจากไฟล์นี้ทางเดียว)

/** r370: ดวงที่ส่งเข้าชั้น resonance — เพิ่ม field จาก DB (route loadBirth ส่งมาอยู่แล้ว · optional = ผู้เรียกเก่าไม่พัง) */
export type ResonanceBirth = FusionBirthLike & { yongshen?: unknown; baziPillars?: unknown };

// r400: เพิ่ม "uranian" เข้าชั้น resonance — แต่ยูเรเนียนร่วมเฉพาะ R6 (เสียงอารยธรรมที่ 4 · directed/progressed อิสระ)
//   ⛔ Guard B: ยูเรเนียนไม่ผลิต monthEvent → ไม่แตะ R2/R3/R1/R5/CONFLICT โดยโครงสร้าง (กัน overcount ดาวจร ephemeris เดียวกับ western)
export type ResonanceScience = Extract<ScienceId, "western" | "vedic" | "ziwei" | "qizheng" | "uranian">;
export const RESONANCE_SCIENCES: ResonanceScience[] = ["western", "vedic", "ziwei", "qizheng", "uranian"];
const SCI_TH: Record<ResonanceScience, string> = { western: "ตะวันตก", vedic: "พระเวท", ziwei: "จื่อเวย", qizheng: "ดาวจริง七政", uranian: "ยูเรเนียน" };

/* ==================== ตารางธีมร่วม 12 เรือน (single source · R1) ====================
 * เหตุผลการ map (เอกสารกำกับ — แก้ต้องแก้ที่นี่ที่เดียว):
 *  - western/vedic ใช้เลขเรือน 1-12 ตรงตัว (profection house · Muntha house from lagna)
 *  - ziwei 12宮 ไม่ตรง 1:1 กับเรือนฝรั่ง → ใช้ธีมใกล้สุด:
 *      命宮→1(ตัวตน) · 財帛→2(การเงิน) · 兄弟→3(พี่น้อง) · 田宅→4(บ้าน-อสังหา) · 子女→5(ลูก)
 *      疾厄→6(สุขภาพ — เลือก疾厄 ไม่ใช่僕役 เพราะแก่นเรือน6ฝรั่งคือสุขภาพ/ภาระ) · 夫妻→7(คู่ครอง)
 *      遷移→9(เดินทาง-ต่างแดน) · 官祿→10(การงาน) · 僕役→11(บริวาร/เพื่อนฝูง≈เครือข่าย)
 *      福德→12(福德=สุขทางใจ/บุญเก่า ใกล้เรือน12 เร้นลับ-พักฟื้นสุด แม้ไม่เป๊ะ — จดเป็น approximation)
 *      父母→4(พ่อแม่=รากครอบครัว ใกล้เรือน4สุด — approximation · ฝรั่งบางสายให้เรือน10=แม่ แต่เรือน10เราสงวนให้การงาน)
 *  - เรือน 8 (วิกฤต-เงินร่วม) ไม่มี宮จื่อเวยที่ตรง → ziwei ไม่มีทางลงธีมนี้ (ยอมรับ ไม่ฝืน map)
 */
export type ResonanceThemeKey =
  | "identity" | "money" | "siblings" | "home" | "children" | "health_work"
  | "partner" | "crisis" | "travel" | "career" | "network" | "retreat";

export const RESONANCE_THEMES: Record<ResonanceThemeKey, { house: number; th: string; en: string; zh: string }> = {
  identity:    { house: 1,  th: "ตัวตน-เริ่มใหม่",     en: "Self / new cycle",        zh: "自我·新開始" },
  money:       { house: 2,  th: "การเงิน",             en: "Money",                   zh: "財帛" },
  siblings:    { house: 3,  th: "พี่น้อง-สื่อสาร",      en: "Siblings / communication", zh: "兄弟·溝通" },
  home:        { house: 4,  th: "บ้าน-ครอบครัว",       en: "Home / family",           zh: "家宅·家人" },
  children:    { house: 5,  th: "ลูก-สร้างสรรค์",       en: "Children / creativity",   zh: "子女·創作" },
  health_work: { house: 6,  th: "สุขภาพ-ภาระงาน",      en: "Health / workload",       zh: "健康·勞務" },
  partner:     { house: 7,  th: "คู่ครอง",             en: "Partner",                 zh: "夫妻" },
  crisis:      { house: 8,  th: "วิกฤต-เงินร่วม",       en: "Crisis / shared money",   zh: "危機·共財" },
  travel:      { house: 9,  th: "เดินทาง-ต่างแดน",      en: "Travel / abroad",         zh: "遷移·遠行" },
  career:      { house: 10, th: "การงาน-สถานะ",        en: "Career / status",         zh: "官祿·地位" },
  network:     { house: 11, th: "เครือข่าย",            en: "Network / allies",        zh: "人脈" },
  retreat:     { house: 12, th: "พักฟื้น-เร้นลับ",      en: "Retreat / hidden",        zh: "潛藏·休養" },
};

const HOUSE_TO_THEME: Record<number, ResonanceThemeKey> = Object.fromEntries(
  (Object.keys(RESONANCE_THEMES) as ResonanceThemeKey[]).map((k) => [RESONANCE_THEMES[k].house, k])
) as Record<number, ResonanceThemeKey>;

/** ziwei 宮 → ธีม (เหตุผลอยู่หัวตาราง THEMES ด้านบน) */
const ZIWEI_PALACE_THEME: Record<string, ResonanceThemeKey> = {
  "命宮": "identity", "財帛": "money", "兄弟": "siblings", "田宅": "home", "子女": "children",
  "疾厄": "health_work", "夫妻": "partner", "遷移": "travel", "官祿": "career", "僕役": "network",
  "福德": "retreat", "父母": "home",
};

/* ==================== ชนิดข้อมูล ==================== */
/** v3: เพิ่ม "Sun" ในชุดดาว — collector ปัจจุบันยังไม่ผลิต event อาทิตย์ (R2 จริงไม่เปลี่ยน) แต่ type รองรับ
 *  entry Sun-driven (เดือน節氣จีน ↔ ตำแหน่ง Sun ตะวันตก ฯลฯ) เพื่อจัดชั้น structural ได้ตั้งแต่วันแรก */
export type ResonancePlanet = "Saturn" | "Jupiter" | "Mars" | "Node" | "Uranus" | "Neptune" | "Pluto" | "Sun";
const PLANET_TH: Record<ResonancePlanet, string> = {
  Saturn: "เสาร์(土)", Jupiter: "พฤหัส(木)", Mars: "อังคาร(火)", Node: "ราหู-เกตุ(羅計)",
  Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต", Sun: "อาทิตย์(日)",
};
/** ดาวจริงดวงเดียวกันคนละชื่อในแต่ละศาสตร์ → physical key เดียว */
const QIZHENG_STAR_PLANET: Record<string, ResonancePlanet> = { "土": "Saturn", "木": "Jupiter", "火": "Mars", "羅睺": "Node", "計都": "Node" };

export type ResonanceMonthEvent = {
  science: ResonanceScience;
  month: number;                                 // 1-12 ปีเป้าหมาย (เวลาไทย)
  planet: ResonancePlanet;
  dateISO: string | null;                        // วันแม่นถ้ามี
  evidence: string;                              // ข้อความหลักฐาน (ภาษาศาสตร์นั้น)
  polarity: "benefic" | "malefic" | "neutral";   // ใช้ชั้น CONFLICT
};

/* ==================== "Resonance v3" · structural vs independent (กัน overcount) ====================
 * หลักคิด: การซ้อนนับเป็น "การยืนยันอิสระ" ได้ก็ต่อเมื่อสองฝั่งเป็นนาฬิกาคนละเรือนจริงๆ
 * ถ้าสองฝั่ง derive จาก body เดียวกัน + phase เดียวกัน = วัดของชิ้นเดียวกันสองครั้ง → structural (ห้ามนับซ้ำ)
 *
 * mapping ต่อ entry (ศาสตร์ไหน + ดาวไหน → นาฬิกาอะไรขับ):
 *   [R2] western  transit Saturn/Jupiter/Mars/Uranus/Neptune/Pluto → ดาวจริงบนฟ้าดวงนั้น (นาฬิกา: ตัวดาวเอง)
 *   [R2] qizheng  土/木/火/羅睺/計都 hits                          → ดาวจริง (七政 คำนวณตำแหน่งจริง astronomy-engine)
 *   [R2] vedic    Saturn/Jupiter ingress + SadeSati                → ดาวจริง (sidereal — ดวงเดียวกับ western แต่ target natal คนละชุด/คนละ phase)
 *   [R2] planet="Sun" (สังเคราะห์/อนาคต): เดือน節氣จีน ↔ ตำแหน่ง Sun ตะวันตก · 沖เดือน ↔ Sun opposite natal Sun
 *        · ปีกิ่งจีน ↔ Jupiter idealized (ปีนักษัตร = วัฏจักรพฤหัสอุดมคติ นับด้วยปฏิทิน ไม่ใช่ดาวจริง)
 *        → ทั้งหมดขับด้วยนาฬิกาอาทิตย์/ตัวนับปฏิทินเรือนเดียวกัน phase เดียวกัน
 *   [R3] western  eclipse แตะดวง · Rahu จร → แกนราหูเกตุ/คราสจริง (driver "eclipse"/"node")
 *   [R3] qizheng  羅睺/計都 hits            → แกนราหูเกตุจริง (driver "node")
 *
 * เกณฑ์เทียบคู่ (ตัดสินระดับ cluster):
 *   STRUCTURAL  — ทุก entry ในกลุ่มขับด้วยอาทิตย์/ตัวนับเดียวกัน (R2: planet="Sun" ทั้งคู่ · R3: driver="sun" ทั้งหมด)
 *                 = เหตุการณ์ที่ต้องตรงกันโดยโครงสร้าง ไม่ใช่หลักฐานซ้ำ
 *   INDEPENDENT — ทองคำ: ดาวที่ปฏิทินตัวนับมองไม่เห็น (Saturn/Uranus/Neptune/Pluto/Mars/Jupiter จริง/คราส/ราหูจริง/จันทร์จริง)
 *                 ชี้เดือนเดียวกับอีกกรอบพอดี = นาฬิกาคนละเรือนตีพร้อมกัน
 *                 (western×qizheng ดาวจริงดวงเดียวกัน = body เดียวกันแต่ phase คนละชุด natal → ยังนับอิสระตาม spec v3)
 *
 * คะแนน/ลำดับ: independent มาก่อนเสมอ (sort array + render แยกกลุ่ม 🥇/ℹ️) · jsonb additive:
 *   jobs.resonance เดิมไม่มี field independence → consumer อ่านค่าที่หายเป็น independent (พฤติกรรมเท่าเดิม)
 */
export type ResonanceIndependence = "structural" | "independent";
/** ดาวที่ "ตัวนับปฏิทิน" มองเห็น (ขับด้วยอาทิตย์/ตัวนับ) — คู่ที่เป็นดาวชุดนี้ทั้งหมด = structural */
const SUN_DRIVEN_PLANETS: ReadonlySet<ResonancePlanet> = new Set(["Sun"]);
const indepOrder = (x: { independence: ResonanceIndependence }) => (x.independence === "structural" ? 1 : 0);

export type R1Entry = { science: ResonanceScience; house: number | null; themeKey: ResonanceThemeKey; evidence: string };
export type R1Resonant = { themeKey: ResonanceThemeKey; theme: { th: string; en: string; zh: string }; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; evidence: string }[] };
export type R2Cluster = { month: number; planet: ResonancePlanet; planetTh: string; independence: ResonanceIndependence; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; dateISO: string | null; evidence: string }[] };
export type R3EventDriver = "sun" | "node" | "eclipse";
export type R3Cluster = { month: number; independence: ResonanceIndependence; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; dateISO: string | null; evidence: string }[] };
export type ConflictRow = { month: number; beneficScience: ResonanceScience; maleficScience: ResonanceScience; beneficEvidence: string[]; maleficEvidence: string[] };

export type PersonResonance = {
  name: string;
  skippedNote: string | null;      // ไม่มีเวลาเกิด / เกินงบเวลา → ข้ามพร้อมเหตุผล
  r1: { entries: R1Entry[]; resonant: R1Resonant[] };
  r2: R2Cluster[];
  r3: R3Cluster[];
  conflicts: ConflictRow[];
  errors: string[];                // ศาสตร์ที่คำนวณพัง (ศาสตร์อื่นเดินต่อ)
  r5?: R5Person | null;            // r370 additive · null = คนนี้ถูกข้าม
  r6?: R6Person | null;            // r370 additive
};

export type FusionResonance = {
  version: "resonance_v1";         // คงค่าเดิม (consumer/jobs jsonb เดิมอ่านได้) · v2 ดูจาก field r4Pairs/r5/r6
  targetYear: number;
  sciences: ResonanceScience[];
  perPerson: PersonResonance[];
  r4Pairs?: R4Pair[];              // r370 additive · มีเมื่อ births ≥2
  daySniper?: DaySniperResult | null; // r373 additive · "วันลั่นไก" ระดับวัน (route เติมหลัง buildResonance · jsonb เดิมอ่านได้)
  summaryTh: string;
  notes: string[];
  computeMs: number;
};

/* ==================== cluster helpers (export เพื่อ unit test fixture) ==================== */

const sciOrder = (s: ResonanceScience) => RESONANCE_SCIENCES.indexOf(s);

/** R2: จับกลุ่มดาวดวงเดียวกัน เดือนเดียวกัน ที่ ≥2 ศาสตร์เห็นพร้อมกัน (deterministic sort) */
export function clusterByMonth(events: ResonanceMonthEvent[]): R2Cluster[] {
  const byKey = new Map<string, ResonanceMonthEvent[]>();
  for (const e of events) {
    if (e.month < 1 || e.month > 12) continue;
    const k = `${String(e.month).padStart(2, "0")}:${e.planet}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  const out: R2Cluster[] = [];
  for (const [k, evs] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sciences = [...new Set(evs.map((e) => e.science))].sort((a, b) => sciOrder(a) - sciOrder(b));
    if (sciences.length < 2) continue;
    const [, planet] = k.split(":");
    out.push({
      month: evs[0].month,
      planet: planet as ResonancePlanet,
      planetTh: PLANET_TH[planet as ResonancePlanet],
      // v3: cluster ที่ทุก entry ขับด้วยอาทิตย์/ตัวนับ (planet="Sun") = พ้องเชิงโครงสร้าง (ดู mapping comment ด้านบน)
      independence: SUN_DRIVEN_PLANETS.has(planet as ResonancePlanet) ? "structural" : "independent",
      sciences,
      evidences: evs
        .slice()
        .sort((a, b) => sciOrder(a.science) - sciOrder(b.science) || String(a.dateISO).localeCompare(String(b.dateISO)))
        .map((e) => ({ science: e.science, dateISO: e.dateISO, evidence: e.evidence })),
    });
  }
  // v3: independent มาก่อนเสมอ (stable sort — ในกลุ่มเดียวกันคงลำดับเดือน-ดาวเดิม)
  return out.sort((a, b) => indepOrder(a) - indepOrder(b));
}

/** R3: จับกลุ่มรายเดือน (ไม่แยกดาว) ที่ ≥2 ศาสตร์เห็นพร้อมกัน
 *  v3: รับ driver ต่อ event (eclipse/node = ปฏิทินตัวนับมองไม่เห็น → อิสระ · "sun" ทั้งหมด = structural)
 *  driver ไม่ระบุ = ถือเป็นดาวจริง (อิสระ) — backward compatible กับ caller เก่า */
export function clusterEclipseByMonth(events: { science: ResonanceScience; month: number; dateISO: string | null; evidence: string; driver?: R3EventDriver }[]): R3Cluster[] {
  const byMonth = new Map<number, typeof events>();
  for (const e of events) {
    if (e.month < 1 || e.month > 12) continue;
    (byMonth.get(e.month) ?? byMonth.set(e.month, []).get(e.month)!).push(e);
  }
  const out: R3Cluster[] = [];
  for (const [month, evs] of [...byMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const sciences = [...new Set(evs.map((e) => e.science))].sort((a, b) => sciOrder(a) - sciOrder(b));
    if (sciences.length < 2) continue;
    out.push({
      month,
      // v3: ทุก entry ขับด้วยอาทิตย์/ตัวนับ → structural · มีดาวจริง/คราส/ราหูปนอย่างน้อยหนึ่ง → independent
      independence: evs.every((e) => e.driver === "sun") ? "structural" : "independent",
      sciences,
      evidences: evs
        .slice()
        .sort((a, b) => sciOrder(a.science) - sciOrder(b.science) || String(a.dateISO).localeCompare(String(b.dateISO)))
        .map((e) => ({ science: e.science, dateISO: e.dateISO, evidence: e.evidence })),
    });
  }
  // v3: independent มาก่อนเสมอ (stable sort — ในกลุ่มเดียวกันคงลำดับเดือนเดิม)
  return out.sort((a, b) => indepOrder(a) - indepOrder(b));
}

/** CONFLICT v1: เดือนที่ศาสตร์ A มีแต่ benefic ส่วนศาสตร์ B มีแต่ malefic (เฉพาะศาสตร์ที่มี event polarity รายเดือน) */
export function findConflicts(events: ResonanceMonthEvent[]): ConflictRow[] {
  const byMonthSci = new Map<string, { benefic: string[]; malefic: string[] }>();
  for (const e of events) {
    if (e.polarity === "neutral" || e.month < 1 || e.month > 12) continue;
    const k = `${String(e.month).padStart(2, "0")}:${e.science}`;
    const slot = byMonthSci.get(k) ?? { benefic: [], malefic: [] };
    slot[e.polarity].push(e.evidence);
    byMonthSci.set(k, slot);
  }
  const out: ConflictRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const perSci = RESONANCE_SCIENCES
      .map((s) => ({ s, slot: byMonthSci.get(`${String(m).padStart(2, "0")}:${s}`) }))
      .filter((x): x is { s: ResonanceScience; slot: { benefic: string[]; malefic: string[] } } => !!x.slot);
    const beneficOnly = perSci.filter((x) => x.slot.benefic.length > 0 && x.slot.malefic.length === 0);
    const maleficOnly = perSci.filter((x) => x.slot.malefic.length > 0 && x.slot.benefic.length === 0);
    for (const b of beneficOnly) {
      for (const ml of maleficOnly) {
        if (b.s === ml.s) continue;
        out.push({
          month: m,
          beneficScience: b.s, maleficScience: ml.s,
          beneficEvidence: b.slot.benefic.slice(0, 2),
          maleficEvidence: ml.slot.malefic.slice(0, 2),
        });
      }
    }
  }
  return out;
}

/* ==================== เก็บ event รายศาสตร์ ==================== */

const monthOfISO = (iso: string) => Number(String(iso).slice(5, 7)) || 0;

/** western: exact transit hits (Saturn/Jupiter/Mars/Uranus/Neptune/Pluto → natal) + polarity แบบ v1 */
function westernEvents(tl: WesternTimeline): ResonanceMonthEvent[] {
  const out: ResonanceMonthEvent[] = [];
  for (const h of tl.transitHits) {
    const planet = (["Saturn", "Jupiter", "Mars", "Uranus", "Neptune", "Pluto"] as const).find((p) => p === h.transit);
    if (!planet) continue;
    // polarity v1 (ซื่อตรง+ง่าย): Jupiter ทับ/ตรีโกณ = benefic · Saturn/Mars/Pluto ฉาก/เล็ง = malefic · ที่เหลือ neutral
    const polarity: ResonanceMonthEvent["polarity"] =
      planet === "Jupiter" && (h.aspect === "trine" || h.aspect === "conjunction") ? "benefic"
      : (planet === "Saturn" || planet === "Mars" || planet === "Pluto") && (h.aspect === "square" || h.aspect === "opposition") ? "malefic"
      : "neutral";
    out.push({ science: "western", month: h.month, planet, dateISO: h.dateISO, evidence: `${h.transitTh}${h.aspectTh.split(" ")[0]}${h.natalTh} (${h.dateISO})`, polarity });
  }
  return out;
}

/** qizheng: วันแม่น 木土羅計火 ชน 命度/身度/命主 · polarity ตาม恩用仇難ของพื้นดวง */
function qizhengEvents(tl: QizhengTimeline): ResonanceMonthEvent[] {
  return tl.hits.flatMap((h): ResonanceMonthEvent[] => {
    const planet = QIZHENG_STAR_PLANET[h.starZh];
    if (!planet) return [];
    const polarity: ResonanceMonthEvent["polarity"] =
      ["恩星", "用星", "命主同星"].includes(h.relationToMing) ? "benefic"
      : ["難星", "仇星"].includes(h.relationToMing) ? "malefic" : "neutral";
    return [{ science: "qizheng", month: h.month, planet, dateISO: h.dateISO, evidence: `${h.starZh}${h.aspect.split("(")[0]}${h.target} [${h.relationToMing}] (${h.dateISO})`, polarity }];
  });
}

/** vedic: Saturn/Jupiter เปลี่ยนราศี (ingress = segment ที่ retroAtIngress ไม่ใช่ null) + SadeSati เข้าเฟสกลางปี
 *  หมายเหตุ: เฟสที่ active ตั้งแต่ 1 ม.ค. ไม่ถือเป็น "เหตุการณ์ของเดือน" (ไม่มีจุดเปลี่ยนในปีนี้) — กันเดือน 1 ถูกนับมั่ว */
function vedicEvents(tl: VedicTimeline): ResonanceMonthEvent[] {
  const out: ResonanceMonthEvent[] = [];
  const jan1 = `${tl.targetYear}-01-01`;
  for (const seg of tl.transitSegments) {
    if ((seg.graha !== "Saturn" && seg.graha !== "Jupiter") || seg.retroAtIngress === null) continue;
    out.push({
      science: "vedic", month: monthOfISO(seg.fromISO),
      planet: seg.graha, dateISO: seg.fromISO,
      evidence: `${seg.grahaTh}เข้าราศี${seg.rashiTh} เรือน${seg.houseFromMoon}จากจันทร์ (${seg.fromISO})`,
      polarity: "neutral", // v1: vedic ไม่ร่วม conflict — bindu/ตำแหน่งต้องชั่งบริบทมากกว่ารายเดือน
    });
  }
  for (const p of tl.sadeSati.phases) {
    if (p.fromISO === jan1) continue;
    out.push({ science: "vedic", month: monthOfISO(p.fromISO), planet: "Saturn", dateISO: p.fromISO, evidence: `SadeSati เข้า${p.phaseTh} (${p.fromISO})`, polarity: "neutral" });
  }
  return out;
}

/* ████████████████████ r370 "Resonance v2" · R4 + R5 + R6 ████████████████████ */

/* ---------- ตารางธาตุ/กิ่ง (ค่าคงที่ตำรา · self-contained ตามแบบ bazi-synastry/pair-interactions · ไม่แตะ engine LOCKED) ---------- */
const EL_KEYS = ["wood", "fire", "earth", "metal", "water"] as const;
export type ResElement = (typeof EL_KEYS)[number];
const EL_TH_RES: Record<ResElement, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
const EL_ZH_RES: Record<ResElement, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
const STEM_EL_RES: Record<string, ResElement> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
/** ดาว→ธาตุจีน ตามชื่อดาวจีนโบราณ (木星/火星/土星/金星/水星) — เป็น mapping จีนโบราณ ไม่ใช่ western element ของดาว */
const PLANET_CN_EL: Record<string, ResElement> = { Jupiter: "wood", Mars: "fire", Saturn: "earth", Venus: "metal", Mercury: "water" };
const EL_QIZHENG_KEY: Record<ResElement, string> = { wood: "Jupiter", fire: "Mars", earth: "Saturn", metal: "Venus", water: "Mercury" };

const BRANCHES_RES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const STEMS_RES = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const RES_LIUHE: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const RES_CLASH: Record<string, string> = { 子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅", 卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳" };
const RES_HARM: Record<string, string> = { 子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅", 卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉" };
const RES_DESTROY: Record<string, string> = { 子: "酉", 酉: "子", 丑: "辰", 辰: "丑", 寅: "亥", 亥: "寅", 卯: "午", 午: "卯", 巳: "申", 申: "巳", 未: "戌", 戌: "未" };
const RES_SANHE: string[][] = [["申", "子", "辰"], ["亥", "卯", "未"], ["寅", "午", "戌"], ["巳", "酉", "丑"]];
/* 三刑: 寅巳申 (ไล่คู่) · 丑戌未 (ไล่คู่) · 子卯 (無禮) · 自刑 辰午酉亥 (กิ่งเดียวกันซ้ำ) */
const RES_XING_PAIRS: Array<[string, string]> = [["寅", "巳"], ["巳", "申"], ["申", "寅"], ["丑", "戌"], ["戌", "未"], ["未", "丑"], ["子", "卯"], ["卯", "子"]];
const RES_SELF_XING = new Set(["辰", "午", "酉", "亥"]);
const RES_STEM_HE: Record<string, string> = { 甲: "己", 己: "甲", 乙: "庚", 庚: "乙", 丙: "辛", 辛: "丙", 丁: "壬", 壬: "丁", 戊: "癸", 癸: "戊" };
const inSanhe = (a: string, b: string) => a !== b && RES_SANHE.some((g) => g.includes(a) && g.includes(b));

/* ---------- parser field จาก DB (shape จริงตรวจแล้ว 3 ก.ค. 69: SELECT yongshen FROM profiles → {top3:[{stem,element,finalScore,…}],climate}) ---------- */
type ResPillar = { stem: string; branch: string };
type ResPillars = { year?: ResPillar; month?: ResPillar; day?: ResPillar; hour?: ResPillar };
function resPillarOf(x: unknown): ResPillar | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  const stem = String(r.stem || "").trim();
  const branch = String(r.branch || "").trim();
  return STEMS_RES.includes(stem) && BRANCHES_RES.includes(branch) ? { stem, branch } : undefined;
}
export function resParsePillars(raw: unknown): ResPillars | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p = (r.pillars && typeof r.pillars === "object" ? r.pillars : r) as Record<string, unknown>;
  const out: ResPillars = { year: resPillarOf(p.year), month: resPillarOf(p.month), day: resPillarOf(p.day), hour: resPillarOf(p.hour) };
  return out.year || out.day ? out : null;
}
/** อ่าน 用神 elements จาก profiles.yongshen — รองรับ shape DB จริง {top3:[{element}]} + fallback array/string · ไม่มี = [] (ห้ามเดา) */
export function resParseYongshen(raw: unknown): ResElement[] {
  const toEl = (x: unknown): ResElement | null => {
    const s = String(typeof x === "object" && x ? (x as Record<string, unknown>).element || "" : x || "").trim().toLowerCase();
    const zh: Record<string, ResElement> = { 木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water" };
    return (EL_KEYS as readonly string[]).includes(s) ? (s as ResElement) : zh[s] || null;
  };
  let list: unknown[] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const top3 = (raw as Record<string, unknown>).top3;
    if (Array.isArray(top3)) list = top3;
  } else if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string") {
    try { const p = JSON.parse(raw); list = Array.isArray(p) ? p : Array.isArray((p || {}).top3) ? (p as { top3: unknown[] }).top3 : []; }
    catch { list = raw.split(/[,\s/·]+/); }
  }
  const out: ResElement[] = [];
  for (const x of list) { const e = toEl(x); if (e && !out.includes(e)) out.push(e); }
  return out;
}

/* ==================== R4 เสียงสะท้อนดวงคู่ ==================== */
export type R4VoteValue = "good" | "mid" | "tense";
export type R4System = "western" | "vedic" | "bazi" | "ziwei";
export type R4DimKey = "mind" | "comm" | "attract" | "stable";
export const R4_DIMENSIONS: Record<R4DimKey, { th: string; en: string; zh: string }> = {
  mind:    { th: "อารมณ์-จิตใจ",        en: "Emotional bond",      zh: "情感·心" },
  comm:    { th: "การสื่อสาร",           en: "Communication",       zh: "溝通" },
  attract: { th: "เสน่หา",              en: "Attraction",          zh: "情慾·吸引" },
  stable:  { th: "เสถียรภาพระยะยาว",    en: "Long-term stability", zh: "長期穩定" },
};
const R4_VOTE_TH: Record<R4VoteValue, string> = { good: "ดี", mid: "กลาง", tense: "ตึง" };
export type R4Vote = {
  system: R4System;
  vote: R4VoteValue | null;        // null = ไม่มีข้อมูล (ห้ามเดา — ระบุตรงๆ)
  evidence: string;
  metrics?: Record<string, number>; // ค่าจาก engine ตรง (ให้ test เทียบเป๊ะ)
};
export type R4DimensionRow = { key: R4DimKey; votes: R4Vote[]; resonance: R4VoteValue | null; conflict: boolean };
export type R4Pair = { a: string; b: string; skippedNote: string | null; dimensions: R4DimensionRow[] };

/** สรุปเสียงโหวตต่อมิติ: ≥2 ระบบโหวตค่าเดียวกัน = สะท้อน (ดี/ตึง ชนะ กลาง) · มี "ดี" และ "ตึง" พร้อมกัน = ขัด (conflict)
 *  ถ้าดี≥2 และ ตึง≥2 พร้อมกัน (สวนกันชัดทั้งสองฝั่ง) → ไม่ประกาศ resonance (conflict อย่างเดียว) — deterministic */
export function r4Resolve(votes: R4Vote[]): { resonance: R4VoteValue | null; conflict: boolean } {
  const count: Record<R4VoteValue, number> = { good: 0, mid: 0, tense: 0 };
  for (const v of votes) if (v.vote) count[v.vote]++;
  const conflict = count.good > 0 && count.tense > 0;
  let resonance: R4VoteValue | null = null;
  if (count.good >= 2 && count.tense >= 2) resonance = null;
  else if (count.good >= 2) resonance = "good";
  else if (count.tense >= 2) resonance = "tense";
  else if (count.mid >= 2) resonance = "mid";
  return { resonance, conflict };
}

const norm360Res = (d: number) => ((d % 360) + 360) % 360;
const angleDiffRes = (a: number, b: number) => { const d = Math.abs(norm360Res(a) - norm360Res(b)); return d > 180 ? 360 - d : d; };
function resAspectOf(a: number, b: number, maxOrb: number): { type: string; orb: number } | null {
  const sep = angleDiffRes(a, b);
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep - asp.angle);
    if (orb <= maxOrb) return { type: asp.type, orb: Math.round(orb * 10) / 10 };
  }
  return null;
}
const ASPECT_SYM: Record<string, string> = { conjunction: "☌", sextile: "✶", trine: "△", square: "□", opposition: "☍" };

type WCross = { from: string; to: string; dir: "A→B" | "B→A"; type: string; orb: number };
/** มุมข้ามดวง fromName(ของคนหนึ่ง) → ดาวชุด toNames(ของอีกคน) ทั้ง 2 ทิศ · orb เดียวกับ pair-interactions (luminary 7° อื่น 5°) */
function westernCross(A: WesternChart, B: WesternChart, fromName: string, toNames: string[]): WCross[] {
  const get = (c: WesternChart, n: string) => c.planets.find((p) => p.name === n);
  const out: WCross[] = [];
  const scan = (fc: WesternChart, tc: WesternChart, dir: "A→B" | "B→A") => {
    const f = get(fc, fromName);
    if (!f) return;
    for (const tn of toNames) {
      if (dir === "B→A" && tn === fromName) continue; // กันคู่ Moon×Moon ซ้ำ 2 ทิศ
      const t = get(tc, tn);
      if (!t) continue;
      const lum = fromName === "Sun" || fromName === "Moon" || tn === "Sun" || tn === "Moon";
      const asp = resAspectOf(f.lon, t.lon, lum ? 7 : 5);
      if (asp) out.push({ from: fromName, to: tn, dir, ...asp });
    }
  };
  scan(A, B, "A→B");
  scan(B, A, "B→A");
  return out.sort((x, y) => x.orb - y.orb);
}
/** โหวต western จากลิสต์มุม: trine/sextile=เสียงดี (benefic aspect) · square/opposition=เสียงตึง · conjunction=กลาง (ทับตีความได้ 2 ทาง)
 *  vote = ฝั่งเสียงข้างมาก (benefic majority) · เท่ากัน/มีแต่ทับ/ไม่มีมุม = กลาง (การ "ไม่มีมุม" ก็เป็นข้อมูลจาก engine แล้ว ไม่ใช่ไม่มีข้อมูล) */
function westernVoteFromCross(list: WCross[]): R4Vote {
  const good = list.filter((x) => x.type === "trine" || x.type === "sextile").length;
  const hard = list.filter((x) => x.type === "square" || x.type === "opposition").length;
  const vote: R4VoteValue = good > hard ? "good" : hard > good ? "tense" : "mid";
  const label = (x: WCross) => x.dir === "A→B" ? `A.${x.from}${ASPECT_SYM[x.type] || x.type}B.${x.to}(${x.orb}°)` : `B.${x.from}${ASPECT_SYM[x.type] || x.type}A.${x.to}(${x.orb}°)`;
  return {
    system: "western", vote,
    evidence: list.length ? list.slice(0, 4).map(label).join(" ") : "ไม่มีมุมเชื่อมชุดดาวนี้",
    metrics: { good, hard, conj: list.filter((x) => x.type === "conjunction").length },
  };
}
/** เสน่หา: เฉพาะคู่ Venus↔Mars สองทิศ (A.Venus×B.Mars · A.Mars×B.Venus) — ตำรา synastry คลาสสิก */
function venusMarsCross(A: WesternChart, B: WesternChart): WCross[] {
  const get = (c: WesternChart, n: string) => c.planets.find((p) => p.name === n);
  const out: WCross[] = [];
  const pairs: Array<[string, string, "A→B" | "B→A"]> = [["Venus", "Mars", "A→B"], ["Mars", "Venus", "A→B"]];
  for (const [fn, tn, dir] of pairs) {
    const f = get(A, fn), t = get(B, tn);
    if (!f || !t) continue;
    const asp = resAspectOf(f.lon, t.lon, 5);
    if (asp) out.push({ from: fn, to: tn, dir, ...asp });
  }
  return out.sort((x, y) => x.orb - y.orb);
}

/** เกณฑ์โหวต kuta ตาม spec: คะแนน ≥ ครึ่งของ max = ดี · < 1/4 = ตึง · ระหว่าง = กลาง (deterministic) */
const kutaVote = (score: number, max: number): R4VoteValue => (score >= max / 2 ? "good" : score < max / 4 ? "tense" : "mid");

/** โหวต bazi จากความสัมพันธ์กิ่ง/ก้านคู่หนึ่ง: 六合/半合(三合คู่)/天干五合=เสียงดี · 沖/害/破=เสียงตึง · เสียงข้างมากชนะ เท่ากัน=กลาง */
function baziRelVote(sa: string | undefined, ba: string | undefined, sb: string | undefined, bb: string | undefined, axisTh: string): { vote: R4VoteValue; evidence: string; good: number; tense: number } | null {
  if (!ba || !bb) return null;
  const rels: string[] = [];
  let good = 0, tense = 0;
  if (RES_LIUHE[ba] === bb) { rels.push("六合"); good++; }
  if (inSanhe(ba, bb)) { rels.push("三合(คู่ในวง)"); good++; }
  if (RES_CLASH[ba] === bb) { rels.push("沖"); tense++; }
  if (RES_HARM[ba] === bb) { rels.push("害"); tense++; }
  if (RES_DESTROY[ba] === bb) { rels.push("破"); tense++; }
  if (sa && sb && RES_STEM_HE[sa] === sb) { rels.push(`天干五合(${sa}${sb})`); good++; }
  const vote: R4VoteValue = good > tense ? "good" : tense > good ? "tense" : "mid";
  return { vote, evidence: `${axisTh}${ba}×${bb}${sa && sb ? ` (ก้าน${sa}×${sb})` : ""}: ${rels.length ? rels.join("+") : "ไม่มีปฏิกิริยาเด่น"}`, good, tense };
}

/** สร้าง R4 ต่อคู่ (a,b ต้องเป็นดวงที่ผ่านเงื่อนไขเวลาเกิดแล้ว) · แต่ละระบบพัง = โหวต null "ไม่มีข้อมูล" ไม่ล้มคู่ */
function buildR4Pair(a: ResonanceBirth, b: ResonanceBirth, nameA: string, nameB: string, refDate: Date): R4Pair {
  const votes: Record<R4DimKey, R4Vote[]> = { mind: [], comm: [], attract: [], stable: [] };
  const noData = (system: R4System, why: string): R4Vote => ({ system, vote: null, evidence: `ไม่มีข้อมูล (${why})` });

  // ---- western: Moon / Mercury / Venus-Mars / Saturn cross aspects (อ่าน lon จาก engine ตรง) ----
  try {
    const A = westernChart(a.dtUTC, a.lat, a.lng, a.hasTime, a.gender as Gender, refDate);
    const B = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender as Gender, refDate);
    const PERSONAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
    votes.mind.push(westernVoteFromCross(westernCross(A, B, "Moon", PERSONAL)));
    votes.comm.push(westernVoteFromCross(westernCross(A, B, "Mercury", PERSONAL)));
    votes.attract.push(westernVoteFromCross(venusMarsCross(A, B)));
    votes.stable.push(westernVoteFromCross(westernCross(A, B, "Saturn", ["Sun", "Moon", "Mercury", "Venus", "Mars"])));
  } catch {
    (["mind", "comm", "attract", "stable"] as R4DimKey[]).forEach((k) => votes[k].push(noData("western", "คำนวณ western ไม่สำเร็จ")));
  }

  // ---- vedic: ashtakoota kuta ต่อมิติ (bride=ฝ่ายหญิง ตามกติกา Guna Milan · เพศเดียวกันใช้คนแรก=bride — convention เดียวกับ pair-interactions) ----
  try {
    const A = vedicChart(a.dtUTC, a.lat, a.lng, a.hasTime, refDate);
    const B = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate);
    const moonA = A.grahas.find((g) => g.name === "Moon");
    const moonB = B.grahas.find((g) => g.name === "Moon");
    if (!moonA || !moonB) throw new Error("no_moon");
    const brideIsB = b.gender === "F" && a.gender !== "F";
    const bm = brideIsB ? moonB : moonA;
    const gm = brideIsB ? moonA : moonB;
    const ak = ashtakoota(
      { nakshatraIndex: bm.nakshatra.index, rashi: bm.rashi, rashiDeg: bm.rashiDeg },
      { nakshatraIndex: gm.nakshatra.index, rashi: gm.rashi, rashiDeg: gm.rashiDeg },
    );
    const kuta = (key: string) => ak.kutas.find((k) => k.key === key)!;
    const gmk = kuta("grahaMaitri"), rasi = kuta("rasi");         // กลุ่มจิตใจ: graha_maitri + bhakoot(rasi)
    const vashya = kuta("vashya"), dina = kuta("dina");           // สื่อสาร: vasya + tara(dina)
    const yoni = kuta("yoni");                                    // เสน่หา: yoni
    const nadi = kuta("nadi");                                    // เสถียรภาพ: nadi + rajju (rajju เสริมนอก 36)
    const mk = (kutas: { key: string; score: number; max: number }[], extra = ""): R4Vote => {
      const s = kutas.reduce((x, k) => x + k.score, 0);
      const m = kutas.reduce((x, k) => x + k.max, 0);
      return {
        system: "vedic", vote: kutaVote(s, m),
        evidence: `${kutas.map((k) => `${k.key} ${k.score}/${k.max}`).join(" + ")}${extra} = ${s}/${m}`,
        metrics: Object.fromEntries([...kutas.map((k) => [k.key, k.score]), ["sum", s], ["max", m]]),
      };
    };
    votes.mind.push(mk([gmk, rasi]));
    votes.comm.push(mk([vashya, dina]));
    votes.attract.push(mk([yoni]));
    votes.stable.push(mk([nadi, { key: "rajju", score: ak.rajju.score, max: ak.rajju.max }]));
  } catch {
    (["mind", "comm", "attract", "stable"] as R4DimKey[]).forEach((k) => votes[k].push(noData("vedic", "คำนวณ ashtakoota ไม่สำเร็จ")));
  }

  // ---- bazi: จาก profiles.bazi_pillars (DB · ไม่คำนวณใหม่ — Layer 0/1 LOCKED) · มิติจิตใจ=日柱 · เสถียรภาพ=กิ่งปี ----
  {
    const pa = resParsePillars(a.baziPillars);
    const pb = resParsePillars(b.baziPillars);
    if (!pa || !pb) {
      votes.mind.push(noData("bazi", "โปรไฟล์ไม่มี bazi_pillars ใน DB"));
      votes.stable.push(noData("bazi", "โปรไฟล์ไม่มี bazi_pillars ใน DB"));
    } else {
      const day = baziRelVote(pa.day?.stem, pa.day?.branch, pb.day?.stem, pb.day?.branch, "日支");
      votes.mind.push(day ? { system: "bazi", vote: day.vote, evidence: day.evidence, metrics: { good: day.good, tense: day.tense } } : noData("bazi", "ไม่มีเสาวัน"));
      const year = baziRelVote(pa.year?.stem, pa.year?.branch, pb.year?.stem, pb.year?.branch, "ปี");
      votes.stable.push(year ? { system: "bazi", vote: year.vote, evidence: year.evidence, metrics: { good: year.good, tense: year.tense } } : noData("bazi", "ไม่มีเสาปี"));
    }
  }

  // ---- ziwei: มิติจิตใจ — 夫妻↔命 (สองทิศ) + 福德↔福德 (กิ่งวัง: 六合/三合=ดี · 沖=ตึง) ----
  try {
    const A = ziweiChart(a.dtUTC, a.lat, a.lng, a.gender as Gender, a.hasTime, { refDate });
    const B = ziweiChart(b.dtUTC, b.lat, b.lng, b.gender as Gender, b.hasTime, { refDate });
    const pal = (c: typeof A, n: string) => c.palaces.find((p) => p.name === n)?.branch;
    const rels: Array<[string, string | undefined, string | undefined]> = [
      ["A夫妻×B命", pal(A, "夫妻"), B.mingGong?.branch],
      ["B夫妻×A命", pal(B, "夫妻"), A.mingGong?.branch],
      ["A福德×B福德", pal(A, "福德"), pal(B, "福德")],
    ];
    let good = 0, tense = 0;
    const ev: string[] = [];
    for (const [label, x, y] of rels) {
      if (!x || !y) continue;
      if (RES_LIUHE[x] === y) { good++; ev.push(`${label}(${x}${y})=六合`); }
      else if (inSanhe(x, y)) { good++; ev.push(`${label}(${x}${y})=三合`); }
      else if (RES_CLASH[x] === y) { tense++; ev.push(`${label}(${x}${y})=沖`); }
    }
    votes.mind.push({
      system: "ziwei",
      vote: good > tense ? "good" : tense > good ? "tense" : "mid",
      evidence: ev.length ? ev.join(" · ") : "夫妻/福德 ไม่มี合/沖เด่น",
      metrics: { good, tense },
    });
  } catch {
    votes.mind.push(noData("ziwei", "คำนวณ ziwei ไม่สำเร็จ"));
  }

  const dimensions: R4DimensionRow[] = (Object.keys(R4_DIMENSIONS) as R4DimKey[]).map((key) => {
    const vs = votes[key];
    const { resonance, conflict } = r4Resolve(vs);
    return { key, votes: vs, resonance, conflict };
  });
  return { a: nameA, b: nameB, skippedNote: null, dimensions };
}

/* ==================== R5 สะพานธาตุ (ดึงปาจื้อเข้าวงผ่าน 用神 จาก DB) ==================== */
export type R5Effect = "support" | "cut" | "mid";
const R5_EFFECT_TH: Record<R5Effect, string> = { support: "หนุน", cut: "ตัด", mid: "กลาง" };
export type R5Evidence = { science: "western" | "qizheng" | "ziwei"; effect: R5Effect | null; detail: string; dates: string[] };
export type R5Person = {
  source: "db_yongshen" | "missing";
  neededElement: ResElement | null;    // 用神 อันดับ 1 จาก top3
  neededElements: ResElement[];        // unique ตามลำดับคะแนน top3
  neededElementTh: string | null;      // "ไฟ(火)"
  dayMasterElement: ResElement | null; // STEM_EL ของ 日干 (จาก bazi_pillars ถ้ามี)
  evidence: R5Evidence[];
  supportCount: number;
  cutCount: number;
  summaryTh: string;
};
function buildR5(b: ResonanceBirth, targetYear: number, westernTl: WesternTimeline | null, qizhengTl: QizhengTimeline | null): R5Person {
  const els = resParseYongshen(b.yongshen);
  const pillars = resParsePillars(b.baziPillars);
  const dmEl = pillars?.day?.stem ? STEM_EL_RES[pillars.day.stem] || null : null;
  if (!els.length) {
    return {
      source: "missing", neededElement: null, neededElements: [], neededElementTh: null, dayMasterElement: dmEl,
      evidence: [], supportCount: 0, cutCount: 0,
      summaryTh: "โปรไฟล์นี้ยังไม่มีข้อมูล用神ใน DB — ข้ามชั้นสะพานธาตุ (ไม่เดาธาตุแทน)",
    };
  }
  const need = els[0];
  const needTh = `${EL_TH_RES[need]}(${EL_ZH_RES[need]})`;
  const evidence: R5Evidence[] = [];
  // (a) western: ดาวธาตุนั้น (map ดาว→ธาตุจีนโบราณ) ทำมุมสำคัญปีเป้าหมาย · trine=หนุน · square/opposition=ตัด · conjunction=กลาง (ทับตีความ 2 ทาง)
  // ⚠️ timeline western สแกน exact transit เฉพาะ Saturn/Jupiter/Mars/Uranus/Neptune/Pluto → ธาตุทอง(金星Venus)/น้ำ(水星Mercury) = ไม่มีข้อมูล (ห้ามอ่าน "ไม่มี hit" เป็น "ไม่มีมุม")
  const WESTERN_TL_TRACKED = new Set(["Jupiter", "Mars", "Saturn"]);
  if (westernTl && !WESTERN_TL_TRACKED.has(EL_QIZHENG_KEY[need])) {
    evidence.push({ science: "western", effect: null, detail: `ดาวธาตุ${needTh} (${EL_QIZHENG_KEY[need]}) เป็นดาวเร็ว — ไม่อยู่ในชุด exact transit ของ timeline (ไม่มีข้อมูล ไม่เดา)`, dates: [] });
  } else if (westernTl) {
    const hits = westernTl.transitHits.filter((h) => PLANET_CN_EL[h.transit] === need);
    const sup = hits.filter((h) => h.aspect === "trine");
    const cut = hits.filter((h) => h.aspect === "square" || h.aspect === "opposition");
    evidence.push({
      science: "western",
      effect: hits.length ? (sup.length > cut.length ? "support" : cut.length > sup.length ? "cut" : "mid") : "mid",
      detail: hits.length
        ? `ดาวธาตุ${needTh} (${hits[0].transitTh}) ทำมุม ${hits.length} ครั้ง: ${hits.slice(0, 3).map((h) => `${h.aspectTh.split(" ")[0]}${h.natalTh} ${h.dateISO}`).join(" · ")}${hits.length > 3 ? " …" : ""}`
        : `ปีนี้ดาวธาตุ${needTh}ไม่ทำมุมสำคัญกับดวง (engine คำนวณแล้ว)`,
      dates: hits.slice(0, 4).map((h) => h.dateISO),
    });
  } else evidence.push({ science: "western", effect: null, detail: "ไม่ได้คำนวณ western ปีนี้", dates: [] });
  // (b) qizheng: 流年ดาวธาตุ用神 อยู่เรือนไหน+สถานะ 廟旺(แรง)=หนุน · 陷落(อับ)=ตัด · อื่น=กลาง + วันที่ hits ของดาวนั้น
  if (qizhengTl) {
    const star = qizhengTl.liuNianStars.find((s) => s.key === EL_QIZHENG_KEY[need]);
    if (star) {
      const strong = star.status === "廟" || star.status === "旺";
      const weak = star.status === "陷" || star.status === "落";
      const starHits = qizhengTl.hits.filter((h) => h.starZh === star.zh);
      evidence.push({
        science: "qizheng",
        effect: strong ? "support" : weak ? "cut" : "mid",
        detail: `流年${star.zh}(ธาตุ${needTh}) เรือน${star.house}${star.houseZh} สถานะ${star.status}${starHits.length ? ` · ชนจุดสำคัญ ${starHits.slice(0, 2).map((h) => `${h.dateISO} ${h.aspect.split("(")[0]}${h.target}`).join(" · ")}` : ""}`,
        dates: starHits.slice(0, 4).map((h) => h.dateISO),
      });
    } else evidence.push({ science: "qizheng", effect: null, detail: `ไม่พบดาวธาตุ${needTh}ใน流年 (engine)`, dates: [] });
  } else evidence.push({ science: "qizheng", effect: null, detail: "ไม่ได้คำนวณ七政ปีนี้", dates: [] });
  // (c) ziwei: engine ยังไม่มีตารางธาตุของดาว 化祿/化忌 → ข้ามฝั่งจื่อเวยอย่างซื่อสัตย์ (ห้ามเดา)
  evidence.push({ science: "ziwei", effect: null, detail: "engine จื่อเวยยังไม่มีตารางธาตุดาว化祿/化忌 — ข้าม (ไม่เดา)", dates: [] });
  const supportCount = evidence.filter((e) => e.effect === "support").length;
  const cutCount = evidence.filter((e) => e.effect === "cut").length;
  const dates = [...new Set(evidence.flatMap((e) => e.dates))].sort().slice(0, 4);
  return {
    source: "db_yongshen", neededElement: need, neededElements: els, neededElementTh: needTh, dayMasterElement: dmEl,
    evidence, supportCount, cutCount,
    summaryTh: `ธาตุที่ดวงต้องการ (${needTh}) ปี ${targetYear} ถูกหนุน ${supportCount} ระบบ / ถูกตัด ${cutCount} ระบบ${dates.length ? ` · วันสำคัญ ${dates.join(", ")}` : ""}`,
  };
}

/* ==================== R6 ปีชง 3 อารยธรรม ==================== */
export type R6Vote = { system: "bazi" | "western" | "vedic" | "uranian"; heavy: boolean | null; rationale: string; dates: string[] };
export type R6Person = {
  targetGanzhi: string;                       // เช่น 2026 = 丙午
  birthYearBranch: string | null;
  birthYearSource: "bazi_pillars" | "tyme_lunar" | null;
  relations: string[];                        // 值太歲/沖/刑/害/破 (ได้หลายอย่างพร้อมกัน)
  votes: R6Vote[];
  voiceCount: number;                         // 0-4 = จำนวนระบบที่บอกปีนี้หนัก (r400: +ยูเรเนียนเป็นเสียงที่ 4 เมื่อผู้ใช้เลือกศาสตร์นี้)
};
/** ganzhi ปีจันทรคติแบบเลขคณิต: ปี 1984=甲子 → stem=(y−4)%10 · branch=(y−4)%12 (สูตรมาตรฐาน 干支紀年) */
function yearGanzhi(y: number): { stem: string; branch: string } {
  return { stem: STEMS_RES[(((y - 4) % 10) + 10) % 10], branch: BRANCHES_RES[(((y - 4) % 12) + 12) % 12] };
}
/** กิ่งปีเกิด (จันทรคติ): baziPillars.year ก่อน (หมายเหตุ: เสาปีปาจื้อใช้立春) · fallback tyme LunarYear
 *  noon-anchor เดียวกับ ziwei overlay xuSuiAt — เกิด ม.ค. ก่อนตรุษจีน LunarYear จะคืนปีก่อนหน้าให้เอง (ไม่ต้องแก้มือ) */
function birthYearBranchOf(b: ResonanceBirth): { branch: string; source: "bazi_pillars" | "tyme_lunar" } | null {
  const p = resParsePillars(b.baziPillars);
  if (p?.year?.branch) return { branch: p.year.branch, source: "bazi_pillars" };
  try {
    const gmtOffsetHours = Math.round(b.lng / 15);
    const d = new Date(b.dtUTC.getTime() + gmtOffsetHours * 3_600_000);
    const st = SolarTime.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0, 0);
    const ly = st.getLunarHour().getLunarDay().getLunarMonth().getLunarYear().getYear();
    return { branch: yearGanzhi(ly).branch, source: "tyme_lunar" };
  } catch { return null; }
}
/** r400 · ตัวกรอง R6 ฝั่งยูเรเนียน (เสียงอารยธรรมที่ 4)
 *  หลักฐานอิสระ = มุมแข็ง directed(Sonnenbogen)/progressed เสาร์/☉/Meridian แตะ natal จุดส่วนตัว ☉/MC/Asc ในปีเป้าหมาย
 *  ⚠️ ตัด method="transit" ทิ้ง (= ดาวจร ephemeris เดียวกับ western → Guard B ห้ามนับซ้ำ) · เอาเฉพาะนาฬิกาทุติยภูมิ (day-for-year)
 *  ⚠️ NO_PERCENT · ไม่แปลง orb เป็น% · แค่ boolean "มีมุมแข็ง = 1 เสียงบอกปีถูกกระตุ้น" ตามความหมาย Auslösung ของ Witte ตรงๆ */
const R6_URANIAN_METHODS: ReadonlySet<AuslosungMethod> = new Set(["solar_arc", "prog_sun", "prog_mc"]);
const R6_URANIAN_MOVERS: ReadonlySet<string> = new Set(["Saturn", "Sun", "Meridian"]);
const R6_URANIAN_TARGETS: ReadonlySet<string> = new Set(["Sun", "Meridian", "Ascendant"]);
const R6_URANIAN_ASPECTS: ReadonlySet<number> = new Set([0, 90, 180]);
function uranianR6Hits(aus: UranianAuslosung): UranianAuslosung["events"] {
  return aus.events.filter((e) =>
    R6_URANIAN_METHODS.has(e.method) &&
    R6_URANIAN_MOVERS.has(e.mover) &&
    e.natalTargetKind === "point" &&
    R6_URANIAN_TARGETS.has(e.natalTarget) &&
    R6_URANIAN_ASPECTS.has(e.aspect));
}
function buildR6(b: ResonanceBirth, targetYear: number, westernTl: WesternTimeline | null, vedicTl: VedicTimeline | null, uranianAus: UranianAuslosung | null): R6Person {
  const tg = yearGanzhi(targetYear);
  const targetGanzhi = tg.stem + tg.branch;
  const by = birthYearBranchOf(b);
  const relations: string[] = [];
  const votes: R6Vote[] = [];
  // (a) จีน: กิ่งปีเกิด vs กิ่งปีเป้าหมาย · 值太歲(ปีชงตัวเอง)/沖(ห่าง6)/刑 = เสียงหนักเต็ม · 害/破 = ชงรองเสริม (ไม่นับเสียงเต็ม — ตำราให้น้ำหนักเบากว่า)
  if (by) {
    const bb = by.branch;
    if (bb === tg.branch) { relations.push("值太歲"); if (RES_SELF_XING.has(bb)) relations.push("刑(自刑)"); }
    if (RES_CLASH[bb] === tg.branch) relations.push("沖");
    if (RES_XING_PAIRS.some(([x, y]) => x === bb && y === tg.branch)) relations.push("刑");
    if (RES_HARM[bb] === tg.branch) relations.push("害");
    if (RES_DESTROY[bb] === tg.branch) relations.push("破");
    const heavy = relations.some((r) => r === "值太歲" || r === "沖" || r.startsWith("刑"));
    const relTxt = relations.length ? relations.join("+") : "ไม่ชง";
    votes.push({
      system: "bazi", heavy,
      rationale: `ปีเกิดกิ่ง${bb} × ปี${targetYear}=${targetGanzhi}(กิ่ง${tg.branch}) → ${relTxt}${relations.includes("沖") ? ` (${bb}${tg.branch}沖 = ปีชงเต็ม)` : ""}${!heavy && relations.length ? " (ชงรอง 害/破 — เสริม ไม่นับเสียงเต็ม)" : ""} [ที่มา ${by.source === "bazi_pillars" ? "เสาปีจาก DB (立春)" : "ปีจันทรคติ tyme (ตรุษจีน)"}]`,
      dates: [],
    });
  } else votes.push({ system: "bazi", heavy: null, rationale: "หากิ่งปีเกิดไม่ได้ (ไม่มี bazi_pillars และ tyme คำนวณไม่สำเร็จ)", dates: [] });
  // (b) western: Saturn hard aspect (conj/square/opposition) → natal Sun/Moon/Asc ปีเป้าหมาย (มีใน timeline แล้ว — อ่านตรง)
  if (westernTl) {
    const satHits = westernTl.transitHits.filter((h) =>
      h.transit === "Saturn" && (h.aspect === "conjunction" || h.aspect === "square" || h.aspect === "opposition") && ["Sun", "Moon", "Ascendant"].includes(h.natal));
    votes.push({
      system: "western", heavy: satHits.length > 0,
      rationale: satHits.length
        ? `เสาร์จรทำมุมหนัก ${satHits.length} ครั้ง: ${satHits.slice(0, 4).map((h) => `${h.aspectTh.split(" ")[0]}${h.natalTh} ${h.dateISO}`).join(" · ")}`
        : "เสาร์จรไม่ทำมุมหนักกับ อาทิตย์/จันทร์/ลัคนา ปีนี้",
      dates: satHits.map((h) => h.dateISO),
    });
  } else votes.push({ system: "western", heavy: null, rationale: "ไม่ได้คำนวณ western ปีนี้", dates: [] });
  // (c) vedic: SadeSati แตะปีเป้าหมายช่วงใดช่วงหนึ่ง (activeAnyTimeInYear จาก engine ตรง)
  if (vedicTl) {
    votes.push({
      system: "vedic", heavy: vedicTl.sadeSati.activeAnyTimeInYear,
      rationale: vedicTl.sadeSati.activeAnyTimeInYear
        ? `SadeSati แตะปีนี้ (${vedicTl.sadeSati.phases.slice(0, 2).map((p) => `${p.phaseTh} ${p.fromISO}`).join(" · ") || "ต่อเนื่องจากปีก่อน"})`
        : "ไม่อยู่ในช่วง SadeSati ปีนี้",
      dates: vedicTl.sadeSati.phases.slice(0, 3).map((p) => p.fromISO),
    });
  } else votes.push({ system: "vedic", heavy: null, rationale: "ไม่ได้คำนวณ vedic ปีนี้", dates: [] });
  // (d) ยูเรเนียน (r400 · เสียงอารยธรรมที่ 4 · เพิ่ม vote เฉพาะเมื่อผู้ใช้เลือกศาสตร์นี้ = uranianAus ไม่ null)
  //     directed/progressed (Sonnenbogen/ก้าวหน้า) เสาร์/☉/Meridian ทำมุมแข็ง 0/90/180 → natal ☉/MC/Asc
  //     = นาฬิกาทุติยภูมิ (N วันหลังเกิด = N ปี) อิสระจากดาวจรทุกศาสตร์ → หลักฐานคนละเรือนจริง (ไม่ทับ transit western/vedic)
  if (uranianAus) {
    const hits = uranianR6Hits(uranianAus);
    const methodTh: Record<string, string> = { solar_arc: "directed(ส่วนโค้งอาทิตย์)", prog_sun: "☉ก้าวหน้า", prog_mc: "Meridianก้าวหน้า" };
    votes.push({
      system: "uranian", heavy: hits.length > 0,
      rationale: hits.length
        ? `directed/ก้าวหน้า เสาร์/☉/Meridian ทำมุมแข็งแตะจุดส่วนตัว (☉/MC/ลัคนา) ${hits.length} จุด: ${hits.slice(0, 4).map((h) => `${h.moverTh}${h.aspectTh.split(" ")[0]}${h.natalTargetTh} [${methodTh[h.method] || h.method}] ${h.dateISO}`).join(" · ")}`
        : "ปีนี้ directed/ก้าวหน้า เสาร์/☉/Meridian ไม่ทำมุมแข็งกับจุดส่วนตัว (☉/เมริเดียน/ลัคนา) — นาฬิกาทุติยภูมิยังไม่ปลุก",
      dates: hits.slice(0, 6).map((h) => h.dateISO),
    });
  }
  return {
    targetGanzhi,
    birthYearBranch: by?.branch || null,
    birthYearSource: by?.source || null,
    relations,
    votes,
    voiceCount: votes.filter((v) => v.heavy === true).length,
  };
}

/* ==================== ต่อคน: R1 + R2 + R3 + CONFLICT ==================== */

function computePerson(b: ResonanceBirth, sciences: ResonanceScience[], targetYear: number): PersonResonance {
  const name = b.name || "ดวง";
  const errors: string[] = [];
  const r1Entries: R1Entry[] = [];
  const monthEvents: ResonanceMonthEvent[] = [];
  const r3Events: { science: ResonanceScience; month: number; dateISO: string | null; evidence: string; driver?: R3EventDriver }[] = [];
  const refDate = new Date(Date.UTC(targetYear, 6, 1)); // กลางปีเป้าหมาย (แนวเดียวกับ multi-year.ts)
  // r370: เก็บ timeline ที่คำนวณแล้วไว้ใช้ต่อใน R5/R6 (ไม่คำนวณซ้ำ — คุม perf)
  let westernTlKeep: WesternTimeline | null = null;
  let vedicTlKeep: VedicTimeline | null = null;
  let qizhengTlKeep: QizhengTimeline | null = null;
  let uranianAusKeep: UranianAuslosung | null = null; // r400 · ใช้เฉพาะ R6 (Guard B: ไม่ push เข้า monthEvents/R2)

  // ---- western ----
  if (sciences.includes("western")) {
    try {
      const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender as Gender);
      const tl = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, targetYear);
      westernTlKeep = tl;
      // R1: profection ทั้ง 2 ช่วงอายุของปีเป้าหมาย
      for (const seg of tl.profection?.segments || []) {
        const themeKey = HOUSE_TO_THEME[seg.profectedHouse];
        if (themeKey) r1Entries.push({ science: "western", house: seg.profectedHouse, themeKey, evidence: `profection เรือน${seg.profectedHouse} (อายุ ${seg.age} · ${seg.fromISO}→${seg.toISO} · เจ้าเรือนปี${seg.lordOfYearTh})` });
      }
      monthEvents.push(...westernEvents(tl));
      // R3: คราสแตะดวง + ราหูจร (Rahu อยู่นอกชุดดาว R2 — เป็นชั้นราหูเกตุโดยตรง)
      for (const e of tl.eclipses) {
        if (e.hitNatal) r3Events.push({ science: "western", month: e.month, dateISO: e.dateISO, evidence: `คราส${e.kind === "solar" ? "สุริยะ" : "จันทร์"}แตะ${e.hitNatal.nameTh} (${e.dateISO})`, driver: "eclipse" });
      }
      for (const h of tl.transitHits) {
        if (h.transit === "Rahu") r3Events.push({ science: "western", month: h.month, dateISO: h.dateISO, evidence: `ราหูจร${h.aspectTh.split(" ")[0]}${h.natalTh} (${h.dateISO})`, driver: "node" });
      }
    } catch (e) { errors.push(`western:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- vedic ----
  if (sciences.includes("vedic")) {
    try {
      const chart = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate);
      const tl = buildVedicTimeline(chart, targetYear);
      vedicTlKeep = tl;
      // R1: Muntha (varshaphala) → เรือนจากลัคนา = ((muntha − lagnaRashi + 12) % 12) + 1
      const muntha = tl.varshaphala?.munthaRashi;
      const lagnaRashi = chart.lagna?.rashi;
      if (muntha != null && lagnaRashi != null) {
        const house = ((muntha - lagnaRashi + 12) % 12) + 1;
        const themeKey = HOUSE_TO_THEME[house];
        if (themeKey) r1Entries.push({ science: "vedic", house, themeKey, evidence: `Muntha ราศี${tl.varshaphala!.munthaRashiTh} = เรือน${house}จากลัคนา (varshaphala ${tl.varshaphala!.dateISO})` });
      }
      monthEvents.push(...vedicEvents(tl));
    } catch (e) { errors.push(`vedic:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- ziwei ----
  if (sciences.includes("ziwei")) {
    try {
      const chart = ziweiChart(b.dtUTC, b.lat, b.lng, b.gender as Gender, b.hasTime, { refDate });
      // R1: 流年命宮 (ตำแหน่ง太歲) ตกวัง natal ไหน — ค่าเดียวกับ dieGong แถว太歲支.natalName
      // 小限: engine ยังไม่มี (ห้ามเดา — จดใน notes ระดับบน)
      if (chart.liuNian) {
        const themeKey = ZIWEI_PALACE_THEME[chart.liuNian.mingPalaceName];
        if (themeKey) r1Entries.push({ science: "ziwei", house: null, themeKey, evidence: `流年命宮ปี${targetYear} (${chart.liuNian.ganzhi}) ตกวัง natal ${chart.liuNian.mingPalaceName}` });
      }
    } catch (e) { errors.push(`ziwei:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- qizheng ----
  if (sciences.includes("qizheng")) {
    try {
      const natal = qizhengNatal(b.dtUTC, b.lat, b.lng, b.hasTime);
      if (natal.hasBirthTime) {
        const tl = buildQizhengTimeline(natal.reading, targetYear, b.lat, b.lng);
        qizhengTlKeep = tl;
        monthEvents.push(...qizhengEvents(tl));
        for (const h of tl.hits) {
          if (h.starZh === "羅睺" || h.starZh === "計都") r3Events.push({ science: "qizheng", month: h.month, dateISO: h.dateISO, evidence: `${h.starZh}${h.aspect.split("(")[0]}${h.target} (${h.dateISO})`, driver: "node" });
        }
      }
    } catch (e) { errors.push(`qizheng:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- ยูเรเนียน (r400 · คำนวณ auslosung ปีเป้าหมายไว้ให้ R6 เท่านั้น · ไม่ผลิต monthEvent → ไม่แตะ R1/R2/R3/R5/CONFLICT) ----
  if (sciences.includes("uranian")) {
    try {
      const uchart = uranianChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender as Gender);
      uranianAusKeep = computeUranianAuslosung(uchart, b.dtUTC, `${targetYear}-01-01`, `${targetYear}-12-31`);
    } catch (e) { errors.push(`uranian:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- R1: ธีมเดียวกัน ≥2 ศาสตร์ ----
  const byTheme = new Map<ResonanceThemeKey, R1Entry[]>();
  for (const e of r1Entries) (byTheme.get(e.themeKey) ?? byTheme.set(e.themeKey, []).get(e.themeKey)!).push(e);
  const resonant: R1Resonant[] = [];
  for (const [themeKey, entries] of [...byTheme.entries()].sort((a, b) => RESONANCE_THEMES[a[0]].house - RESONANCE_THEMES[b[0]].house)) {
    const sciSet = [...new Set(entries.map((e) => e.science))].sort((a, b) => sciOrder(a) - sciOrder(b));
    if (sciSet.length < 2) continue;
    const { th, en, zh } = RESONANCE_THEMES[themeKey];
    resonant.push({
      themeKey, theme: { th, en, zh }, sciences: sciSet,
      evidences: entries.slice().sort((a, b) => sciOrder(a.science) - sciOrder(b.science)).map((e) => ({ science: e.science, evidence: e.evidence })),
    });
  }

  return {
    name,
    skippedNote: null,
    r1: { entries: r1Entries, resonant },
    r2: clusterByMonth(monthEvents),
    r3: clusterEclipseByMonth(r3Events),
    conflicts: findConflicts(monthEvents),
    errors,
    // r370: R5/R6 ใช้ timeline ที่คำนวณแล้วข้างบน (reuse · ไม่คำนวณซ้ำ) — ศาสตร์ที่ไม่ได้เลือก/พัง = โหวต null ซื่อตรง
    r5: buildR5(b, targetYear, westernTlKeep, qizhengTlKeep),
    r6: buildR6(b, targetYear, westernTlKeep, vedicTlKeep, uranianAusKeep),
  };
}

/* ==================== entry หลัก ==================== */

export function buildResonance(
  births: ResonanceBirth[],
  sciences: ScienceId[],
  targetYear: number,
  _refDate: Date, // สงวนไว้ตาม signature route (ปัจจุบันใช้กลางปีเป้าหมายภายใน — deterministic)
  timeBudgetMs = 8_000,
): FusionResonance {
  const t0 = Date.now();
  const resSciences = RESONANCE_SCIENCES.filter((s) => sciences.includes(s));
  const notes: string[] = [
    "bazi ยังไม่ร่วมชั้น resonance R1-R3 (ระบบเรือน/จรคนละตรรกะ) — r370 เข้าร่วมผ่าน R4(日柱/ปี) R5(用神) R6(กิ่งปี) จากข้อมูล DB",
    "ziwei 小限 ยังไม่มีใน engine — R1 ฝั่ง ziwei ใช้流年命宮อย่างเดียว",
    "R5: mapping ดาว→ธาตุ (木星ไม้/火星ไฟ/土星ดิน/金星ทอง/水星น้ำ) เป็นชื่อดาวจีนโบราณ ไม่ใช่ western element · ziwei ไม่ร่วม R5 (engine ไม่มีตารางธาตุดาว化曜)",
  ];
  const capped = births.slice(0, 4);
  const perPerson: PersonResonance[] = [];
  for (let i = 0; i < capped.length; i++) {
    const b = capped[i];
    const name = b.name || `คนที่${i + 1}`;
    if (!b.hasTime) {
      perPerson.push({ name, skippedNote: "ไม่ทราบเวลาเกิด — ข้ามชั้น resonance (ทุกศาสตร์ในชั้นนี้ต้องมีลัคนา/宮จากเวลาเกิด)", r1: { entries: [], resonant: [] }, r2: [], r3: [], conflicts: [], errors: [], r5: null, r6: null });
      continue;
    }
    // คุมงบเวลา: คนแรก (focus) คำนวณเสมอ · คนถัดไปถ้าเกินงบให้ข้ามพร้อมเหตุผล (กัน POST ช้าเกิน)
    if (i > 0 && Date.now() - t0 > timeBudgetMs) {
      perPerson.push({ name, skippedNote: `ข้ามเพราะเกินงบเวลาคำนวณ resonance (${timeBudgetMs / 1000}s) — มีผลเฉพาะดวงแรกที่เป็น focus`, r1: { entries: [], resonant: [] }, r2: [], r3: [], conflicts: [], errors: [], r5: null, r6: null });
      continue;
    }
    perPerson.push(computePerson(b, resSciences, targetYear));
  }

  // ---- r370 · R4 เสียงสะท้อนดวงคู่ (ทุกคู่ i<j ของคนที่คำนวณจริง · 4 ดวง = 6 คู่) ----
  const r4Pairs: R4Pair[] = [];
  if (capped.length >= 2) {
    const refDate = new Date(Date.UTC(targetYear, 6, 1));
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const nameA = perPerson[i].name, nameB = perPerson[j].name;
        if (perPerson[i].skippedNote || perPerson[j].skippedNote) {
          r4Pairs.push({ a: nameA, b: nameB, skippedNote: "ข้ามคู่นี้ — มีฝ่ายที่ถูกข้าม (ไม่มีเวลาเกิด/เกินงบเวลา)", dimensions: [] });
          continue;
        }
        if (Date.now() - t0 > timeBudgetMs) {
          r4Pairs.push({ a: nameA, b: nameB, skippedNote: `ข้ามคู่นี้ — เกินงบเวลาคำนวณ resonance (${timeBudgetMs / 1000}s)`, dimensions: [] });
          continue;
        }
        r4Pairs.push(buildR4Pair(capped[i], capped[j], nameA, nameB, refDate));
      }
    }
  }

  const nR1 = perPerson.reduce((s, p) => s + p.r1.resonant.length, 0);
  // v3: คะแนน/จำนวนในสรุปนับเฉพาะ independent (structural = พ้องเชิงโครงสร้าง ไม่ใช่หลักฐานซ้ำ — แจ้งแยก)
  const nR2 = perPerson.reduce((s, p) => s + p.r2.filter((c) => c.independence !== "structural").length, 0);
  const nR3 = perPerson.reduce((s, p) => s + p.r3.filter((c) => c.independence !== "structural").length, 0);
  const nStruct = perPerson.reduce((s, p) => s + p.r2.filter((c) => c.independence === "structural").length + p.r3.filter((c) => c.independence === "structural").length, 0);
  const nCf = perPerson.reduce((s, p) => s + p.conflicts.length, 0);
  const nR4 = r4Pairs.reduce((s, p) => s + p.dimensions.filter((d) => d.resonance).length, 0);
  const nR6 = perPerson.filter((p) => (p.r6?.voiceCount || 0) >= 2).length;
  const summaryTh = `ปี ${targetYear}: ธีมปีตรงกัน ${nR1} จุด · ดาวเดียวกันชน ≥2 ศาสตร์ ${nR2} เดือน-ดาว · คราส/ราหูเกตุตรงเดือน ${nR3} เดือน${nStruct ? ` · พ้องเชิงโครงสร้าง ${nStruct} รายการ (ไม่นับเป็นหลักฐานซ้ำ)` : ""} · มุมมองต่าง ${nCf} รายการ (จาก ${resSciences.length} ศาสตร์: ${resSciences.map((s) => SCI_TH[s]).join("/")})${r4Pairs.length ? ` · ดวงคู่สะท้อน ${nR4} มิติ (${r4Pairs.length} คู่)` : ""}${nR6 ? ` · ปีชง ≥2 เสียง ${nR6} คน` : ""}`;

  return { version: "resonance_v1", targetYear, sciences: resSciences, perPerson, r4Pairs, summaryTh, notes, computeMs: Date.now() - t0 };
}

/* ==================== render บล็อก prompt (ไทย · r370 cap ≤4500 · ตัดฉลาด) ==================== */

/** r370: งบ block รวม R1-R6 (เดิม 3000 · v2 เพิ่ม R4/R5/R6 → 4500 ตาม spec) */
export const RESONANCE_BLOCK_MAX_CHARS = 4_500;
const MAX_BLOCK_CHARS = RESONANCE_BLOCK_MAX_CHARS;

const sysThR4 = (s: R4System) => (s === "bazi" ? "ปาจื้อ" : SCI_TH[s]);

export function renderResonanceBlockTh(res: FusionResonance): string {
  // บรรทัดเนื้อหา + priority ใช้ตอนตัดงบ: 1 = แกน (สรุป/สะท้อน) · 2 = รายละเอียดรอง (ตัดก่อนเมื่อเกินงบ = "ตัดฉลาด")
  const body: { s: string; prio: 1 | 2 }[] = [];
  const push = (s: string, prio: 1 | 2 = 1) => body.push({ s, prio });
  const head = [
    "=== RESONANCE_PACKET (คำนวณจริง ห้ามแก้ตัวเลข) ===",
    `ปีเป้าหมาย ${res.targetYear} · ศาสตร์ที่เทียบ: ${res.sciences.map((s) => SCI_TH[s]).join("/")} · ${res.summaryTh}`,
  ];
  for (const p of res.perPerson) {
    push(`-- ${p.name} --`);
    if (p.skippedNote) { push(`  (${p.skippedNote})`); continue; }
    if (p.r1.resonant.length) {
      for (const r of p.r1.resonant.slice(0, 4)) {
        push(`  R1 ธีมปีตรงกัน "${r.theme.th}": ${r.evidences.map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
      }
    } else {
      const solo = p.r1.entries.slice(0, 4).map((e) => `${SCI_TH[e.science]}=${RESONANCE_THEMES[e.themeKey].th}`).join(" · ");
      push(`  R1: ไม่มีธีมปีที่ ≥2 ศาสตร์ตรงกัน${solo ? ` (รายศาสตร์: ${solo})` : ""}`);
    }
    // v3: แยกสองกลุ่ม — 🥇 ยืนยันอิสระ (prio 1) มาก่อน · ℹ️ พ้องเชิงโครงสร้าง (prio 2 = โดนตัดก่อนเมื่อเกินงบ)
    // field independence อาจหายใน jsonb เก่า → อ่านค่าที่หายเป็น independent (พฤติกรรมเท่าเดิม)
    // เลือกหลักฐานสูงสุด 2 จุด/ศาสตร์ — กันศาสตร์ที่ event เยอะ (เช่น western) เบียดศาสตร์อื่นตกขอบ
    const pickPerSci = (evs: { science: ResonanceScience; evidence: string }[]) => {
      const cnt = new Map<ResonanceScience, number>();
      return evs.filter((e) => {
        const n = (cnt.get(e.science) || 0) + 1;
        cnt.set(e.science, n);
        return n <= 2;
      });
    };
    const r2Ind = p.r2.filter((c) => c.independence !== "structural");
    const r2Str = p.r2.filter((c) => c.independence === "structural");
    if (r2Ind.length) {
      push("  R2 🥇 ยืนยันอิสระ (นาฬิกาคนละเรือน):");
      for (const c of r2Ind.slice(0, 6)) push(`  R2 เดือน ${c.month} ${c.planetTh} ชน ${c.sciences.length} ศาสตร์: ${pickPerSci(c.evidences).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
    } else push(`  R2: ไม่มีเดือนที่ดาวดวงเดียวกันชน ≥2 ศาสตร์${r2Str.length ? "แบบอิสระ" : ""}`);
    if (r2Str.length) {
      push("  R2 ℹ️ พ้องเชิงโครงสร้าง (วัดของชิ้นเดียวกัน — ไม่นับเป็นหลักฐานซ้ำ):", 2);
      for (const c of r2Str.slice(0, 3)) push(`    · เดือน ${c.month} ${c.planetTh}: ${pickPerSci(c.evidences).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`, 2);
    }
    const r3Ind = p.r3.filter((c) => c.independence !== "structural");
    const r3Str = p.r3.filter((c) => c.independence === "structural");
    if (r3Ind.length) {
      push("  R3 🥇 ยืนยันอิสระ (นาฬิกาคนละเรือน):");
      for (const c of r3Ind.slice(0, 4)) push(`  R3 คราส/ราหูเกตุ เดือน ${c.month}: ${c.evidences.slice(0, 4).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
    } else push(`  R3: ไม่มีเดือนคราส/ราหูเกตุที่ ≥2 ศาสตร์ตรงกัน${r3Str.length ? "แบบอิสระ" : ""}`);
    if (r3Str.length) {
      push("  R3 ℹ️ พ้องเชิงโครงสร้าง (วัดของชิ้นเดียวกัน — ไม่นับเป็นหลักฐานซ้ำ):", 2);
      for (const c of r3Str.slice(0, 2)) push(`    · เดือน ${c.month}: ${c.evidences.slice(0, 3).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`, 2);
    }
    for (const cf of p.conflicts.slice(0, 3)) {
      push(`  ⚡มุมมองต่าง เดือน ${cf.month}: ${SCI_TH[cf.beneficScience]}เห็นดี(${cf.beneficEvidence.join(", ")}) แต่ ${SCI_TH[cf.maleficScience]}เห็นแรงกด(${cf.maleficEvidence.join(", ")})`);
    }
    // ---- r370 · R5 สะพานธาตุ ----
    if (p.r5) {
      push(`  R5 สะพานธาตุ: ${p.r5.summaryTh}${p.r5.dayMasterElement ? ` (日干ธาตุ${EL_TH_RES[p.r5.dayMasterElement]})` : ""}`);
      if (p.r5.source === "db_yongshen") {
        for (const e of p.r5.evidence.filter((x) => x.effect !== null)) {
          push(`    · ${e.science === "western" ? "ตะวันตก" : e.science === "qizheng" ? "七政" : "จื่อเวย"}=${e.effect ? R5_EFFECT_TH[e.effect] : "-"}: ${e.detail}`, 2);
        }
      }
    }
    // ---- r370 · R6 ปีชง 3 อารยธรรม ----
    if (p.r6) {
      const v = (s: R6Vote["system"]) => p.r6!.votes.find((x) => x.system === s);
      const mark = (x?: R6Vote) => (x ? (x.heavy === true ? "✓หนัก" : x.heavy === false ? "✗" : "–ไม่มีข้อมูล") : "–");
      const r6Label = (s: R6Vote["system"]) => (s === "bazi" ? "จีน" : s === "western" ? "ตะวันตก" : s === "vedic" ? "พระเวท" : "ยูเรเนียน");
      const ura = v("uranian"); // r400: เสียงที่ 4 (เพิ่มบรรทัดเฉพาะเมื่อผู้ใช้เลือกยูเรเนียน)
      push(`  R6 ปีชง ${p.r6.targetGanzhi}: จีน=${mark(v("bazi"))} · ตะวันตก(เสาร์)=${mark(v("western"))} · พระเวท(SadeSati)=${mark(v("vedic"))}${ura ? ` · ยูเรเนียน(directed/ก้าวหน้า)=${mark(ura)}` : ""} → ${p.r6.voiceCount}/${p.r6.votes.length} เสียงบอกปีหนัก`);
      for (const x of p.r6.votes) push(`    · ${r6Label(x.system)}: ${x.rationale}`, 2);
    }
    if (p.errors.length) push(`  (คำนวณไม่สำเร็จบางศาสตร์: ${p.errors.join(" · ")})`);
  }
  // ---- r370 · R4 เสียงสะท้อนดวงคู่ (ต่อคู่ i<j) ----
  for (const pair of res.r4Pairs || []) {
    push(`-- คู่ ${pair.a}×${pair.b} · R4 มิติความเข้ากัน (โหวต ดี/กลาง/ตึง ต่อระบบ · เกณฑ์ deterministic จาก engine) --`);
    if (pair.skippedNote) { push(`  (${pair.skippedNote})`); continue; }
    for (const d of pair.dimensions) {
      const votes = d.votes.map((x) => `${sysThR4(x.system)}=${x.vote ? R4_VOTE_TH[x.vote] : "ไม่มีข้อมูล"}`).join(" | ");
      const tag = d.conflict ? " ⚡มุมมองต่าง (ดี vs ตึง)" : d.resonance ? ` → สะท้อน "${R4_VOTE_TH[d.resonance]}" ≥2 ระบบ` : "";
      push(`  ${R4_DIMENSIONS[d.key].th}: ${votes}${tag}`);
      for (const x of d.votes.filter((y) => y.vote !== null)) push(`    · ${sysThR4(x.system)}: ${x.evidence}`, 2);
    }
  }
  const tail = [
    "ใช้ตารางนี้เป็นชั้น 'หลายศาสตร์ยืนยันตรงกัน' ก่อนวิเคราะห์ · ห้ามสร้างจุดตรงกันเพิ่มนอกรายการ",
    "=== END_RESONANCE_PACKET ===",
  ];
  // คุมงบ ≤4500 แบบตัดฉลาด (deterministic): เกินงบ → ตัดบรรทัดรายละเอียดรอง (prio 2) จากท้ายก่อน · ยังเกิน → ตัดบรรทัดท้ายสุดตามเดิม
  const joined = () => [...head, ...body.map((x) => x.s), ...tail].join("\n");
  if (joined().length > MAX_BLOCK_CHARS) {
    const fits = () => [...head, ...body.map((x) => x.s), "  [ตัดบางรายการเพราะเกินงบพื้นที่]", ...tail].join("\n").length <= MAX_BLOCK_CHARS;
    while (!fits() && body.some((x) => x.prio === 2)) {
      const idx = body.map((x) => x.prio).lastIndexOf(2);
      body.splice(idx, 1);
    }
    while (!fits() && body.length > 0) body.pop();
    body.push({ s: "  [ตัดบางรายการเพราะเกินงบพื้นที่]", prio: 1 });
  }
  return joined().slice(0, MAX_BLOCK_CHARS);
}
