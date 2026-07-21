import { spawn, execFileSync } from "child_process";
import { chmodSync, chownSync, rmSync, writeFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { calcBazi, type BaziAnalysis } from "@/lib/bazi-calc";
import { isSifuAnswerLang, LANG_ANSWER_DIRECTIVE } from "@/lib/sifu-answer-lang";
import { buildAskAnchors, anchorIds, type AskAnchorBundle } from "./anchors";
import { GROK_TEXT_ONLY_ARGS } from "@/lib/ai-cli-security";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const CHILD_USER = process.env.ASK_REPORT_CHILD_USER || "jarvis";
const GROK_BIN = process.env.ASK_REPORT_GROK_BIN || process.env.SIFU_GROK_BIN || "/root/.grok/bin/grok";
const GROK_CWD = process.env.ASK_REPORT_GROK_CWD || process.env.SIFU_GROK_CWD || "/home/jarvis";
const GROK_MODEL = (process.env.ASK_REPORT_GROK_MODEL || process.env.SIFU_GROK_MODEL || "").trim();
const GROK_TIMEOUT_MS = clampNumber(Number(process.env.ASK_REPORT_GROK_TIMEOUT_MS || 55_000), 8_000, 120_000);
const LIVE_ENABLED = process.env.ASK_REPORT_LIVE !== "0";
const LIVE_WINDOW_MS = clampNumber(Number(process.env.ASK_REPORT_LIVE_WINDOW_MS || 60_000), 10_000, 300_000);
const LIVE_MAX_PER_WINDOW = clampNumber(Number(process.env.ASK_REPORT_LIVE_MAX_PER_WINDOW || 2), 1, 12);

const STEM_ELEMENT_TH: Record<string, string> = {
  "甲": "ไม้หยาง",
  "乙": "ไม้หยิน",
  "丙": "ไฟหยาง",
  "丁": "ไฟหยิน",
  "戊": "ดินหยาง",
  "己": "ดินหยิน",
  "庚": "ทองหยาง",
  "辛": "ทองหยิน",
  "壬": "น้ำหยาง",
  "癸": "น้ำหยิน",
};

const SCIENCES = [
  { key: "bazi", glyph: "八字", name: "BaZi / ปาจื้อ", angle: "อ่านแกนวันเกิด ธาตุ โครงสร้าง และแรงพื้นดวง" },
  { key: "qizheng", glyph: "七政四餘", name: "Qi Zheng Si Yu / ดาวจริง", angle: "อ่านดาวจริงบนฟ้าและแรงจังหวะของเหตุการณ์" },
  { key: "ziwei", glyph: "紫微斗數", name: "Zi Wei Dou Shu", angle: "อ่านเรือนชีวิต คนที่เกี่ยวข้อง และเงื่อนไขที่บีบการตัดสินใจ" },
  { key: "western", glyph: "♃", name: "Western Astrology", angle: "อ่านทรานซิต มุมดาว และธีมเชิงจิตวิทยาของช่วงเวลา" },
  { key: "vedic", glyph: "ॐ", name: "Vedic Astrology", angle: "อ่านดาชา นักษัตร และน้ำหนักกรรมของจังหวะปัจจุบัน" },
  { key: "uranian", glyph: "⨀", name: "Uranian Astrology", angle: "อ่าน midpoint และจุดกระตุ้นละเอียดที่มักเกิดเป็นเหตุการณ์" },
] as const;

const SCIENCE_NAMES_BY_LANG: Record<string, string[]> = {
  th: ["BaZi / ปาจื้อ", "Qi Zheng Si Yu / ดาวจริง", "Zi Wei Dou Shu", "Western Astrology", "Vedic Astrology", "Uranian Astrology"],
  en: ["BaZi / Four Pillars", "Qi Zheng Si Yu / Real Stars", "Zi Wei Dou Shu", "Western Astrology", "Vedic Astrology", "Uranian Astrology"],
  zh: ["八字", "七政四餘", "紫微斗數", "西洋占星", "印度占星", "漢堡學派占星"],
  cn: ["八字", "七政四余", "紫微斗数", "西洋占星", "印度占星", "汉堡学派占星"],
  vi: ["Bát Tự / Tứ Trụ", "Thất Chính Tứ Dư / sao thực", "Tử Vi Đẩu Số", "Chiêm tinh phương Tây", "Chiêm tinh Vệ Đà", "Uranian Astrology"],
  ja: ["四柱推命 / 八字", "七政四餘 / 実星", "紫微斗数", "西洋占星術", "インド占星術", "ウラニアン占星術"],
  ko: ["사주명리 / 팔자", "칠정사여 / 실제 별", "자미두수", "서양 점성술", "베딕 점성술", "우라니안 점성술"],
  ru: ["BaZi / Четыре столпа", "Qi Zheng Si Yu / реальные звезды", "Zi Wei Dou Shu", "Западная астрология", "Ведическая астрология", "Уранианская астрология"],
  es: ["BaZi / Cuatro Pilares", "Qi Zheng Si Yu / estrellas reales", "Zi Wei Dou Shu", "Astrología occidental", "Astrología védica", "Astrología uraniana"],
};

function sciencesForLang(lang: string): ReportScience[] {
  const names = SCIENCE_NAMES_BY_LANG[lang] || SCIENCE_NAMES_BY_LANG.en;
  return SCIENCES.map((science, index) => ({
    ...science,
    name: names[index] || science.name,
    signal: "",
  }));
}

type AskReportBody = {
  birthDate?: unknown;
  birthTime?: unknown;
  unknownTime?: unknown;
  gender?: unknown;
  displayName?: unknown;
  question?: unknown;
  lang?: unknown;
  /* เมืองเกิด (ไม่บังคับ · default กรุงเทพ) — ส่งมาจาก dropdown ใน ask.html */
  birthCity?: unknown;
  birthLat?: unknown;
  birthLng?: unknown;
  birthGmtOffset?: unknown;
};

type Gender = "M" | "F";
type IntentKey = "finance" | "career" | "love" | "timing" | "home" | "health" | "general";

type ReportPoint = { title: string; body: string };
type ReportScience = { key: string; glyph: string; name: string; angle: string; signal: string; evidence?: string };
type ReportTocItem = { title: string; bullets: string[] };
type ReportPillar = { label: string; stemBranch: string; note: string };
type ReportEvent = { when: string; title: string; body: string };
type ReportTimelineItem = { year: string; label: string; phase: string; body: string; current: boolean };
/* ทายอดีต 1 เรื่องจากหมุดจริง — ให้ผู้ใช้ตรวจกับชีวิตตัวเองได้ (ตัวพิสูจน์ความแม่นก่อนสมัคร) */
type ReportPastCheck = { when: string; title: string; body: string; evidence: string };

type AskReport = {
  category: string;
  headline: string;
  quote: string;
  tags: string[];
  openPoints: ReportPoint[];
  sciences: ReportScience[];
  toc: ReportTocItem[];
  chart: { meta: string; pillars: ReportPillar[] };
  events: ReportEvent[];
  timeline: ReportTimelineItem[];
  pastCheck: ReportPastCheck | null;
};

type ValidInput = {
  birthDate: string;
  birthTime: string;
  birthTimeKnown: boolean;
  gender?: Gender;
  genderText: string;
  displayName: string;
  question: string;
  lang: string;
  birthCity: string;
  lat: number;
  lng: number;
  gmtOffsetHours: number;
};

type IntentProfile = {
  key: IntentKey;
  label: string;
  headline: string;
  firstSignal: string;
  decisionAxis: string;
  avoid: string;
  keywords: RegExp;
};

const INTENTS: IntentProfile[] = [
  {
    key: "finance",
    label: "การเงิน·การลงทุน",
    headline: "เงินไม่ได้โตจากการเร่ง แต่โตจากจังหวะที่คุมเกมได้",
    firstSignal: "โจทย์นี้เด่นที่การแยกระหว่างโอกาสจริงกับแรงอยากขยับเร็วเกินไป",
    decisionAxis: "ตัวเลข เงื่อนไข เอกสาร และรอบเงินสด",
    avoid: "ดีลที่สวยแต่ตรวจสอบยาก หรือการตัดสินใจเพราะกลัวพลาดรอบ",
    keywords: /เงิน|ลงทุน|หนี้|รายได้|ธุรกิจ|หุ้น|คริปโต|กำไร|ขาดทุน|ยอด|ทรัพย์/,
  },
  {
    key: "career",
    label: "งาน·ทิศทางอาชีพ",
    headline: "งานจะเดินเมื่อแยกบทบาทจริงออกจากแรงกดดันรอบตัว",
    firstSignal: "โจทย์นี้เด่นที่สถานะ ความรับผิดชอบ และคนที่มีอำนาจตัดสินใจ",
    decisionAxis: "ตำแหน่ง ทีม หัวหน้า โปรเจกต์ และกรอบเวลาที่ต้องส่งมอบ",
    avoid: "รับภาระเพิ่มโดยยังไม่เห็นขอบเขตหรืออำนาจตัดสินใจที่ชัด",
    keywords: /งาน|อาชีพ|ย้ายงาน|สมัครงาน|โปรเจกต์|เจ้านาย|ตำแหน่ง|บริษัท|เลื่อนขั้น|ลาออก/,
  },
  {
    key: "love",
    label: "ความรัก·ความสัมพันธ์",
    headline: "ความสัมพันธ์ต้องอ่านที่จังหวะเปิดใจและจังหวะปิดเกมพร้อมกัน",
    firstSignal: "โจทย์นี้เด่นที่ระยะห่าง ความคาดหวัง และการสื่อสารที่ยังไม่ตรงกัน",
    decisionAxis: "คนสำคัญ สถานะจริง คำพูดที่ค้างอยู่ และขอบเขตของใจ",
    avoid: "รีบสรุปจากอารมณ์วันเดียว หรือยอมทุกอย่างเพื่อรักษาความสัมพันธ์",
    keywords: /รัก|แฟน|คู่|แต่งงาน|เลิก|สัมพันธ์|ครอบครัว|คนคุย|เนื้อคู่|แต่ง/,
  },
  {
    key: "timing",
    label: "จังหวะตัดสินใจ",
    headline: "คำตอบไม่ได้อยู่ที่ทำหรือไม่ทำ แต่อยู่ที่เข้าจังหวะไหน",
    firstSignal: "โจทย์นี้เด่นที่การเลือกเวลา เปิดเกม ปิดเกม และการเซ็นเงื่อนไข",
    decisionAxis: "เวลาเริ่ม เวลาเซ็น เวลาเปิดเผย และจังหวะรอข้อมูลเพิ่ม",
    avoid: "เริ่มเพราะถูกเร่ง ทั้งที่ข้อมูลสำคัญยังไม่ครบ",
    keywords: /เริ่ม|รอ|ตัดสินใจ|เซ็น|เปิดร้าน|ย้าย|เดินทาง|เปิดตัว|เลือก|ควรไหม|เมื่อไหร่/,
  },
  {
    key: "home",
    label: "บ้าน·พื้นที่·ฮวงจุ้ย",
    headline: "พื้นที่ที่ใช่ต้องช่วยเก็บแรง ไม่ใช่เพิ่มแรงเสียดทาน",
    firstSignal: "โจทย์นี้เด่นที่ทิศทาง พื้นที่ใช้งาน และแรงคนในบ้านที่สะท้อนกลับมา",
    decisionAxis: "ทิศ ห้อง ประตู โต๊ะทำงาน การย้าย และจังหวะลงมือปรับพื้นที่",
    avoid: "แก้พื้นที่ตามความเชื่อแยกชิ้น โดยไม่ดูจังหวะและคนที่ใช้งานจริง",
    keywords: /บ้าน|ย้ายบ้าน|ห้อง|ทิศ|ฮวงจุ้ย|คอนโด|ที่ดิน|ประตู|โต๊ะ|เตียง/,
  },
  {
    key: "health",
    label: "สุขภาพ·สมดุลชีวิต",
    headline: "สัญญาณสุขภาพควรอ่านเป็นแรงกดดันและจังหวะพัก ไม่ใช่คำวินิจฉัย",
    firstSignal: "โจทย์นี้เด่นที่ภาระสะสม การพักฟื้น และจุดที่ร่างกายขอให้ลดแรง",
    decisionAxis: "การพัก ตารางงาน ความเครียด การนอน และการปรึกษาผู้เชี่ยวชาญ",
    avoid: "ใช้คำทำนายแทนการตรวจหรือเลื่อนการพบแพทย์เมื่อมีอาการจริง",
    keywords: /สุขภาพ|ป่วย|หมอ|รักษา|เครียด|นอน|พัก|ร่างกาย|ใจ|เจ็บ/,
  },
];

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function asCleanText(value: unknown, max: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseGender(value: unknown): Gender | undefined {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "f" || raw === "female" || raw === "หญิง") return "F";
  if (raw === "m" || raw === "male" || raw === "ชาย") return "M";
  return undefined;
}

function parseAnswerLang(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace("_", "-");
  const lang = raw === "zh-cn" || raw === "zh-hans" ? "cn" : raw === "zh-tw" || raw === "zh-hk" || raw === "zh-hant" ? "zh" : raw;
  return isSifuAnswerLang(lang) ? lang : "th";
}

function answerLanguageName(lang: string): string {
  switch (lang) {
    case "en":
      return "English";
    case "zh":
      return "Traditional Chinese";
    case "cn":
      return "Simplified Chinese";
    case "vi":
      return "Vietnamese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "ru":
      return "Russian";
    case "es":
      return "Spanish";
    default:
      return "Thai";
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return false;
  const normalized = new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  if (normalized !== value) return false;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return value <= today;
}

function validTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function formatThaiDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(`${value}T00:00:00+07:00`)
    );
  } catch {
    return value;
  }
}

