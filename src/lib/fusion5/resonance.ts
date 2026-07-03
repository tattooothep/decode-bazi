/**
 * fusion5 · r369 "Cross-Science Resonance Layer"
 * engine deterministic หา "จุดที่หลายศาสตร์เห็นตรงกัน" ก่อนส่งให้ AI (AI ห้ามแก้ตัวเลข)
 * ศาสตร์ที่ร่วมชั้นนี้ v1: western / vedic / ziwei / qizheng (bazi ยังไม่ร่วม — ระบบเรือน/จรคนละตรรกะ รอ v2)
 * เงื่อนไข: คำนวณเฉพาะดวงที่มีเวลาเกิด (ทุกชั้นที่ใช้ต้องมีลัคนา/宮) · ศาสตร์ใดพังคำนวณ = ข้ามศาสตร์นั้น ไม่ล้มทั้งก้อน
 *
 * 3 ชนิด resonance:
 *   R1 ปีเรือนตรงกัน  — western annual profection (2 ช่วงอายุ) · vedic Muntha (varshaphala) · ziwei 流年命宮ตกวัง natal
 *   R2 ดาวจริงดวงเดียวกันชนหลายกรอบ — western exact transit vs qizheng 木土羅計火 hits vs vedic (Saturn/Jupiter เปลี่ยนราศี + SadeSati เข้าเฟส)
 *   R3 คราส/ราหูเกตุ — western eclipse แตะดวง + western Rahu transit + qizheng 羅睺/計都 hits (เดือนเดียวกัน ≥2 ศาสตร์)
 * CONFLICT (v1 แบบซื่อตรง): เดือนที่ศาสตร์หนึ่งมีแต่เหตุการณ์ดี อีกศาสตร์มีแต่เหตุการณ์ร้าย → "มุมมองต่าง"
 *   ข้อจำกัด v1: polarity ประเมินจากชนิดดาว+มุม/恩用仇難 เท่านั้น (ไม่ชั่งน้ำหนักบริบทดวง) · vedic ไม่ร่วม conflict (event ไม่ละเอียดพอรายเดือน)
 */
import { westernChart, type Gender } from "../astro/western/engine";
import { buildWesternTimeline, type WesternTimeline } from "../astro/western/timeline";
import { vedicChart } from "../astro/vedic/engine";
import { buildVedicTimeline, type VedicTimeline } from "../astro/vedic/timeline";
import { ziweiChart } from "../astro/ziwei/engine";
import { qizhengNatal } from "../astro/qizheng/engine";
import { buildQizhengTimeline, type QizhengTimeline } from "../astro/qizheng/timeline";
import type { ScienceId } from "./disciplines";
import type { FusionBirthLike } from "./multi-year";

export type ResonanceScience = Extract<ScienceId, "western" | "vedic" | "ziwei" | "qizheng">;
export const RESONANCE_SCIENCES: ResonanceScience[] = ["western", "vedic", "ziwei", "qizheng"];
const SCI_TH: Record<ResonanceScience, string> = { western: "ตะวันตก", vedic: "พระเวท", ziwei: "จื่อเวย", qizheng: "ดาวจริง七政" };

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
export type ResonancePlanet = "Saturn" | "Jupiter" | "Mars" | "Node" | "Uranus" | "Neptune" | "Pluto";
const PLANET_TH: Record<ResonancePlanet, string> = {
  Saturn: "เสาร์(土)", Jupiter: "พฤหัส(木)", Mars: "อังคาร(火)", Node: "ราหู-เกตุ(羅計)",
  Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
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

export type R1Entry = { science: ResonanceScience; house: number | null; themeKey: ResonanceThemeKey; evidence: string };
export type R1Resonant = { themeKey: ResonanceThemeKey; theme: { th: string; en: string; zh: string }; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; evidence: string }[] };
export type R2Cluster = { month: number; planet: ResonancePlanet; planetTh: string; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; dateISO: string | null; evidence: string }[] };
export type R3Cluster = { month: number; sciences: ResonanceScience[]; evidences: { science: ResonanceScience; dateISO: string | null; evidence: string }[] };
export type ConflictRow = { month: number; beneficScience: ResonanceScience; maleficScience: ResonanceScience; beneficEvidence: string[]; maleficEvidence: string[] };

