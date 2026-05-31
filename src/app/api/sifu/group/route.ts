/**
 * POST /api/sifu/group · ซินแสอ่านดวงกลุ่ม (group mode · หลายคนพร้อมกัน)
 *
 * 🆕 Endpoint ใหม่ (26 พ.ค. 2026) · ไฟล์เดียว · ไม่แตะไฟล์ LOCKED ใดทั้งสิ้น
 *    - reuse engine read-only ผ่าน import เท่านั้น (calcBazi · buildChartExtensions ·
 *      buildStructuredChartPacket/renderChartPrompt/validateChartPacket · loadPromptMd/loadPromptKV ·
 *      getSession · q1/q)
 *    - buildBaziContext ใน /api/sifu/route.ts ไม่ได้ export → จึง replicate logic ต่อคน
 *      เป็น helper local (buildPersonContext) ให้เป๊ะกับต้นฉบับ (gender charAt(0)==="f" ·
 *      time.slice(0,5) · 3p mode · computeStartAge · packet · render)
 *
 * รับ body: { profileIds: string[], groupLabel?: string, message: string,
 *             history?: [{role,content}], lang?: 'th'|'en'|'zh', stream?: boolean }
 * คืน: SSE (event meta/first/chunk/done/error) เมื่อ Accept: text/event-stream หรือ stream===true
 *      มิฉะนั้น JSON { reply, model }
 *
 * 💰 POC group mode · ฟรีตามเจ้านายสั่ง 26 พ.ค. · cap 10 + org guard + login กัน abuse แทน cost
 *    (ไม่เรียก spendHours)
 *
 * 🌊 SSE pattern ยกจาก POST /api/sifu เป๊ะ · ห้ามใส่ AbortController / idle-timeout / reader.cancel
 *    (มีบทเรียนว่าทำ stream พัง)
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { StringDecoder } from "string_decoder";
import { q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";
import { boundaryWarning3p, monthPillarBoundary, yearPillarBoundary } from "@/lib/bazi-boundary";
import { buildSynastry, type PersonSyn } from "@/lib/bazi-synastry";
import { computeSiLingDays } from "@/lib/chart-table";
import { stripIdLine } from "@/lib/identity-lock";

export const runtime = "nodejs"; // child_process spawn (เหมือน /api/sifu)

type Msg = { role: "user" | "assistant"; content: string };

const TIMEOUT_MS = 600_000; // เท่ากับ /api/sifu · ตำราคลาสสิก + หลายคน = prompt ยาว
const CHILD_USER = "jarvis";
const MAX_GROUP = 10; // cap กัน abuse/token
const SIFU_HEARTBEAT_MS = Number(process.env.SIFU_SSE_HEARTBEAT_MS || 7_000);
const SIFU_FIRST_PING_MS = Number(process.env.SIFU_SSE_FIRST_PING_MS || 3_000);

function promptSafe(raw: unknown, fallback = "—"): string {
  const s = String(raw ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!s) return fallback;
  return s
    .replace(/FACT LOCK:/gi, "FACT_LOCK:")
    .replace(/Day Master/gi, "DayMaster")
    .replace(/⟦ID⟧/g, "ID");
}

/* ── maps · copy จาก /api/sifu/route.ts (read-only constant) ── */
const STEM_ELEMENT_MAP: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY_MAP: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
const DM_LABEL_TH: Record<string, string> = {
  wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ",
};
const DM_POLARITY_TH: Record<string, string> = { yang: "หยาง", yin: "หยิน" };
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};

/* ══════ synastry · ปฏิกิริยาข้ามคน (27 พ.ค. · ย้ายเป็น helper 31 พ.ค.) ══════
 * ตาราง + buildSynastry ทั้งหมด → src/lib/bazi-synastry.ts (เฟส 0+1 · pure · test ได้ตรง · ไม่แตะ engine)
 * เฟส 1: เทียบ 日月年 ก้าน+กิ่ง ข้ามคน (六合/六冲/六害/六破 + 天干五合 raw緣) · ตัด刑 · route แค่ import + เรียก */

/* PersonSyn type + buildSynastry ย้ายไป @/lib/bazi-synastry (เฟส 0) */

/* 通根 (root strength) จาก wrapper-7 · copy จาก /api/sifu/route.ts computeRootedness
   (group ลึกกว่าเดี่ยว 1 ชั้น → path wrapper-7 = ../../../../../data · ฐานตัดสิน 從格/用神
   ส่ง arg เข้า packet แทน null · ไม่แตะ bazi-calc/extensions/route เดี่ยว LOCKED) */