function bangkokYear(): number {
  return new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
}

function draftId(input: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

const DEFAULT_CITY = "กรุงเทพฯ (ค่าเริ่มต้น)";
const DEFAULT_LAT = 13.7563;
const DEFAULT_LNG = 100.5018;
const DEFAULT_GMT = 7;

function parseNum(value: unknown, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function validateInput(body: AskReportBody): { ok: true; input: ValidInput } | { ok: false; error: string } {
  const birthDate = asCleanText(body.birthDate, 10);
  const birthTime = asCleanText(body.birthTime, 5);
  const birthTimeKnown = body.unknownTime !== true;
  const gender = parseGender(body.gender);
  const genderText = gender === "F" ? "หญิง" : gender === "M" ? "ชาย" : "ไม่ระบุ";
  const displayName = asCleanText(body.displayName, 48) || "คุณ";
  const question = asCleanText(body.question, 360);
  const lang = parseAnswerLang(body.lang);
  const birthCity = asCleanText(body.birthCity, 80) || DEFAULT_CITY;
  const lat = parseNum(body.birthLat, -90, 90, DEFAULT_LAT);
  const lng = parseNum(body.birthLng, -180, 180, DEFAULT_LNG);
  const gmtOffsetHours = parseNum(body.birthGmtOffset, -12, 14, DEFAULT_GMT);

  if (!validDate(birthDate)) return { ok: false, error: "invalid_birth_date" };
  if (birthTimeKnown && !validTime(birthTime)) return { ok: false, error: "invalid_birth_time" };
  if (question.length < 8) return { ok: false, error: "question_too_short" };
  return { ok: true, input: { birthDate, birthTime, birthTimeKnown, gender, genderText, displayName, question, lang, birthCity, lat, lng, gmtOffsetHours } };
}

function detectIntent(question: string): IntentProfile {
  return INTENTS.find((intent) => intent.keywords.test(question)) || {
    key: "general",
    label: "คำถามชีวิต·การตัดสินใจ",
    headline: "คำถามนี้ต้องอ่านทั้งพื้นดวง จังหวะเวลา และบริบทจริงร่วมกัน",
    firstSignal: "โจทย์นี้ยังไม่ได้ล็อกหมวดเดียว จึงต้องอ่านสัญญาณที่ซ้ำกันจากหลายศาสตร์",
    decisionAxis: "พื้นดวง จังหวะเวลา คนที่เกี่ยวข้อง และผลลัพธ์ที่ต้องการจริง",
    avoid: "สรุปเร็วจากความรู้สึกเดียวโดยยังไม่ดูเงื่อนไขรอบคำถาม",
    keywords: /$^/,
  };
}

function extractTargetYear(question: string): number {
  const now = bangkokYear();
  const direct = question.match(/(?:ปี\s*)?((?:20|25)\d{2})/);
  if (direct) {
    const raw = Number(direct[1]);
    if (raw >= 2500) return raw - 543;
    if (raw >= 2000 && raw <= 2200) return raw;
  }
  if (/ปีนี้|ตอนนี้|ช่วงนี้/.test(question)) return now;
  if (/ปีหน้า/.test(question)) return now + 1;
  return now;
}

function timeHorizon(question: string, targetYear: number): string {
  const month = question.match(/(\d{1,2})\s*เดือน/);
  if (month) return `${month[1]} เดือนข้างหน้า`;
  const day = question.match(/(\d{1,3})\s*วัน/);
  if (day) return `${day[1]} วันข้างหน้า`;
  if (/ปีนี้|ตอนนี้|ช่วงนี้/.test(question)) return `ปี ${targetYear}`;
  return `ปี ${targetYear}`;
}

function calcProfileLine(calc: BaziAnalysis): string {
  const dm = calc.dayMaster;
  const element = STEM_ELEMENT_TH[dm] || "ไม่ระบุธาตุ";
  const mode = calc.mode === "4p" ? "อ่านครบ 4 เสา" : "อ่าน 3 เสาเพราะยังไม่ล็อกเวลาเกิด";
  const strength = calc.strength?.level ? `แรงดวง ${calc.strength.level}` : "น้ำหนักต้องเปิดอ่านเต็ม";
  const structure = calc.geJu?.structure ? `โครงสร้าง ${calc.geJu.structure}` : "โครงสร้างต้องอ่านต่อ";
  return `${mode} · Day Master ${dm} (${element}) · ${strength} · ${structure}`;
}

function buildChartPillars(calc: BaziAnalysis): ReportPillar[] {
  const zh = calc.pillarsZh;
  return [
    { label: "เวลา", stemBranch: zh.hour || "ไม่ล็อกเวลา", note: zh.hour ? "ใช้แยกแรงปลายทางและวิธีลงมือ" : "ยังอ่านเป็น 3 เสา จึงไม่สรุปเรื่องเวลาแบบแข็ง" },
    { label: "วัน", stemBranch: zh.day, note: "แกนตัวตนและวิธีรับแรงจากคำถามนี้" },
    { label: "เดือน", stemBranch: zh.month, note: "ฤดูกาลของดวงและสนามที่เรื่องนี้เกิด" },
    { label: "ปี", stemBranch: zh.year, note: "พื้นหลัง ครอบครัว สังคม และแรงรอบนอก" },
  ];
}

/* บรรทัดล็อคเนื้อหา (teaser) ต่อภาษา — ใช้เมื่อ (ก) ศาสตร์ไม่มีหมุดจริง (ข) AI อ้างหลักฐานไม่ตรง โดนด่านตัด */
const LOCKED_LINE: Record<string, string> = {
  th: "🔒 คำอ่านส่วนนี้เปิดในฉบับเต็ม",
  en: "🔒 This reading is unlocked in the full report",
  zh: "🔒 此段解讀於完整報告中開啟",
  cn: "🔒 此段解读于完整报告中开启",
  vi: "🔒 Phần luận giải này mở trong bản đầy đủ",
  ja: "🔒 この部分の鑑定は完全版でご覧いただけます",
  ko: "🔒 이 부분의 풀이는 전체 리포트에서 확인할 수 있습니다",
  ru: "🔒 Эта часть трактовки доступна в полном отчёте",
  es: "🔒 Esta lectura se desbloquea en el informe completo",
};
function lockedLine(lang: string): string {
  return LOCKED_LINE[lang] || LOCKED_LINE.en;
}

function buildFallbackReport(input: ValidInput, calc: BaziAnalysis, sourceLabel: string, bundle: AskAnchorBundle | null): AskReport {
  const intent = detectIntent(input.question);
  const targetYear = extractTargetYear(input.question);
  const horizon = timeHorizon(input.question, targetYear);
  const timeText = input.birthTimeKnown ? input.birthTime : "ยังไม่ล็อกเวลาเกิด";
  const profile = calcProfileLine(calc);
  const name = input.displayName;
  const yongshen = calc.yongshen?.[0];
  const yongshenText = yongshen ? `${yongshen.stem}/${yongshen.element}` : "ต้องอ่านเต็ม";
  const th = input.lang === "th";
  const modeTag = calc.mode === "4p" ? (th ? "เวลาเกิดครบ" : "Full birth time") : (th ? "ไม่ทราบเวลาเกิด" : "Birth time unknown");

  return {
    category: intent.label,
    headline: `${horizon} ${intent.headline}`,
    quote: `คุณ${name} คำถามนี้อ่านด้วย Hourkey Fusion จากผังจริงทั้ง 6 ศาสตร์ — ${intent.firstSignal} เมื่อเทียบกับ ${profile}`,
    tags: [th ? "เขียนสด" : "Live", sourceLabel, th ? intent.label : intent.key, modeTag, `Day Master ${calc.dayMaster}`, th ? `เป้าหมาย ${targetYear}` : `Target ${targetYear}`],
    openPoints: [
      {
        title: `1 · ${horizon}`,
        body: `${intent.firstSignal} จังหวะนี้จึงควรดูทั้งสัญญาณเปิดทางและเงื่อนไขที่ทำให้เรื่องช้าลงพร้อมกัน`,
      },
      {
        title: "2 · แกนข้อมูลเกิด",
        body: `${profile} ทำให้คำถามนี้ต้องเน้น ${intent.decisionAxis} มากกว่าการตอบกว้าง ๆ ว่าดีหรือไม่ดี`,
      },
      {
        title: "3 · สัญญาณหนุน",
        body: `เลนส์ BaZi ชี้จุดหนุนหลักที่ ${yongshenText} ส่วนเลนส์ดาวและ midpoint ใช้จับเวลาเกิดเหตุการณ์ให้แคบลง — ${lockedLine(input.lang)}`,
      },
    ],
    /* signal จากหมุดจริงเท่านั้น (ข้อเท็จจริงจากเครื่อง + ล็อคส่วนตีความ) — ไม่มีหมุด = บอกตรง ๆ ว่ารอฉบับเต็ม */
    sciences: sciencesForLang(input.lang).map((science) => {
      const list = bundle?.byScience?.[science.key as keyof typeof bundle.byScience] || [];
      const first = list[0];
      return {
        ...science,
        signal: first ? `${first.label}: ${first.value}${first.when ? ` (${first.when})` : ""} — ${lockedLine(input.lang)}` : lockedLine(input.lang),
        evidence: first ? first.id : "locked",
      };
    }),
    toc: buildFallbackToc(intent, name, horizon),
    chart: {
      meta: `${name} · ${formatThaiDate(input.birthDate)} · ${timeText} · ${input.genderText}`,
      pillars: buildChartPillars(calc),
    },
    events: [
      {
        when: "30-60 วันแรก",
        title: "ข้อมูลจริงจะเริ่มแยกจากความกังวล",
        body: `ถ้าเรื่องนี้ใช่ จะมีสัญญาณเรื่อง ${intent.decisionAxis} ชัดขึ้น ไม่ใช่แค่ความรู้สึกอยากรีบตัดสินใจ`,
      },
      {
        when: `ปี ${targetYear}`,
        title: "จุดตัดสินใจหลักของคำถาม",
        body: `ช่วงนี้ต้องกัน ${intent.avoid} — ${lockedLine(input.lang)}`,
      },
      {
        when: "หลังจุดตัดสินใจ",
        title: "ผลของการเลือกจะเริ่มสะสม",
        body: lockedLine(input.lang),
      },
    ],
    timeline: buildFallbackTimeline(targetYear, intent),
    pastCheck: buildPastCheckFromAnchor(bundle, input.lang),
  };
}

/* pastCheck สำรองที่เขียนจากหมุดตรง ๆ (deterministic) — ใช้เมื่อ AI ไม่ส่ง/ส่งหลักฐานไม่ตรง */
function buildPastCheckFromAnchor(bundle: AskAnchorBundle | null, lang: string): ReportPastCheck | null {
  const a = bundle?.pastCheckAnchor;
  if (!a) return null;
  const title: Record<string, string> = {
    th: "จุดพิสูจน์ย้อนหลัง — เช็คกับชีวิตจริงของคุณได้เลย",
    en: "Backtest point — verify this against your own life",
    zh: "回測點 — 可對照你的真實人生",
    cn: "回测点 — 可对照你的真实人生",
    vi: "Điểm kiểm chứng quá khứ — đối chiếu với đời thực của bạn",
    ja: "過去の検証ポイント — ご自身の人生と照らし合わせてください",
    ko: "과거 검증 포인트 — 실제 삶과 대조해 보세요",
    ru: "Точка проверки прошлого — сверьте с вашей жизнью",
    es: "Punto de verificación del pasado — compruébalo con tu propia vida",
  };
  const body: Record<string, string> = {
    th: `ผังชี้ว่า${a.when || "ช่วงที่ผ่านมา"} เป็นรอบเปลี่ยนบรรยากาศชีวิตครั้งสำคัญ (${a.value}) — ช่วงนั้นชีวิตคุณน่าจะมีการเปลี่ยนเส้นทาง/บทบาท/ที่ทางอย่างชัดเจน ถ้าตรง แปลว่าผังนี้อ่านจังหวะชีวิตคุณได้จริง`,
    en: `The chart marks ${a.when || "a recent period"} as a major life-atmosphere shift (${a.value}). Around that time you likely experienced a clear change of path, role, or place. If that matches, this chart truly tracks your timing.`,
    zh: `命盤顯示${a.when || "近期"}為一次重要的人生氣場轉換（${a.value}）。那段時間你的人生方向、角色或環境應有明顯變動。若相符，代表此盤確實抓得住你的節奏。`,
  };
  return {
    when: a.when || "",
    title: title[lang] || title.en,
    body: body[lang] || body.en || body.th,
    evidence: a.id,
  };
}

function buildFallbackToc(intent: IntentProfile, name: string, horizon: string): ReportTocItem[] {
  return [
    {
      title: `${horizon} เรื่องนี้จะเปิดทางแบบไหน`,
      bullets: [
        `สัญญาณแรกที่ต้องดูคือ ${intent.decisionAxis}`,
        "แยกแรงเปิดทางจริงออกจากแรงเร่งที่เกิดจากความกังวล",
        "ชี้ว่าควรขยับทันทีหรือรอข้อมูลอีกหนึ่งชั้น",
      ],
    },
    {
      title: "ต้องเลือกทางแบบไหน",
      bullets: [
        `ทางที่เหมาะคือทางที่คุม ${intent.decisionAxis} ได้`,
        "ไม่เลือกจากคำพูดสวย แต่เลือกจากเงื่อนไขที่ตรวจซ้ำได้",
        "ถ้าต้องเสี่ยง ต้องเสี่ยงแบบรู้จุดหยุด",
      ],
    },
    {
      title: "จังหวะทองอยู่ช่วงไหน",
      bullets: [
        "ดูจากปี เดือน และแรงดาวที่ซ้ำสัญญาณกัน",
        "ต้นจังหวะเหมาะกับการคัดกรอง กลางจังหวะเหมาะกับการลงมือ",
        "ปลายจังหวะเหมาะกับการล็อกผลหรือปิดความเสี่ยง",
      ],
    },
    {
      title: "เงื่อนไขที่ทำให้ผลอยู่กับคุณ",
      bullets: [
        "ต้องมีระบบติดตาม ไม่ใช่พึ่งความรู้สึกเฉพาะหน้า",
        "คนที่เกี่ยวข้องต้องเห็นขอบเขตเดียวกัน",
        "เก็บหลักฐานและตัวเลขก่อนเพิ่มน้ำหนักการตัดสินใจ",
      ],
    },
    {
      title: "จุดเสี่ยงที่ต้องกันไว้",
      bullets: [
        intent.avoid,
        "หลีกเลี่ยงการสรุปจากเหตุการณ์เดียว",
        "อย่าปล่อยให้ความกลัวเสียโอกาสกลายเป็นคนตัดสินใจแทน",
      ],
    },
    {
      title: `รหัสในพื้นดวงของ ${name}`,
      bullets: [
        "แกน Day Master บอกวิธีรับแรงและวิธีเสียแรง",
        "โครงสร้างดวงบอกสนามที่ควรเล่นและสนามที่ควรลดน้ำหนัก",
        "ธาตุหนุนบอกวิธีปรับเกมให้เข้ามือขึ้น",
      ],
    },
    {
      title: "ช่วงขึ้นและช่วงพักของเรื่องนี้",
      bullets: [
        "แยกปีที่ควรขยายออกจากปีที่ควรรักษาฐาน",
        "ดูว่าจังหวะสั้นกำลังขัดหรือหนุนจังหวะใหญ่",
        "ชี้ช่วงที่ควรใช้ความเร็วและช่วงที่ควรใช้ความนิ่ง",
      ],
    },
    {
      title: "คนและเหตุการณ์ที่เขย่าคำตอบ",
      bullets: [
        "ระบุบทบาทคนที่หนุนและคนที่ทำให้เกมเสีย",
        "ดูเหตุการณ์ที่อาจเป็นตัวบังคับให้ตัดสินใจ",
        "วางคำถามต่อเนื่องให้ AI Sifu อ่านต่อจากข้อมูลชุดเดิม",
      ],
    },
  ];
}

function buildFallbackTimeline(targetYear: number, intent: IntentProfile): ReportTimelineItem[] {
  const now = bangkokYear();
  const years = Array.from(new Set([now - 1, now, targetYear, targetYear + 1, targetYear + 3]))
    .sort((a, b) => a - b)
    .slice(0, 5);
  while (years.length < 5) years.push(years[years.length - 1] + 1);
  return years.map((year) => ({
    year: String(year),
    label: year === now ? "ตอนนี้" : year === targetYear ? "จุดถาม" : "ร่องเวลา",
    phase: year < targetYear ? "สะสมแรง" : year === targetYear ? "ตัดสินใจ" : "รับผล",
    body:
      year === targetYear
        ? `ปีนี้ต้องคุม ${intent.decisionAxis} ให้ชัด และกัน ${intent.avoid}`
        : year < targetYear
          ? "ช่วงเตรียมข้อมูลและลดความคลุมเครือก่อนจุดตัดสินใจ"
          : "ช่วงที่ผลของการเลือกเริ่มนิ่งหรือเผยต้นทุนที่ซ่อนไว้",
    current: year === now,
  }));
}

function buildGrokPrompt(input: ValidInput, calc: BaziAnalysis, fallback: AskReport, bundle: AskAnchorBundle): string {
  const languageDirective = input.lang === "th"
    ? "⚠️ ภาษา: ตอบเป็นภาษาไทยทั้งหมด ยกเว้นชื่อศาสตร์หรือศัพท์จีนที่จำเป็น"
    : LANG_ANSWER_DIRECTIVE[input.lang] || LANG_ANSWER_DIRECTIVE.en;
  const targetYear = extractTargetYear(input.question);
  const context = {
    user: {
      displayName: input.displayName,
      birthDate: input.birthDate,
      birthDateText: formatThaiDate(input.birthDate),
      birthTime: input.birthTimeKnown ? input.birthTime : null,
      birthTimeKnown: input.birthTimeKnown,
      birthPlace: { city: input.birthCity, lat: input.lat, lng: input.lng, gmtOffsetHours: input.gmtOffsetHours },
      gender: input.genderText,
      question: input.question,
      answerLanguage: input.lang,
      answerLanguageName: answerLanguageName(input.lang),
    },
    baziPreview: {
      mode: calc.mode,
      pillarsZh: calc.pillarsZh,
      dayMaster: calc.dayMaster,
      dayMasterElement: STEM_ELEMENT_TH[calc.dayMaster] || null,
      strength: calc.strength,
      structure: calc.geJu?.structure || null,
      yongshen: calc.yongshen?.[0] || null,
      climate: calc.climate || null,
    },
    intent: {
      category: fallback.category,
      targetYear,
      horizon: timeHorizon(input.question, targetYear),
    },
    requiredSixSciences: sciencesForLang(input.lang).map((s) => ({ key: s.key, glyph: s.glyph, name: s.name, angle: s.angle })),
    /* 🔑 หมุดจริงจากเครื่องคำนวณ — คลังหลักฐานเดียวที่อนุญาต */
    CHART_ANCHORS: bundle.anchors,
    ANCHOR_IDS_ALLOWED: bundle.anchors.map((a) => a.id),
    SCIENCES_WITHOUT_DATA: bundle.missingSciences,
    PAST_CHECK_ANCHOR: bundle.pastCheckAnchor,
  };

  return [
    "คุณคือ Hourkey Fusion report writer สำหรับหน้า preview ก่อนปลดล็อก",
    `งาน: เขียนรายงานสดเป็น ${answerLanguageName(input.lang)} จากข้อมูลเกิด คำถาม และ CHART_ANCHORS (หมุดที่เครื่องคำนวณจากผังจริงทั้ง 6 ศาสตร์)`,
    languageDirective,
    "",
    "กฎบังคับ:",
    "1. ตอบเป็น JSON object เท่านั้น ห้าม markdown ห้าม code fence ห้าม HTML",
    `2. ภาษาของ value ทุกช่องใน JSON ต้องเป็น ${answerLanguageName(input.lang)} ตามคำสั่งภาษา ห้ามปนภาษาไทยถ้าไม่ได้เลือก th (ค่าใน CHART_ANCHORS เป็นไทย/จีน — ให้แปล/ถอดเป็นภาษาผู้ใช้ คงศัพท์จีนวิชาไว้ได้)`,
    "3. ห้ามฟันธงเกินจริง ห้ามรับประกันผลลัพธ์ ห้ามให้คำแนะนำแทนแพทย์/ทนาย/ที่ปรึกษาการเงิน",
    "4. เนื้อหาต้องเจาะคำถามของผู้ใช้ ไม่ใช่ข้อความโฆษณากว้าง ๆ",
    "",
    "⚖️ สัญญาหลักฐาน (สำคัญที่สุด — ฝ่าฝืน = รายงานถูกทิ้ง):",
    "5. ทุกการอ้างข้อเท็จจริงจากผัง (ดาว เรือน ธาตุ วัยจร ทศา ทรานซิต midpoint ช่วงเวลา) ต้องมาจาก CHART_ANCHORS เท่านั้น ห้ามแต่งตำแหน่งดาว/องศา/เดือน/ปีที่ไม่มีในหมุดเด็ดขาด",
    "6. sciences ทั้ง 6 รายการ: field 'signal' = คำอ่านสั้นที่ต่อยอดจากหมุดของศาสตร์นั้น + field 'evidence' = id หมุดที่ใช้ (เลือกจาก ANCHOR_IDS_ALLOWED ที่ขึ้นต้นด้วยชื่อศาสตร์นั้น) — evidence ผิด/ไม่มี = signal นั้นจะถูกระบบตัดทิ้ง",
    `7. ศาสตร์ที่อยู่ใน SCIENCES_WITHOUT_DATA: signal ต้องเป็นประโยคเดียวความหมายเดียวกับ "${lockedLine(input.lang)}" และ evidence = "locked" ห้ามแต่งเนื้อหาแทน`,
    "",
    "🔒 สัญญากั๊ก (แม่นแต่ห้ามบอกหมด — หน้านี้คือ preview ก่อนปลดล็อก):",
    "8. บอกได้: สิ่งที่เห็นจากหมุด + ช่วงเวลาหยาบ (ไตรมาส/ครึ่งปี/ช่วงอายุ) · ห้ามบอก: วัน-เดือนเป๊ะ ทิศ วิธีรับมือ ขั้นตอนปฏิบัติ เงื่อนไขเฉพาะ — สิ่งเหล่านี้ให้จบประโยคด้วยสัญลักษณ์ 🔒 และคำทำนองว่าอยู่ในฉบับเต็ม",
    "9. ทุก signal ของ sciences ให้ปิดท้ายด้วย 🔒 หนึ่งครั้ง (ยกเว้นศาสตร์ที่ไม่มีข้อมูล ใช้ประโยคล็อคตามข้อ 7)",
    "",
    "🎯 ทายอดีต (ตัวพิสูจน์ความแม่น):",
    "10. field 'pastCheck': ใช้ PAST_CHECK_ANCHOR เขียนบอกผู้ใช้ว่าช่วงปีนั้น (ใช้ช่วงปีจากหมุดเท่านั้น) ชีวิตเขาน่าจะมีจุดเปลี่ยนสำคัญลักษณะไหน (เปลี่ยนเส้นทาง/บทบาท/ที่อยู่/คนสำคัญ — เลือกโทนจากธาตุ/กิ่งก้านในหมุด) และเชิญให้เขาตรวจกับชีวิตจริง · evidence = id ของ PAST_CHECK_ANCHOR · ถ้า PAST_CHECK_ANCHOR เป็น null ให้ส่ง pastCheck: null",
    "",
    "โครง/ปริมาณ:",
    "11. sciences ครบ 6 ตาม key/name/glyph ที่ให้ ห้ามเปลี่ยนชื่อศาสตร์ · toc 8 หัวข้อ×3 bullets · events 3 · openPoints 3 · timeline 5",
    "12. quote ขึ้นต้นแบบรายงานส่วนตัว พูดกับผู้ใช้โดยตรง · ห้ามอ้างว่าเป็นศาสตร์เดียว ใช้คำว่า Hourkey Fusion และ 6 ศาสตร์",
    "13. timeline: ใช้ปีจากหมุด (วัยจร/ทศา/ทรานซิต) เท่านั้น ปีไหนไม่มีหมุดรองรับให้เขียนโทนกลาง (สะสมแรง/รับผล) ไม่ฟันธงเหตุการณ์",
    "14. events: 'when' ใช้ช่วงเวลาหยาบจากหมุด · body ปิดท้าย 🔒 เมื่อแตะรายละเอียดที่ล็อค",
    "",
    "JSON schema:",
    JSON.stringify(
      {
        category: "string",
        headline: "string",
        quote: "string",
        tags: ["string"],
        openPoints: [{ title: "string", body: "string" }],
        sciences: [{ key: "string", glyph: "string", name: "string", angle: "string", signal: "string", evidence: "string" }],
        toc: [{ title: "string", bullets: ["string", "string", "string"] }],
        chart: { meta: "string", pillars: [{ label: "string", stemBranch: "string", note: "string" }] },
        events: [{ when: "string", title: "string", body: "string" }],
        timeline: [{ year: "string", label: "string", phase: "string", body: "string", current: false }],
        pastCheck: { when: "string", title: "string", body: "string", evidence: "string" },
      },
      null,
      2
    ),
    "",
    "ข้อมูลจริง:",
    JSON.stringify(context, null, 2),
    "",
    "FINAL LANGUAGE LOCK:",
    languageDirective,
  ].join("\n");
}

let _jarvisIds: { uid: number; gid: number } | null | undefined;
function jarvisIds(): { uid: number; gid: number } | null {
  if (_jarvisIds !== undefined) return _jarvisIds;
  try {
    const uid = parseInt(execFileSync("id", ["-u", CHILD_USER]).toString().trim(), 10);
    const gid = parseInt(execFileSync("id", ["-g", CHILD_USER]).toString().trim(), 10);
    _jarvisIds = Number.isFinite(uid) && Number.isFinite(gid) ? { uid, gid } : null;
  } catch {
    _jarvisIds = null;
  }
  return _jarvisIds;
}

function writeGrokPromptFile(prompt: string): string {
  const path = `/tmp/hourkey_ask_report_${randomUUID()}.txt`;
  writeFileSync(path, prompt, { mode: 0o600 });
  const ids = jarvisIds();
  let chowned = false;
  if (ids) {
    try {
      chownSync(path, ids.uid, ids.gid);
      chowned = true;
    } catch {}
  }
  try {
    chmodSync(path, chowned ? 0o600 : 0o644);
  } catch {}
  return path;
}

function grokCliArgs(promptFile: string): string[] {
  const args = ["--prompt-file", promptFile, ...GROK_TEXT_ONLY_ARGS, "--output-format", "plain"];
  if (GROK_MODEL) args.push("-m", GROK_MODEL);
  return args;
}

function grokErrorMessage(err: string): string {
  if (/401|Unauthorized|not logged in|authentication|sign in|login/i.test(err)) {
    return "grok_cli_auth_required";
  }
  return err.replace(/\s+/g, " ").trim().slice(0, 240) || "grok_cli_failed";
}

async function runGrokCli(prompt: string): Promise<string> {
  let promptFile = "";
  try {
    promptFile = writeGrokPromptFile(prompt);
    return await new Promise<string>((resolve, reject) => {
      const c = spawn("sudo", ["-u", CHILD_USER, "-H", GROK_BIN, ...grokCliArgs(promptFile)], {
        cwd: GROK_CWD,
        env: process.env,
      });
      let out = "";
      let err = "";
      let settled = false;
      const timer = setTimeout(() => {
        try {
          c.kill("SIGKILL");
        } catch {}
        if (!settled) {
          settled = true;
          reject(new Error("grok_timeout"));
        }
      }, GROK_TIMEOUT_MS);
      c.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      c.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      c.on("error", (e) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error(`grok_spawn_error:${grokErrorMessage(String(e?.message || e))}`));
        }
      });
      c.on("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code === 0 && out.trim()) resolve(out.trim());
        else reject(new Error(`grok_exit_${code}:${grokErrorMessage(err)}`));
      });
    });
  } finally {
    if (promptFile) {
      try {
        rmSync(promptFile, { force: true });
      } catch {}
    }
  }
}