export type PersonResonance = {
  name: string;
  skippedNote: string | null;      // ไม่มีเวลาเกิด / เกินงบเวลา → ข้ามพร้อมเหตุผล
  r1: { entries: R1Entry[]; resonant: R1Resonant[] };
  r2: R2Cluster[];
  r3: R3Cluster[];
  conflicts: ConflictRow[];
  errors: string[];                // ศาสตร์ที่คำนวณพัง (ศาสตร์อื่นเดินต่อ)
};

export type FusionResonance = {
  version: "resonance_v1";
  targetYear: number;
  sciences: ResonanceScience[];
  perPerson: PersonResonance[];
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
      sciences,
      evidences: evs
        .slice()
        .sort((a, b) => sciOrder(a.science) - sciOrder(b.science) || String(a.dateISO).localeCompare(String(b.dateISO)))
        .map((e) => ({ science: e.science, dateISO: e.dateISO, evidence: e.evidence })),
    });
  }
  return out;
}

/** R3: จับกลุ่มรายเดือน (ไม่แยกดาว) ที่ ≥2 ศาสตร์เห็นพร้อมกัน */
export function clusterEclipseByMonth(events: { science: ResonanceScience; month: number; dateISO: string | null; evidence: string }[]): R3Cluster[] {
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
      sciences,
      evidences: evs
        .slice()
        .sort((a, b) => sciOrder(a.science) - sciOrder(b.science) || String(a.dateISO).localeCompare(String(b.dateISO)))
        .map((e) => ({ science: e.science, dateISO: e.dateISO, evidence: e.evidence })),
    });
  }
  return out;
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

/* ==================== ต่อคน: R1 + R2 + R3 + CONFLICT ==================== */