async function computeRootedness(pillars: { year: { stem: string; branch: string }; month: { stem: string; branch: string }; day: { stem: string; branch: string }; hour: { stem: string; branch: string } | null }): Promise<ReturnType<typeof buildStructuredChartPacket>["rootedness"]> {
  try {
    const w7 = await import("../../../../../data/library/wrappers/7-yongshen-v2.js") as unknown as {
      dmRootProfile: (n: unknown) => { dm_element: string; rootedness_label: string; is_extremely_weak: boolean; is_token_only: boolean };
      rootednessAll: (n: unknown) => Record<string, { rootedness_label: string }>;
    };
    const dmR = w7.dmRootProfile(pillars);
    const allR = w7.rootednessAll(pillars);
    const lab = (e: string) => (allR[e]?.rootedness_label || "no_root");
    return {
      dmElement: dmR.dm_element,
      dmLabel: dmR.rootedness_label,
      isExtremelyWeak: dmR.is_extremely_weak,
      isTokenOnly: dmR.is_token_only,
      all: { wood: lab("wood"), fire: lab("fire"), earth: lab("earth"), metal: lab("metal"), water: lab("water") },
    } as ReturnType<typeof buildStructuredChartPacket>["rootedness"];
  } catch (e) {
    console.warn("[sifu/group] rootedness (wrapper-7) failed:", (e as Error).message);
    return null;
  }
}

/* startAge (起運) · copy จาก /api/sifu route.ts ~37 */
async function computeStartAge(date: string, time: string, gender: "M" | "F", lng: number): Promise<number> {
  try {
    const tyme = await import("tyme4ts");
    const { getSolarTimeAtTST } = await import("@/lib/bazi-calc");
    const { st } = await getSolarTimeAtTST({ date, time, longitude: lng, gmtOffsetHours: 7, birthTimeKnown: true });
    const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
    const cl = tyme.ChildLimit.fromSolarTime(st, g);
    return Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
  } catch (e) {
    console.error("[sifu/group] ChildLimit failed, default 10:", (e as Error).message);
    return 10;
  }
}

function knownBirthTime(raw: unknown): boolean {
  if (raw === false || raw === 0) return false;
  if (String(raw).toLowerCase() === "false" || String(raw) === "0") return false;
  return true;
}