function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error("json_parse_failed");
}

function cleanString(value: unknown, fallback: string, max = 420): string {
  const s = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s || fallback;
}

function cleanStringArray(value: unknown, fallback: string[], maxItems: number, maxLen = 72): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out = raw.map((item) => cleanString(item, "", maxLen)).filter(Boolean).slice(0, maxItems);
  for (const item of fallback) {
    if (out.length >= maxItems) break;
    if (!out.includes(item)) out.push(item);
  }
  return out.slice(0, maxItems);
}

function normalizeReport(raw: unknown, fallback: AskReport, bundle: AskAnchorBundle, lang: string): AskReport {
  const obj = isRecord(raw) ? raw : {};
  const openRaw = Array.isArray(obj.openPoints) ? obj.openPoints : [];
  const tocRaw = Array.isArray(obj.toc) ? obj.toc : [];
  const chartRaw = isRecord(obj.chart) ? obj.chart : {};
  const pillarRaw = Array.isArray(chartRaw.pillars) ? chartRaw.pillars : [];
  const eventRaw = Array.isArray(obj.events) ? obj.events : [];
  const timelineRaw = Array.isArray(obj.timeline) ? obj.timeline : [];
  const scienceRaw = Array.isArray(obj.sciences) ? obj.sciences : [];

  const allowedIds = anchorIds(bundle);
  const scienceBase = fallback.sciences.length ? fallback.sciences : sciencesForLang("th");
  const sciences = scienceBase.map((science, index) => {
    const found = scienceRaw.find((item) => isRecord(item) && item.key === science.key);
    const fb = fallback.sciences[index];
    const rawSignal = cleanString(isRecord(found) ? found.signal : undefined, "", 220);
    const rawEvidence = cleanString(isRecord(found) ? found.evidence : undefined, "", 60);
    /* ⚖️ ด่านกันมั่ว: signal ต้องมี evidence เป็นหมุดจริงของศาสตร์ตัวเอง
     * - ศาสตร์ไม่มีข้อมูล → ยอมรับเฉพาะ evidence "locked" (ประโยคล็อค)
     * - evidence ไม่อยู่ในคลัง / ข้ามศาสตร์ → แทนด้วยข้อเท็จจริงหมุดจริงจาก fallback (ไม่ปล่อยของแต่งหลุด) */
    const noData = (bundle.missingSciences as string[]).includes(science.key);
    let signal: string;
    let evidence: string;
    if (noData) {
      signal = lockedLine(lang);
      evidence = "locked";
    } else if (rawSignal && allowedIds.has(rawEvidence) && rawEvidence.startsWith(`${science.key}.`)) {
      signal = rawSignal;
      evidence = rawEvidence;
    } else {
      signal = fb.signal;
      evidence = fb.evidence || "locked";
    }
    return {
      key: science.key,
      glyph: science.glyph,
      name: science.name,
      angle: cleanString(isRecord(found) ? found.angle : undefined, science.angle, 160),
      signal,
      evidence,
    };
  });

  /* pastCheck: รับของ AI เมื่อ evidence ตรงหมุดทายอดีตเท่านั้น ไม่งั้นใช้เวอร์ชัน deterministic */
  const pcRaw = isRecord(obj.pastCheck) ? obj.pastCheck : null;
  const pcAnchor = bundle.pastCheckAnchor;
  let pastCheck: ReportPastCheck | null = fallback.pastCheck;
  if (pcRaw && pcAnchor && cleanString(pcRaw.evidence, "", 60) === pcAnchor.id) {
    pastCheck = {
      when: cleanString(pcRaw.when, pcAnchor.when || "", 64),
      title: cleanString(pcRaw.title, fallback.pastCheck?.title || "", 120),
      body: cleanString(pcRaw.body, fallback.pastCheck?.body || "", 400),
      evidence: pcAnchor.id,
    };
  }

  return {
    category: cleanString(obj.category, fallback.category, 80),
    headline: cleanString(obj.headline, fallback.headline, 150),
    quote: cleanString(obj.quote, fallback.quote, 520),
    tags: cleanStringArray(obj.tags, fallback.tags, 6, 44),
    openPoints: normalizePoints(openRaw, fallback.openPoints, 3),
    sciences,
    toc: normalizeToc(tocRaw, fallback.toc),
    chart: {
      meta: cleanString(chartRaw.meta, fallback.chart.meta, 180),
      pillars: normalizePillars(pillarRaw, fallback.chart.pillars),
    },
    events: normalizeEvents(eventRaw, fallback.events),
    timeline: normalizeTimeline(timelineRaw, fallback.timeline),
    pastCheck,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePoints(raw: unknown[], fallback: ReportPoint[], count: number): ReportPoint[] {
  const out = raw
    .map((item, index) => {
      if (!isRecord(item)) return null;
      return {
        title: cleanString(item.title, fallback[index]?.title || `${index + 1}`, 90),
        body: cleanString(item.body, fallback[index]?.body || "", 240),
      };
    })
    .filter((item): item is ReportPoint => !!item)
    .slice(0, count);
  for (let i = out.length; i < count; i++) out.push(fallback[i]);
  return out;
}

function normalizeToc(raw: unknown[], fallback: ReportTocItem[]): ReportTocItem[] {
  const out = raw
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const fb = fallback[index] || fallback[0];
      return {
        title: cleanString(item.title, fb.title, 120),
        bullets: cleanStringArray(item.bullets, fb.bullets, 3, 130),
      };
    })
    .filter((item): item is ReportTocItem => !!item)
    .slice(0, 8);
  for (let i = out.length; i < 8; i++) out.push(fallback[i]);
  return out;
}