function computePerson(b: FusionBirthLike, sciences: ResonanceScience[], targetYear: number): PersonResonance {
  const name = b.name || "ดวง";
  const errors: string[] = [];
  const r1Entries: R1Entry[] = [];
  const monthEvents: ResonanceMonthEvent[] = [];
  const r3Events: { science: ResonanceScience; month: number; dateISO: string | null; evidence: string }[] = [];
  const refDate = new Date(Date.UTC(targetYear, 6, 1)); // กลางปีเป้าหมาย (แนวเดียวกับ multi-year.ts)

  // ---- western ----
  if (sciences.includes("western")) {
    try {
      const chart = westernChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender as Gender);
      const tl = buildWesternTimeline(chart, { dtUTC: b.dtUTC, lat: b.lat, lng: b.lng }, targetYear);
      // R1: profection ทั้ง 2 ช่วงอายุของปีเป้าหมาย
      for (const seg of tl.profection?.segments || []) {
        const themeKey = HOUSE_TO_THEME[seg.profectedHouse];
        if (themeKey) r1Entries.push({ science: "western", house: seg.profectedHouse, themeKey, evidence: `profection เรือน${seg.profectedHouse} (อายุ ${seg.age} · ${seg.fromISO}→${seg.toISO} · เจ้าเรือนปี${seg.lordOfYearTh})` });
      }
      monthEvents.push(...westernEvents(tl));
      // R3: คราสแตะดวง + ราหูจร (Rahu อยู่นอกชุดดาว R2 — เป็นชั้นราหูเกตุโดยตรง)
      for (const e of tl.eclipses) {
        if (e.hitNatal) r3Events.push({ science: "western", month: e.month, dateISO: e.dateISO, evidence: `คราส${e.kind === "solar" ? "สุริยะ" : "จันทร์"}แตะ${e.hitNatal.nameTh} (${e.dateISO})` });
      }
      for (const h of tl.transitHits) {
        if (h.transit === "Rahu") r3Events.push({ science: "western", month: h.month, dateISO: h.dateISO, evidence: `ราหูจร${h.aspectTh.split(" ")[0]}${h.natalTh} (${h.dateISO})` });
      }
    } catch (e) { errors.push(`western:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
  }

  // ---- vedic ----
  if (sciences.includes("vedic")) {
    try {
      const chart = vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate);
      const tl = buildVedicTimeline(chart, targetYear);
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
        monthEvents.push(...qizhengEvents(tl));
        for (const h of tl.hits) {
          if (h.starZh === "羅睺" || h.starZh === "計都") r3Events.push({ science: "qizheng", month: h.month, dateISO: h.dateISO, evidence: `${h.starZh}${h.aspect.split("(")[0]}${h.target} (${h.dateISO})` });
        }
      }
    } catch (e) { errors.push(`qizheng:${e instanceof Error ? e.message.slice(0, 60) : "error"}`); }
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
  };
}

/* ==================== entry หลัก ==================== */

export function buildResonance(
  births: FusionBirthLike[],
  sciences: ScienceId[],
  targetYear: number,
  _refDate: Date, // สงวนไว้ตาม signature route (ปัจจุบันใช้กลางปีเป้าหมายภายใน — deterministic)
  timeBudgetMs = 8_000,
): FusionResonance {
  const t0 = Date.now();
  const resSciences = RESONANCE_SCIENCES.filter((s) => sciences.includes(s));
  const notes: string[] = [
    "bazi ยังไม่ร่วมชั้น resonance v1 (ระบบเรือน/จรคนละตรรกะ)",
    "ziwei 小限 ยังไม่มีใน engine — R1 ฝั่ง ziwei ใช้流年命宮อย่างเดียว",
  ];
  const perPerson: PersonResonance[] = [];
  for (let i = 0; i < births.slice(0, 4).length; i++) {
    const b = births[i];
    const name = b.name || `คนที่${i + 1}`;
    if (!b.hasTime) {
      perPerson.push({ name, skippedNote: "ไม่ทราบเวลาเกิด — ข้ามชั้น resonance (ทุกศาสตร์ในชั้นนี้ต้องมีลัคนา/宮จากเวลาเกิด)", r1: { entries: [], resonant: [] }, r2: [], r3: [], conflicts: [], errors: [] });
      continue;
    }
    // คุมงบเวลา: คนแรก (focus) คำนวณเสมอ · คนถัดไปถ้าเกินงบให้ข้ามพร้อมเหตุผล (กัน POST ช้าเกิน)
    if (i > 0 && Date.now() - t0 > timeBudgetMs) {
      perPerson.push({ name, skippedNote: `ข้ามเพราะเกินงบเวลาคำนวณ resonance (${timeBudgetMs / 1000}s) — มีผลเฉพาะดวงแรกที่เป็น focus`, r1: { entries: [], resonant: [] }, r2: [], r3: [], conflicts: [], errors: [] });
      continue;
    }
    perPerson.push(computePerson(b, resSciences, targetYear));
  }

  const nR1 = perPerson.reduce((s, p) => s + p.r1.resonant.length, 0);
  const nR2 = perPerson.reduce((s, p) => s + p.r2.length, 0);
  const nR3 = perPerson.reduce((s, p) => s + p.r3.length, 0);
  const nCf = perPerson.reduce((s, p) => s + p.conflicts.length, 0);
  const summaryTh = `ปี ${targetYear}: ธีมปีตรงกัน ${nR1} จุด · ดาวเดียวกันชน ≥2 ศาสตร์ ${nR2} เดือน-ดาว · คราส/ราหูเกตุตรงเดือน ${nR3} เดือน · มุมมองต่าง ${nCf} รายการ (จาก ${resSciences.length} ศาสตร์: ${resSciences.map((s) => SCI_TH[s]).join("/")})`;

  return { version: "resonance_v1", targetYear, sciences: resSciences, perPerson, summaryTh, notes, computeMs: Date.now() - t0 };
}

/* ==================== render บล็อก prompt (ไทย · ≤3000 ตัวอักษร) ==================== */

const MAX_BLOCK_CHARS = 3_000;

export function renderResonanceBlockTh(res: FusionResonance): string {
  const L: string[] = [];
  L.push("=== RESONANCE_PACKET (คำนวณจริง ห้ามแก้ตัวเลข) ===");
  L.push(`ปีเป้าหมาย ${res.targetYear} · ศาสตร์ที่เทียบ: ${res.sciences.map((s) => SCI_TH[s]).join("/")} · ${res.summaryTh}`);
  for (const p of res.perPerson) {
    L.push(`-- ${p.name} --`);
    if (p.skippedNote) { L.push(`  (${p.skippedNote})`); continue; }
    if (p.r1.resonant.length) {
      for (const r of p.r1.resonant.slice(0, 4)) {
        L.push(`  R1 ธีมปีตรงกัน "${r.theme.th}": ${r.evidences.map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
      }
    } else {
      const solo = p.r1.entries.slice(0, 4).map((e) => `${SCI_TH[e.science]}=${RESONANCE_THEMES[e.themeKey].th}`).join(" · ");
      L.push(`  R1: ไม่มีธีมปีที่ ≥2 ศาสตร์ตรงกัน${solo ? ` (รายศาสตร์: ${solo})` : ""}`);
    }
    if (p.r2.length) {
      // เลือกหลักฐานสูงสุด 2 จุด/ศาสตร์ — กันศาสตร์ที่ event เยอะ (เช่น western) เบียดศาสตร์อื่นตกขอบ
      const pickPerSci = (evs: { science: ResonanceScience; evidence: string }[]) => {
        const cnt = new Map<ResonanceScience, number>();
        return evs.filter((e) => {
          const n = (cnt.get(e.science) || 0) + 1;
          cnt.set(e.science, n);
          return n <= 2;
        });
      };
      for (const c of p.r2.slice(0, 6)) L.push(`  R2 เดือน ${c.month} ${c.planetTh} ชน ${c.sciences.length} ศาสตร์: ${pickPerSci(c.evidences).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
    } else L.push("  R2: ไม่มีเดือนที่ดาวดวงเดียวกันชน ≥2 ศาสตร์");
    if (p.r3.length) {
      for (const c of p.r3.slice(0, 4)) L.push(`  R3 คราส/ราหูเกตุ เดือน ${c.month}: ${c.evidences.slice(0, 4).map((e) => `${SCI_TH[e.science]}=${e.evidence}`).join(" | ")}`);
    } else L.push("  R3: ไม่มีเดือนคราส/ราหูเกตุที่ ≥2 ศาสตร์ตรงกัน");
    for (const cf of p.conflicts.slice(0, 3)) {
      L.push(`  ⚡มุมมองต่าง เดือน ${cf.month}: ${SCI_TH[cf.beneficScience]}เห็นดี(${cf.beneficEvidence.join(", ")}) แต่ ${SCI_TH[cf.maleficScience]}เห็นแรงกด(${cf.maleficEvidence.join(", ")})`);
    }
    if (p.errors.length) L.push(`  (คำนวณไม่สำเร็จบางศาสตร์: ${p.errors.join(" · ")})`);
  }
  L.push("ใช้ตารางนี้เป็นชั้น 'หลายศาสตร์ยืนยันตรงกัน' ก่อนวิเคราะห์ · ห้ามสร้างจุดตรงกันเพิ่มนอกรายการ");
  L.push("=== END_RESONANCE_PACKET ===");
  // คุมงบ ≤3000: ตัดบรรทัดเนื้อหาท้ายสุดออกทีละบรรทัด (คงหัว 2 บรรทัด + ท้ายกำกับ 2 บรรทัด) — deterministic
  const head = L.slice(0, 2);
  const tail = L.slice(-2);
  let body = L.slice(2, -2);
  const overBudget = () => [...head, ...body, ...tail].join("\n").length > MAX_BLOCK_CHARS;
  if (overBudget()) {
    while (body.length > 0 && [...head, ...body, "  [ตัดบางรายการเพราะเกินงบพื้นที่]", ...tail].join("\n").length > MAX_BLOCK_CHARS) {
      body = body.slice(0, -1);
    }
    body = [...body, "  [ตัดบางรายการเพราะเกินงบพื้นที่]"];
  }
  return [...head, ...body, ...tail].join("\n").slice(0, MAX_BLOCK_CHARS);
}