/* ── ตำราเสริม · loaders copy pattern จาก /api/sifu (read-only · cache 60s) ── */
const AJEK_RULES_PATH = join(process.cwd(), "data/library/ajek-bazi-rules.md");
let _ajekCache: { text: string; ts: number; version: string } | null = null;
function loadAjekRules(): { text: string; version: string } {
  const now = Date.now();
  if (_ajekCache && now - _ajekCache.ts < 60_000) return _ajekCache;
  try {
    const text = readFileSync(AJEK_RULES_PATH, "utf8");
    statSync(AJEK_RULES_PATH);
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _ajekCache = { text, ts: now, version };
    return _ajekCache;
  } catch (e) {
    console.warn("[sifu/group] ajek rules not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

const INTERACTION_MASTER_PATH = join(process.cwd(), "data/library/bazi-interaction-master.md");
let _interactionCache: { text: string; ts: number; version: string } | null = null;
function loadInteractionMaster(): { text: string; version: string } {
  const now = Date.now();
  if (_interactionCache && now - _interactionCache.ts < 60_000) return _interactionCache;
  try {
    const text = readFileSync(INTERACTION_MASTER_PATH, "utf8");
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _interactionCache = { text, ts: now, version };
    return _interactionCache;
  } catch (e) {
    console.warn("[sifu/group] interaction master not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

const ENGINE_KNOWLEDGE_DIR = join(process.cwd(), "data/library/สำหรับทำ engine");
const ENGINE_KNOWLEDGE_FILES: { file: string; label: string }[] = [
  { file: "คู่มืออ้างอิงสำหรับ Yong Shen (用神) Selection Engine ของระบบ BaZi (八字) — hourkey Platform.md", label: "調候用神 · การเลือกธาตุที่ใช้" },
  { file: "Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine.md", label: "應期 · จังหวะเวลาเกิดเหตุ" },
  { file: "Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study).md", label: "5 ด้านชีวิต · สุขภาพ/อาชีพ/คู่/ทรัพย์/เรียน" },
  { file: "Pillar Interactions.md", label: "ปฏิกิริยาระหว่างเสาเชิงลึก (รายคู่)" },
];
let _engineKnowledgeCache: { text: string; ts: number; version: string } | null = null;
function loadEngineKnowledge(): { text: string; version: string } {
  const now = Date.now();
  if (_engineKnowledgeCache && now - _engineKnowledgeCache.ts < 60_000) return _engineKnowledgeCache;
  const parts: string[] = [];
  const hash = createHash("sha1");
  for (const { file, label } of ENGINE_KNOWLEDGE_FILES) {
    try {
      const text = readFileSync(join(ENGINE_KNOWLEDGE_DIR, file), "utf8");
      hash.update(file).update(text);
      parts.push(`\n──────── ตำราเสริม: ${label} ────────\n${text}`);
    } catch (e) {
      console.warn("[sifu/group] engine knowledge missing:", file, (e as Error).message);
    }
  }
  const text = parts.join("\n");
  const version = text ? hash.digest("hex").slice(0, 12) : "none";
  _engineKnowledgeCache = { text, ts: now, version };
  return _engineKnowledgeCache;
}

/* คัมภีร์เจาะลึก 5 เล่ม (十神/格局/合婚/納音/神煞) · copy จาก /api/sifu/route.ts
 * 合婚 สำคัญสุดสำหรับกลุ่ม (กฎ "ห้ามฟันธงเลิก/ไม่เลิก") · ก่อนหน้านี้ group ไม่โหลด = ช่องโหว่ */
const SIFU_EXTRA_DIR = join(process.cwd(), "data/library/sifu-extra");
const SIFU_EXTRA_FILES: { file: string; label: string }[] = [
  { file: "bazi-shishen-classical.md", label: "十神 · จิตวิทยาบทบาทสิบเทพ (子平 verbatim)" },
  { file: "bazi-geju-master.md", label: "格局 · โครงสร้างดวง 子平真詮 spec" },
  { file: "bazi-hehun-classical.md", label: "合婚 · ความเข้ากันดวงคู่/หลายดวง" },
  { file: "bazi-nayin-master.md", label: "納音60 · เนื้อสัมผัสนาอิน" },
  { file: "bazi-shensha-catalog.md", label: "神煞 · คาตาล็อกดาวพิเศษ (รอง)" },
  { file: "bazi-hechong-resolution.md", label: "合冲 · กฎแก้ขัด/รวมพลัง 刑沖會合解法 + 墓庫 (子平真詮 Resolution)" },
  { file: "bazi-xiangshen-judgment.md", label: "相神/成格/破格/救應 · ตัดสินโครงดวงสมบูรณ์/พัง (子平真詮 Judgment)" },
  { file: "bazi-conghua-master.md", label: "從格/化格 · ดวงตาม/แปรธาตุ + 真假 boundary + 合化 (滴天髓+三命通會)" },
  { file: "zpzq-zhenquan-clean.md", label: "📜 子平真詮評註 ตัวบทจริง verbatim (ctext · GROUND TRUTH เหนือ reconstruction · บท合化→48 + 74命例เฉลยจริง) · ใช้ quote/เทียบ案例 · ห้ามคัดจีนดิบ แปลไทยตามกฎ9" },
  { file: "dts-zhentian-clean.md", label: "📜 滴天髓闡微 ตัวบทจริง verbatim (ctext · 任鐵樵注 · GROUND TRUTH เหนือ reconstruction · 62 บท) · สาย旺衰氣勢: ยึดตอนอ่าน旺衰/化氣-從格/調候(寒暖燥濕)/通關/性情/疾病/女命/何知章 · 格局/相神ยึด子平真詮 · ห้ามคัดจีนดิบ แปลไทยตามกฎ9" },
  { file: "smtg-clean.md", label: "📜 三命通會 (萬民英 · 明 1578 · 神煞+納音+論女命 verbatim)" },
  { file: "yhzp-clean.md", label: "📜 淵海子平 (徐升 · 宋 1271 · 子平 ต้นน้ำ · 五干通變圖+喜忌篇 verbatim)" },
  { file: "sftk-clean.md", label: "📜 神峰通考 (張楠 · 明 · 命理正宗 · 病藥論+動靜說+蓋頭說+男女合婚說 verbatim · ต้นทาง BY-08)" },
];
let _sifuExtraCache: { text: string; ts: number; version: string } | null = null;
function loadSifuExtraKnowledge(): { text: string; version: string } {
  const now = Date.now();
  if (_sifuExtraCache && now - _sifuExtraCache.ts < 60_000) return _sifuExtraCache;
  const parts: string[] = [];
  const hash = createHash("sha1");
  for (const { file, label } of SIFU_EXTRA_FILES) {
    try {
      const text = readFileSync(join(SIFU_EXTRA_DIR, file), "utf8");
      hash.update(file).update(text);
      parts.push(`\n──────── ตำราเจาะลึก: ${label} ────────\n${text}`);
    } catch (e) {
      console.warn("[sifu/group] extra knowledge missing:", file, (e as Error).message);
    }
  }
  const text = parts.join("\n");
  const version = text ? hash.digest("hex").slice(0, 12) : "none";
  _sifuExtraCache = { text, ts: now, version };
  return _sifuExtraCache;
}

type ProfileRow = {
  id: string;
  name?: string;
  nickname?: string | null;
  relationship_type: string | null;
  is_self: boolean;
  birth_datetime: string;
  birth_lng: number | null;
  gender: string | null;
  birth_time_known: boolean | null;
  day_boundary: string | null;
};

/**
 * ประกอบ context ต่อคน · replicate buildBaziContext ใน /api/sifu/route.ts เป๊ะ
 * (รับ row ที่ผ่าน org guard มาแล้ว เพื่อไม่ query ซ้ำ)
 */
async function buildPersonContext(row: ProfileRow): Promise<PersonSyn> {
  try {
    const dt = row.birth_datetime;
    const [date, timeRaw] = dt.split("T");
    const time = (timeRaw || "12:00").slice(0, 5); // ตัดวินาที · ห้ามถอด (ถ้าถอด อายุ/วัยจร = NaN)
    const lng = Number(row.birth_lng || 100.5018);
    const gender = (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M") as "M" | "F"; // DB เก็บ "F"/"M" · charAt(0)==="f"
    const birthTimeKnown = knownBirthTime(row.birth_time_known);
    const dayBoundary: "23:00" | "00:00" = row.day_boundary === "00:00" ? "00:00" : "23:00";
    const dayBoundarySource: "explicit" | "default" = row.day_boundary === "00:00" || row.day_boundary === "23:00" ? "explicit" : "default";
    const displayName = promptSafe(row.nickname || row.name, "—");
    const role = promptSafe(row.is_self ? "ผู้ถาม/เจ้าของบัญชี (SELF)" : row.relationship_type, "คนในเครือข่าย");

    const calc = birthTimeKnown
      ? await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, dayBoundary, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    const g = loadPromptKV("prompts/sifu-ctx-guards.md");
    /* ข้อมูล synastry (ใช้ทั้ง 3p/4p · เก็บก่อน return แต่ละโหมด) */
    const VALID_EL = ["wood", "fire", "earth", "metal", "water"];
    const yongEls = (calc.yongshen || []).slice(0, 3).map((y) => String(y.element || "").toLowerCase()).filter((e) => VALID_EL.includes(e));
    const synPillars = {
      year: calc.pillars.year ? { stem: calc.pillars.year.stem, branch: calc.pillars.year.branch } : undefined,
      month: calc.pillars.month ? { stem: calc.pillars.month.stem, branch: calc.pillars.month.branch } : undefined, // 31 พ.ค. เฟส 1: จับ 天干五合 ก้านเดือน (เช่น 丁壬)
      day: calc.pillars.day ? { stem: calc.pillars.day.stem, branch: calc.pillars.day.branch } : undefined,
    };
    const is3p = calc.mode === "3p";
    /* เสาเดือนคน 3 เสาเกิดคาบ節氣 = ก้ำกึ่ง → synastry hit ที่พึ่งเสาเดือนต้องติดธง · เสาปีก้ำกึ่งเฉพาะ立春 */
    const monthBorderline = is3p ? !!monthPillarBoundary(date).boundary : false;
    const yearBorderline = is3p ? !!yearPillarBoundary(date).boundary : false;
    /* 27 พ.ค. · 3 เสาไหลเข้า packet เต็ม (ลึกเท่า 4 เสา · ปฏิกิริยา/ดาว/通根 ของ年月日) · กันเดายาม: ไม่เรียก computeStartAge (time ปลอม → 起運ปลอม) · packet ตัด起運/เสายาม/命宮/小運 เอง */
    const startAge = is3p ? 10 : await computeStartAge(date, time, gender, lng);
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      gender,
      new Date(`${date}T${time}:00+07:00`),
      startAge,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null
    );
    const dm = calc.dayMaster;
    const ageNow = Math.max(0, new Date().getUTCFullYear() - new Date(`${date}T${time}:00+07:00`).getUTCFullYear());
    const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
    const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
    const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
    const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
    const ny = ext.nayin;

    const lines = [
      `IDENTITY CONTEXT: ${displayName} = ${role} · profileId=${row.id} · ห้ามสลับชื่อ/Day Master/ขอบวันกับ profile อื่นในกลุ่ม`,
      `ชื่อ: ${row.name || "—"} · เพศ ${gender} · อายุปัจจุบันประมาณ ${ageNow}`,
      `เกิด: ${date} ${time} · ลองจิจูด ${lng}`,
      `ขอบวัน/Day boundary ที่ใช้คำนวณ: ${dayBoundary} (${dayBoundarySource})`,
      is3p
        ? `3 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時(ไม่ทราบเวลาเกิด) · ${g.NO_HOUR_PILLAR}`
        : `4 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時${calc.pillarsZh.hour}`,
      `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ${g.DM_FACT_LOCK}`,
      g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh),
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
      `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
      `格局: ${calc.geJu.structure || "ปกติ"}`,
      `納音: 年${ny.year?.zh || "-"} · 月${ny.month?.zh || "-"} · 日${ny.day?.zh || "-"} · 時${ny.hour?.zh || "-"}`,
    ];
    const [slY, slMo, slD] = date.split("-").map(Number);
    const [slH, slMi] = time.split(":").map(Number);
    const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);  // 司令
    const rootedness = await computeRootedness(calc.pillars);  // 通根 wrapper-7 (เดี่ยวมี · group เคยส่ง null = หาย)
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, gender, siLingDays, {
      dayBoundary,
      dayBoundarySource,
      monthBoundary: is3p ? monthPillarBoundary(date) : null, // 月柱ก้ำกึ่ง節氣 → ไหล conf ลง field เดือน (กลุ่ม/synastry · เฉพาะ 3 เสา)
    });
    validateChartPacket(packet);
    // Group mode can include 10 people. Keep the single-chart prompt fully detailed,
    // but omit the 10-year x 12-month drilldown per person here so the group prompt
    // stays within Claude CLI context and behaves like the stable pre-liuyue group flow.
    lines.push(renderChartPrompt(packet, { includeTransitDrilldown: false, subjectLabel: `${displayName}·${row.id.slice(0, 8)}` }));
    if (ext.special_chart.applicable) {
      lines.push(`ดวงพิเศษ: ${ext.special_chart.type_zh} · friendly=${ext.special_chart.friendly_elements.join("·")}`);
    }
    if (is3p) {
      lines.push(g.LIMIT_3P_QA);
      const bw = boundaryWarning3p(date); // เกิดวันคาบ節氣 + ไม่รู้เวลา → เตือนเสาเดือน/ปีก้ำกึ่ง (additive)
      if (bw) lines.push(bw);
    }
    return {
      name: displayName,
      role,
      isSelf: row.is_self,
      mode: is3p ? "3p" : "4p",
      dmEl: dmElement,
      yongEls,
      pillars: synPillars,
      monthBorderline,
      yearBorderline,
      text: lines.join("\n"),
    };
  } catch (e) {
    console.error("[sifu/group] buildPersonContext failed:", e);
    return { name: promptSafe(row.nickname || row.name, "—"), role: promptSafe(row.is_self ? "ผู้ถาม/เจ้าของบัญชี (SELF)" : row.relationship_type, "คนในเครือข่าย"), isSelf: row.is_self, mode: "err", dmEl: "unknown", yongEls: [], pillars: null, text: "(ไม่สามารถคำนวณดวงได้)" };
  }
}

/* คำสั่งวิเคราะห์กลุ่ม · inline 3 ภาษา · ต่อท้าย group context */
const GROUP_INSTRUCTION: Record<string, string> = {
  th: "ด้านบนคือดวงของหลายคนในกลุ่มเดียวกัน · ช่วยวิเคราะห์ภาพรวมกลุ่ม ความเข้ากัน จุดเสริม-จุดชน บทบาทแต่ละคน โดยใช้กฎการอ่านเดียวกับการอ่านดวงเดี่ยว (เจาะ 3-5 จุด ระบุชื่อ+เสาที่เกี่ยวข้อง) · ⚠️ 合婚/ความเข้ากัน: อ่าน 合/冲 ตาม用神แต่ละคน (合ไม่ดีเสมอ 冲ไม่ร้ายเสมอ) · **ฟันธง 'ทิศ/ผล' ได้ตรงๆ ตามน้ำหนักดวง** (เช่น 'คู่นี้ดวงดันให้ชนกัน เสี่ยงขาดสะบั้น') · **ห้ามเฉพาะคำสั่งการ** ('ต้องเลิก/ไปกันไม่ได้/ห้ามคบ/คู่นี้แน่นอน/จะแต่ง') ไม่ใช่ห้ามบอกผล · บอกผลแล้วปิดท้ายด้วยเงื่อนไขพลิก 用神/通關 ของแต่ละคน · 🔒 ปฏิกิริยาข้ามคน(合/冲/破/害): ใช้เฉพาะที่ระบุในเซกชัน synastry ด้านบน (ลิสต์ปิด=เช็คครบทุกคู่แล้ว) ห้ามสร้าง/เดาคู่ใหม่นอกลิสต์ · อย่าเอาปฏิกิริยา 'ในดวงเดี่ยว' ของใครไปทำเป็นปฏิกิริยา 'ข้ามคน'",
  en: "Above are the charts of several people in the same group. Analyze the overall group dynamics, compatibility, mutual support and clashes, and each person's role — using the same reading rules as a single-chart reading (pick 3-5 concrete points, naming the person and the pillars involved). ⚠️ Compatibility/合婚: read 合/冲 against each one's 用神 (合 not always good, 冲 not always bad). State the DIRECTION/OUTCOME plainly per the chart's weight (e.g. 'this pair's charts push them to clash at the core — risk of a clean break'). Only FORBIDDEN: commanding verdicts ('must break up / incompatible / should not associate / definitely marry'). Stating bad outcomes is fine — close with each one's pivot condition (用神/通關). 🔒 Cross-person 合/冲/破/害: use ONLY what is listed in the synastry section above (CLOSED LIST = all pairs already checked); do not create or guess pairs outside that list; never turn one person's in-chart interaction into a cross-person one.",
  zh: "以上是同一群組中多人的命盤。請分析群組整體互動、配對、相生相剋與各人角色，並沿用單一命盤的判讀規則（挑 3-5 個具體論點，標明所涉及的人與柱）。⚠️ 合婚/相合度：依各自用神判讀 合/冲（合不必吉、冲不必凶）。可依命盤輕重**直斷方向／結果**（例如「此二人命盤相沖於本命核心，恐有斷裂之象」）。**僅禁命令式斷語**（「必須分開／不合／不可往來／必成婚」），但可明說吉凶結果，最後以各自用神/通關之轉機收尾。🔒 跨人 合/冲/破/害：僅用上方 synastry 區段所列（封閉清單＝所有配對已比對）；勿自創或臆測清單外配對；切勿將某人命盤內部之互動當作跨人互動。",
};

/* ประกอบ prompt · reuse sifu-qa.md เป็นฐาน เหมือน buildPrompt branch Q&A ใน /api/sifu */
function buildGroupPrompt(opts: { ctx: string; message: string; history: Msg[]; lang: string }): string {
  const langKey = (opts.lang || "th").toUpperCase();
  const histText = opts.history.length
    ? "\n\nประวัติคำถาม:\n" + opts.history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";
  const ajek = loadAjekRules();
  const rulesBlock = ajek.text
    ? "\n\n" + loadPromptMd("prompts/sifu-rules-header.md").trim().replace("{{RULES}}", () => ajek.text) + "\n"
    : "";
  const interaction = loadInteractionMaster();
  const interactionBlock = interaction.text
    ? "\n\n" + loadPromptMd("prompts/sifu-interaction-header.md").trim().replace("{{INTERACTION}}", () => interaction.text) + "\n"
    : "";
  const engineKnow = loadEngineKnowledge();
  const engineBlock = engineKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-engine-header.md").trim().replace("{{ENGINE}}", () => engineKnow.text) + "\n"
    : "";
  const extraKnow = loadSifuExtraKnowledge();
  const extraBlock = extraKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-extra-header.md").trim().replace("{{EXTRA}}", () => extraKnow.text) + "\n"
    : "";
  const qaLang = loadPromptSections("prompts/sifu-lang.md");
  const groupInstruction = "\n\n" + (GROUP_INSTRUCTION[opts.lang] || GROUP_INSTRUCTION.th);
  return loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock + extraBlock)
    .replace("{{CTX}}", () => opts.ctx + groupInstruction)
    .replace("{{FOCUS_HIST}}", () => histText)
    .replace("{{MESSAGE}}", () => opts.message);
}

/* ── Claude CLI · copy จาก /api/sifu (spawn sudo -u jarvis -H claude · cwd checklist-app) ── */
async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = ["-p", "--output-format", "text", "--dangerously-skip-permissions", "--setting-sources", "user"];
    const c = spawn("sudo", ["-u", CHILD_USER, "-H", "claude", ...claudeArgs], {
      cwd: "/var/www/checklist-app",
      env: process.env,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} reject(new Error("timeout")); }, TIMEOUT_MS);
    c.stdout.on("data", chunk => { out += chunk.toString(); });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exit ${code} · ${err.slice(0, 300)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
}

function spawnClaudeStreaming(prompt: string) {
  const claudeArgs = [
    "-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
    "--dangerously-skip-permissions", "--setting-sources", "user",
  ];
  const c = spawn("sudo", ["-u", CHILD_USER, "-H", "claude", ...claudeArgs], {
    cwd: "/var/www/checklist-app",
    env: process.env,
  });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

/* Parser · stream-json line-by-line · copy จาก /api/sifu makeJsonlParser */
function makeJsonlParser(onText: (text: string) => void) {
  let buf = "";
  const decoder = new StringDecoder("utf8");
  return (chunk: Buffer) => {
    buf += decoder.write(chunk);
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "stream_event" && obj.event?.type === "content_block_delta" && obj.event.delta?.type === "text_delta") {
          onText(obj.event.delta.text);
        }
      } catch {
        // not JSON · skip
      }
    }
  };
}

const SIFU_WAITING_PHASES = [
  "waiting_context",
  "waiting_classics",
  "waiting_transits",
  "waiting_interactions",
  "waiting_reasoning",
];

function rotatingWaitingPhase(count: number): string {
  return SIFU_WAITING_PHASES[Math.max(0, count - 1) % SIFU_WAITING_PHASES.length];
}

function startSifuHeartbeat(
  send: (event: string, data: unknown) => void,
  getPhase: (count: number, elapsedMs: number) => string
): () => void {
  let stopped = false;
  let count = 0;
  const startedAt = Date.now();
  const ping = () => {
    if (stopped) return;
    const nextCount = ++count;
    const now = Date.now();
    send("ping", { phase: getPhase(nextCount, now - startedAt), count: nextCount, ts: now });
  };
  const first = setTimeout(ping, SIFU_FIRST_PING_MS);
  const interval = setInterval(ping, SIFU_HEARTBEAT_MS);
  (first as any).unref?.();
  (interval as any).unref?.();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const groupLabel: string = (body.groupLabel || "กลุ่ม").toString().trim().slice(0, 60) || "กลุ่ม";
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";

    if (!message) return NextResponse.json({ error: "no message" }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "message too long" }, { status: 400 });

    /* 🔐 session → org · ห้ามอ่านดวงข้ามบัญชี */
    const session = await getSession();
    const orgId = session?.orgId ?? null;
    if (!session || !orgId) {
      return NextResponse.json({ error: "not logged in" }, { status: 401 });
    }

    /* validate profileIds · array · 1-10 · unique · เกิน 10 ตัดเหลือ 10 ตัวแรก */
    let profileIds: string[] = Array.isArray(body.profileIds)
      ? body.profileIds.filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
      : [];
    profileIds = [...new Set(profileIds)]; // unique
    if (profileIds.length === 0) return NextResponse.json({ error: "profileIds ว่าง" }, { status: 400 });
    if (profileIds.length > MAX_GROUP) profileIds = profileIds.slice(0, MAX_GROUP); // cap 10

    /* 🔐 org guard · ดึงทุก profile ใน org เดียวกันเท่านั้น (กัน IDOR · สำคัญสุด) */
    const rows = await q<ProfileRow>(
      `SELECT id, name, nickname, relationship_type,
              (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known, day_boundary
       FROM profiles
       WHERE id = ANY($1) AND org_id=$2 AND is_archived=false`,
      [profileIds, orgId]
    );
    if (rows.length === 0) return NextResponse.json({ error: "ไม่พบ profile ในบัญชีนี้" }, { status: 404 });

    /* เรียงตามลำดับ profileIds ที่ส่งมา (DB ANY ไม่การันตี order) */
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = profileIds.map(id => byId.get(id)).filter((r): r is ProfileRow => !!r);
    const owner = await q<Pick<ProfileRow, "id" | "name" | "nickname" | "relationship_type" | "is_self">>(
      `SELECT id, name, nickname, relationship_type,
              (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self
       FROM profiles
       WHERE org_id=$1 AND is_archived=false
         AND created_by_user_id=$2
         AND (relationship_type IS NULL OR btrim(relationship_type) = '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, session.userId]
    );
    const ownerRow = ordered.find((r) => r.is_self) || owner[0] || null;
    const ownerName = promptSafe(ownerRow ? (ownerRow.nickname || ownerRow.name) : "", "ไม่พบ self profile");

    /* ประกอบ context ต่อคน (replicate buildBaziContext) + เก็บ pillars ไว้ทำ synastry */
    const sections: string[] = [];
    const people: PersonSyn[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      const pc = await buildPersonContext(r);
      sections.push(`━━━ คนที่ ${i + 1} · ${pc.name || "—"} · ${pc.role} ━━━\n${pc.text}`);
      people.push(pc);
    }
    let groupCtx = [
      `IDENTITY CONTEXT: ผู้ถาม/เจ้าของบัญชี = ${ownerName} (profileId=${ownerRow?.id || "unknown"})`,
      `กติกาเรียกคน: ถ้าคำถามใช้คำว่า "คุณ/ผม/เรา" ให้หมายถึงผู้ถาม/เจ้าของบัญชี; ถ้าพูดถึงคนอื่นให้เรียกชื่อและบทบาทจาก profile เท่านั้น; ห้ามเอา Day Master/ชื่อ/ขอบวันของคนหนึ่งไปปนกับอีกคน`,
      `[กลุ่ม: ${groupLabel} · มี ${ordered.length} คน]`,
      "",
      sections.join("\n\n"),
    ].join("\n");
    /* synastry · ปฏิกิริยาข้ามคน (日月年 ก้าน+กิ่ง · 六合冲害破 + 天干五合 raw緣 · neutral) · ต่อท้ายก่อนส่ง AI */
    const syn = buildSynastry(people, lang);
    if (syn) groupCtx += "\n\n" + syn;

    const prompt = buildGroupPrompt({ ctx: groupCtx, message, history, lang });

    /* 🌊 SSE เมื่อ Accept: text/event-stream หรือ stream===true · ยก pattern จาก POST /api/sifu เป๊ะ
     * ห้ามใส่ AbortController / idle-timeout / reader.cancel (บทเรียน stream พัง) */
    const wantsStream =
      (req.headers.get("accept") || "").includes("text/event-stream") || body.stream === true;
    if (wantsStream) {
      const encoder = new TextEncoder();
      let activeChild: ReturnType<typeof spawnClaudeStreaming> | null = null;
      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          let full = "";
          let firstChunkSent = false;
          let firstDeltaSeen = false;
          let stopHeartbeat: (() => void) | null = null;
          let idBuf = "";          // buffer บรรทัดแรก strip ⟦ID⟧ (group = strip-only · ไม่ validate · หลาย日干)
          let idStripped = false;
          const t0 = Date.now();
          const safeClose = () => {
            if (closed) return;
            closed = true;
            stopHeartbeat?.();
            try { controller.close(); } catch {}
          };
          const send = (event: string, data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {
              closed = true;
            }
          };

          send("meta", { cached: false, count: ordered.length, startedAt: t0 });
          stopHeartbeat = startSifuHeartbeat(send, (pingCount) => {
            if (!firstDeltaSeen) return rotatingWaitingPhase(pingCount);
            if (!idStripped) return "identity_lock";
            if (!firstChunkSent) return "waiting_visible_chunk";
            return "streaming";
          });
          const child = spawnClaudeStreaming(prompt);
          activeChild = child;
          const killTimer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "timeout" });
            safeClose();
          }, TIMEOUT_MS);

          const sendFirstOnce = () => {
            if (!firstChunkSent) {
              firstChunkSent = true;
              send("first", { ms: Date.now() - t0, model: "claude-max-cli" });
            }
          };
          const emit = (text: string) => { full += text; sendFirstOnce(); send("chunk", { text }); };
          const parser = makeJsonlParser((text) => {
            firstDeltaSeen = true;
            if (!idStripped) {
              idBuf += text;
              if (!idBuf.trim()) return; // delta แรกเป็นบรรทัดว่าง/ช่องว่าง → buffer ต่อ กัน ⟦ID⟧ ที่ตามมาหลุด
              const nl = idBuf.indexOf("\n");
              if (nl === -1) {
                // ยังไม่ครบบรรทัดแรก · ถ้ายาวเกิน 120 → flush (group ห้าม kill) · ยัง stripIdLine กัน ⟦ID⟧ ไม่มี \n หลุด
                if (idBuf.length > 120) { idStripped = true; const r = stripIdLine(idBuf); if (r) emit(r); }
                return; // buffer ต่อ · ไม่ block
              }
              idStripped = true;
              const rest = stripIdLine(idBuf); // ตัดบรรทัด ⟦ID⟧ ถ้าขึ้นต้น · ไม่ขึ้นก็คงเดิม
              if (rest) emit(rest);
              return;
            }
            emit(text);
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            console.warn("[sifu/group sse stderr]", chunk.toString().slice(0, 200));
          });
          child.on("close", (code) => {
            activeChild = null;
            clearTimeout(killTimer);
            // flush idBuf ที่ค้าง (AI ตอบสั้น < 120 ตัว ไม่มี \n) · กันคำตอบหาย → done กลายเป็น error
            if (!idStripped && idBuf) { idStripped = true; const r = stripIdLine(idBuf); if (r) emit(r); }
            const ms = Date.now() - t0;
            if (code === 0 && full.trim()) {
              send("done", { ms, model: "claude-max-cli", cached: false, chars: full.length });
            } else {
              send("error", { error: `claude exit ${code}`, ms });
            }
            safeClose();
          });
        },
        cancel() {
          try { activeChild?.kill("SIGKILL"); } catch {}
          activeChild = null;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    /* JSON mode */
    const reply = stripIdLine(await runClaudeCli(prompt));  // strip ⟦ID⟧ บรรทัดแรก (กันหลุดจอ group)
    return NextResponse.json({ reply, model: "claude-max-cli" });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[sifu/group] error:", err);
    return NextResponse.json({ error: err.message || "internal" }, { status: 500 });
  }
}