function normalizePillars(raw: unknown[], fallback: ReportPillar[]): ReportPillar[] {
  const out = raw
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const fb = fallback[index] || fallback[0];
      return {
        label: cleanString(item.label, fb.label, 30),
        stemBranch: cleanString(item.stemBranch, fb.stemBranch, 30),
        note: cleanString(item.note, fb.note, 160),
      };
    })
    .filter((item): item is ReportPillar => !!item)
    .slice(0, 4);
  for (let i = out.length; i < fallback.length; i++) out.push(fallback[i]);
  return out;
}

function normalizeEvents(raw: unknown[], fallback: ReportEvent[]): ReportEvent[] {
  const out = raw
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const fb = fallback[index] || fallback[0];
      return {
        when: cleanString(item.when, fb.when, 64),
        title: cleanString(item.title, fb.title, 110),
        body: cleanString(item.body, fb.body, 220),
      };
    })
    .filter((item): item is ReportEvent => !!item)
    .slice(0, 3);
  for (let i = out.length; i < 3; i++) out.push(fallback[i]);
  return out;
}

function normalizeTimeline(raw: unknown[], fallback: ReportTimelineItem[]): ReportTimelineItem[] {
  const out = raw
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const fb = fallback[index] || fallback[0];
      return {
        year: cleanString(item.year, fb.year, 18),
        label: cleanString(item.label, fb.label, 44),
        phase: cleanString(item.phase, fb.phase, 58),
        body: cleanString(item.body, fb.body, 180),
        current: item.current === true,
      };
    })
    .filter((item): item is ReportTimelineItem => !!item)
    .slice(0, 5);
  for (let i = out.length; i < 5; i++) out.push(fallback[i]);
  return out;
}

async function liveBudgetAllowed(req: Request): Promise<boolean> {
  if (!LIVE_ENABLED) return false;
  const result = await rateLimit(`ask-report:${clientIp(req)}`, LIVE_MAX_PER_WINDOW, LIVE_WINDOW_MS);
  return result.ok;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskReportBody;
  const validated = validateInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const input = validated.input;
  const inputForId = {
    birthDate: input.birthDate,
    birthTime: input.birthTimeKnown ? input.birthTime : null,
    birthTimeKnown: input.birthTimeKnown,
    gender: input.gender,
    displayName: input.displayName,
    question: input.question,
    lang: input.lang,
    birthCity: input.birthCity,
    lat: input.lat,
    lng: input.lng,
    gmtOffsetHours: input.gmtOffsetHours,
  };
  const id = draftId(inputForId);

  /* cache รายงานสำเร็จตาม draftId (input เดิม = รายงานเดิม) — กันกดซ้ำเปลืองสด + ตอบไว */
  const cached = reportCache.get(id);
  if (cached && Date.now() - cached.ts < REPORT_CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, { headers: NO_STORE_HEADERS });
  }

  /* 🚦 เกินเพดานสด = บอกตรง ๆ ว่าให้รอคิว (ห้ามเสิร์ฟ template ปลอมเป็นคำพยากรณ์) */
  if (!(await liveBudgetAllowed(req))) {
    return NextResponse.json(
      { ok: false, status: "queued", draftId: id, retryAfterSec: 30 },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const calc = input.birthTimeKnown
      ? await calcBazi({
          date: input.birthDate,
          time: input.birthTime,
          longitude: input.lng,
          gmtOffsetHours: input.gmtOffsetHours,
          gender: input.gender,
          dayBoundary: "23:00",
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: input.birthDate,
          longitude: input.lng,
          gmtOffsetHours: input.gmtOffsetHours,
          gender: input.gender,
          birthTimeKnown: false,
        });

    /* หมุดจริง 6 ศาสตร์ (ผังจริงทั้งหมด — หัวใจของ "แม่นและไม่มั่ว") */
    const bundle = await buildAskAnchors(
      {
        birthDate: input.birthDate,
        birthTime: input.birthTime,
        birthTimeKnown: input.birthTimeKnown,
        gender: input.gender || "M",
        lat: input.lat,
        lng: input.lng,
        gmtOffsetHours: input.gmtOffsetHours,
        displayName: input.displayName,
        intent: detectIntent(input.question).key,
        targetYear: extractTargetYear(input.question),
      },
      calc,
      new Date()
    );
    if (bundle.warnings.length) console.warn("[ask/report] anchor warnings:", bundle.warnings.join(" | ").slice(0, 400));

    const skeleton = buildFallbackReport(input, calc, "anchors", bundle);
    let report: AskReport;
    try {
      const raw = await runGrokCli(buildGrokPrompt(input, calc, skeleton, bundle));
      report = normalizeReport(extractJson(raw), skeleton, bundle, input.lang);
    } catch (e) {
      /* สดล้ม = บอกตรง ๆ ให้ลองใหม่ (ห้ามส่งของแต่ง) */
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[ask/report] live failed:", msg.slice(0, 240));
      return NextResponse.json(
        { ok: false, status: "busy", draftId: id, retryAfterSec: 45 },
        { status: 202, headers: NO_STORE_HEADERS }
      );
    }

    const payload = {
      ok: true,
      draftId: id,
      generatedAt: new Date().toISOString(),
      source: "grok" as const,
      lang: input.lang,
      liveError: null,
      inputSummary: {
        birthDate: input.birthDate,
        birthDateText: formatThaiDate(input.birthDate),
        birthTime: input.birthTimeKnown ? input.birthTime : "ยังไม่ล็อกเวลาเกิด",
        birthTimeKnown: input.birthTimeKnown,
        gender: input.genderText,
        displayName: input.displayName,
        question: input.question,
        birthCity: input.birthCity,
        birthCoords: `${input.lat.toFixed(3)},${input.lng.toFixed(3)} (GMT${input.gmtOffsetHours >= 0 ? "+" : ""}${input.gmtOffsetHours})`,
      },
      chartPreview: {
        mode: calc.mode,
        pillarsZh: calc.pillarsZh,
        dayMaster: calc.dayMaster,
        dayMasterElement: STEM_ELEMENT_TH[calc.dayMaster] || null,
        strength: calc.strength,
        structure: calc.geJu?.structure || null,
        yongshen: calc.yongshen?.[0] || null,
        climate: calc.climate || null,
      },
      anchorsUsed: bundle.anchors.map((a) => ({ id: a.id, value: a.value, when: a.when || null })),
      visuals: bundle.visuals,
      sciencesWithoutData: bundle.missingSciences,
      report,
      checkout: { packageCode: "master_1m", returnPath: "/ask" },
    };
    reportCache.set(id, { ts: Date.now(), payload });
    if (reportCache.size > 500) {
      for (const [key, entry] of reportCache.entries()) {
        if (Date.now() - entry.ts > REPORT_CACHE_TTL_MS) reportCache.delete(key);
      }
    }
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("[ask/report]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "report_failed", draftId: id }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

/* cache รายงานต่อ draftId · in-memory ต่อ instance (พฤติกรรมเดียวกับ live bucket เดิม) */
const REPORT_CACHE_TTL_MS = 15 * 60_000;
const reportCache = new Map<string, { ts: number; payload: Record<string, unknown> }>();
