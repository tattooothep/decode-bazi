/**
 * POST /api/sifu · ซินแสตอบ (BaZi Q&A)
 *
 * รับ:  { message: string, history?: [{role, content}], profileId?: string, topic?: string, lang?: 'th'|'en'|'zh' }
 * คืน:  { reply: string }
 *
 * Layer 3 · ใช้ sudo claude CLI (jarvis user · Claude Max OAuth) เหมือน ERP webchat
 * Backup ก่อนแก้ไฟล์นี้ · ห้ามแตะ engine LOCKED
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { q1, q } from "@/lib/db";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";

type Msg = { role: "user" | "assistant"; content: string };
type IntroBirthInput = {
  name?: string;
  date: string;
  time: string;
  lng: number;
  gender: "M" | "F";
  birthTimeKnown?: boolean;
  source: "profile" | "params";
};

const TIMEOUT_MS = 600_000; // 600s · ยัดตำราคลาสสิก 4 ไฟล์เต็ม (~141KB prompt · first token ~546s) · nginx /api/sifu ต้อง >600s · ช้าค่อยตัด
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/* startAge (起運) จาก tyme4ts ChildLimit · เหมือน /api/chart · เดิม sifu ใส่ 10 ตายตัว → วัยจรเลื่อน ~8 ปี (bug 25 พ.ค.) */
async function computeStartAge(date: string, time: string, gender: "M" | "F", lng: number): Promise<number> {
  try {
    const tyme = await import("tyme4ts");
    const { getSolarTimeAtTST } = await import("@/lib/bazi-calc");
    const { st } = await getSolarTimeAtTST({ date, time, longitude: lng, gmtOffsetHours: 7, birthTimeKnown: true });
    const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
    const cl = tyme.ChildLimit.fromSolarTime(st, g);
    return Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
  } catch (e) {
    console.error("[sifu] ChildLimit failed, default 10:", (e as Error).message);
    return 10;
  }
}
const INTRO_OPENROUTER_MODEL = process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";
const CHILD_USER = "jarvis";
const STEM_ELEMENT_MAP: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY_MAP: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
const DM_LABEL_TH: Record<string, string> = {
  wood: "ไม้",
  fire: "ไฟ",
  earth: "ดิน",
  metal: "ทอง",
  water: "น้ำ",
};
const DM_POLARITY_TH: Record<string, string> = {
  yang: "หยาง",
  yin: "หยิน",
};
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};
const BRANCH_TH_NAME: Record<string, string> = {
  子: "ชวด", 丑: "ฉลู", 寅: "ขาล", 卯: "เถาะ", 辰: "มะโรง", 巳: "มะเส็ง",
  午: "มะเมีย", 未: "มะแม", 申: "วอก", 酉: "ระกา", 戌: "จอ", 亥: "กุน",
};
function buildIntroWarmup(ctx: string): string | null {
  const fact = ctx.match(/FACT LOCK: Day Master = (\S+) · polarity = (\w+) · element = (\w+)/);
  if (!fact) return null;
  const [, , polarityRaw, elementRaw] = fact;
  const element = DM_LABEL_TH[elementRaw] || elementRaw;
  const polarity = DM_POLARITY_TH[polarityRaw] || polarityRaw;
  const bodyMap = loadPromptKV("prompts/sifu-warmup-bodies.md"); // แก้ผ่าน admin
  const body = bodyMap[`${elementRaw}:${polarityRaw}`] || bodyMap.default || "";
  const tpl = loadPromptMd("prompts/sifu-warmup.md").trim(); // แก้ผ่าน admin · .default กันพัง
  if (!tpl) return null;
  return tpl
    .replace("{{ELEMENT}}", () => element)
    .replace("{{POLARITY}}", () => polarity)
    .replace("{{BODY}}", () => body) + "\n\n";
}

/* 📦 buildChartPacket/buildProfilePacket เดิม ย้ายไป src/lib/chart-packet.ts (structured layer)
 * → buildStructuredChartPacket + renderChartPrompt + validateChartPacket (25 พ.ค. · Step 1 Lite) */

/* 🧓 อาเจ๊กฮ้ง bazi reading rules · cache 60s · บังคับ AI ทุก request */
const AJEK_RULES_PATH = join(process.cwd(), "data/library/ajek-bazi-rules.md");
let _ajekCache: { text: string; ts: number; version: string } | null = null;
function loadAjekRules(): { text: string; version: string } {
  const now = Date.now();
  if (_ajekCache && now - _ajekCache.ts < 60_000) return _ajekCache;
  try {
    const text = readFileSync(AJEK_RULES_PATH, "utf8");
    const st = statSync(AJEK_RULES_PATH);
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _ajekCache = { text, ts: now, version };
    return _ajekCache;
  } catch (e) {
    console.warn("[sifu] ajek rules not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

/* 24 พ.ค. · คัมภีร์ปฏิกิริยาดวง (合/冲/刑/害/破/三合/暗合/墓库/十神) · AI สแกนผัง user เทียบกฎนี้ */
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
    console.warn("[sifu] interaction master not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

/* 25 พ.ค. · ตำราคลาสสิกเสริม 4 ไฟล์ (調候用神 · Event Timing應期 · 5 ด้านชีวิต · ปฏิกิริยาเสาเชิงลึก)
 * ยัดดิบเข้า prompt ให้ AI อ่านเป็นอ้างอิง · ไม่ทำ scoring engine · AI ตีความเอง (แม่น>เร็ว · ลูกค้ารอได้)
 * อ่านครั้งเดียว cache 60s · compass_artifact = ซ้ำ Yong Shen ตัดออก */
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
      console.warn("[sifu] engine knowledge missing:", file, (e as Error).message);
    }
  }
  const text = parts.join("\n");
  const version = text ? hash.digest("hex").slice(0, 12) : "none";
  _engineKnowledgeCache = { text, ts: now, version };
  return _engineKnowledgeCache;
}

/* 💾 DB result cache · TTL 24h */
const CACHE_TTL_HOURS = 24;
function cacheKey(opts: {
  profileId?: string;
  topic?: string;
  mode?: string;
  lang: string;
  message: string;
  dayPillar?: string;
  ruleVersion: string;
}): string {
  const parts = [
    "v6-packet", // 25 พ.ค. · structured ChartPacket layer (chart-packet.ts) · bump = invalidate คำตอบเก่า
    opts.ruleVersion,
    opts.profileId || "anon",
    opts.topic || "free",
    opts.mode || "default",
    opts.lang,
    opts.dayPillar || "nopil",
    opts.message,
  ].join("|");
  return createHash("sha256").update(parts).digest("hex");
}

function knownBirthTime(raw: unknown): boolean {
  if (raw === false || raw === 0) return false;
  if (String(raw).toLowerCase() === "false" || String(raw) === "0") return false;
  return true;
}
async function getCachedReply(key: string): Promise<{ reply: string; model: string } | null> {
  try {
    const row = await q1<{ payload: { reply: string; model: string } }>(
      `SELECT payload FROM aj_sifu_cache WHERE cache_key=$1 AND expires_at>NOW()`,
      [key]
    );
    if (!row) return null;
    // bump hit count async
    q(`UPDATE aj_sifu_cache SET hits=hits+1 WHERE cache_key=$1`, [key]).catch(() => {});
    return row.payload;
  } catch (e) {
    console.warn("[sifu cache] miss/err:", (e as Error).message);
    return null;
  }
}
async function setCachedReply(key: string, payload: { reply: string; model: string }, ms: number, ruleVersion: string) {
  try {
    await q(
      `INSERT INTO aj_sifu_cache (cache_key, payload, model, ms, rule_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${CACHE_TTL_HOURS} hours')
       ON CONFLICT (cache_key) DO UPDATE SET payload=$2, ms=$4, expires_at=NOW() + INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [key, JSON.stringify(payload), payload.model, ms, ruleVersion]
    );
  } catch (e) {
    console.warn("[sifu cache] save err:", (e as Error).message);
  }
}

/* ดึง day pillar เพื่อใส่ใน cache key (วันเปลี่ยน = cache miss) */
async function getDayPillarKey(): Promise<string> {
  try {
    const now = new Date();
    return now.toISOString().slice(0, 10); // YYYY-MM-DD UTC (วันเปลี่ยน → cache invalidate)
  } catch {
    return "today";
  }
}

/* Build short BaZi context summary from profile */
async function buildBaziContext(profileId: string): Promise<string> {
  try {
    const row = await q1<{
      name?: string;
      birth_datetime: string;
      birth_lng: number | null;
      gender: string | null;
      birth_time_known: boolean | null;
    }>(
      `SELECT name, to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known FROM profiles WHERE id=$1`,
      [profileId]
    );
    if (!row) return "(ไม่พบ profile)";

    const dt = row.birth_datetime;
    const [date, timeRaw] = dt.split("T");
    const time = (timeRaw || "12:00").slice(0, 5);  // ตัดวินาทีออก (DB ให้ HH:MM:SS) · กัน new Date(`...T13:15:00:00`) เสีย → อายุ/วัยจร = NaN
    const lng = Number(row.birth_lng || 100.5018);
    const gender = (row.gender === "female" ? "F" : "M") as "M" | "F";
    const birthTimeKnown = knownBirthTime(row.birth_time_known);

    const calc = birthTimeKnown
      ? await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    const g = loadPromptKV("prompts/sifu-ctx-guards.md"); // คำสั่ง/ล็อก แก้ผ่าน admin
    if (calc.mode === "3p") {
      return [
        `ชื่อ: ${row.name || "—"} · เพศ ${gender}`,
        `เกิด: ${date} · ไม่ทราบเวลาเกิด · ลองจิจูด ${lng}`,
        `โหมดคำนวณ: 3 เสา (年/月/日) · ${g.NO_HOUR_PILLAR}`,
        `3 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時(ไม่คำนวณ)`,
        `FACT LOCK: Day Master = ${calc.dayMaster} · element = ${STEM_ELEMENT_MAP[calc.dayMaster] || "unknown"} · ${g.DM_FACT_LOCK}`,
        `วันเจ้า: ${calc.dayMaster} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
        `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
        `格局: ${calc.geJu.structure || "ปกติ"}`,
        g.LIMIT_3P_QA,
      ].join("\n");
    }
    const startAge = await computeStartAge(date, time, gender, lng);
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
      `ชื่อ: ${row.name || "—"} · เพศ ${gender} · อายุปัจจุบันประมาณ ${ageNow}`,
      `เกิด: ${date} ${time} · ลองจิจูด ${lng}`,
      `4 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時${calc.pillarsZh.hour}`,
      `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ${g.DM_FACT_LOCK}`,
      g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh),
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
      `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
      `格局: ${calc.geJu.structure || "ปกติ"}`,
      `納音: 年${ny.year?.zh||"-"} · 月${ny.month?.zh||"-"} · 日${ny.day?.zh||"-"} · 時${ny.hour?.zh||"-"}`,
    ];
    // TODO Step1.1: dedupe 用神/格局 ที่ซ้ำกับ renderChartPrompt
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g);
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet));
    if (ext.special_chart.applicable) {
      lines.push(`ดวงพิเศษ: ${ext.special_chart.type_zh} · friendly=${ext.special_chart.friendly_elements.join("·")}`);
    }
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu] buildBaziContext failed:", e);
    return "(ไม่สามารถคำนวณดวงได้)";
  }
}

function parseIntroBirthParams(url: URL): IntroBirthInput | null {
  const date = (url.searchParams.get("birthDate") || "").trim();
  const birthTimeKnown = knownBirthTime(url.searchParams.get("birthTimeKnown"));
  const time = birthTimeKnown ? (url.searchParams.get("birthTime") || "12:00").trim().slice(0, 5) : "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (birthTimeKnown && !/^\d{2}:\d{2}$/.test(time))) return null;
  const lng = Number(url.searchParams.get("birthLng") || 100.5018);
  const genderRaw = (url.searchParams.get("gender") || "M").toLowerCase();
  return {
    name: url.searchParams.get("name") || undefined,
    date,
    time,
    lng: Number.isFinite(lng) ? lng : 100.5018,
    gender: genderRaw === "female" || genderRaw === "f" ? "F" : "M",
    birthTimeKnown,
    source: "params",
  };
}

async function buildIntroBaziContext(profileId: string): Promise<string> {
  try {
    const row = await q1<{
      name?: string;
      birth_datetime: string;
      birth_lng: number | null;
      gender: string | null;
      birth_time_known: boolean | null;
    }>(
      `SELECT name, to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known FROM profiles WHERE id=$1`,
      [profileId]
    );
    if (!row) return "(ไม่พบ profile)";
    const [date, timeRaw] = row.birth_datetime.split("T");
    return buildIntroBaziContextFromBirth({
      name: row.name,
      date,
      time: (timeRaw || "12:00").slice(0, 5),
      lng: Number(row.birth_lng || 100.5018),
      gender: (row.gender === "female" ? "F" : "M") as "M" | "F",
      birthTimeKnown: knownBirthTime(row.birth_time_known),
      source: "profile",
    });
  } catch (e) {
    console.error("[sifu] buildIntroBaziContext failed:", e);
    return "(ไม่สามารถคำนวณดวง intro ได้)";
  }
}

async function buildIntroBaziContextFromBirth(input: IntroBirthInput): Promise<string> {
  try {
    const birthDate = new Date(`${input.date}T${input.time}:00+07:00`);
    const birthTimeKnown = input.birthTimeKnown !== false;
    const calc = birthTimeKnown
      ? await calcBazi({ date: input.date, time: input.time, longitude: input.lng, gmtOffsetHours: 7, gender: input.gender, birthTimeKnown: true })
      : await calcBazi({ date: input.date, longitude: input.lng, gmtOffsetHours: 7, gender: input.gender, birthTimeKnown: false });
    const g = loadPromptKV("prompts/sifu-ctx-guards.md"); // คำสั่ง/ล็อก แก้ผ่าน admin
    if (calc.mode === "3p") {
      const dm = calc.dayMaster;
      const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
      const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
      const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
      const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
      const dmThaiLock = g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh);
      return [
        `DATA SOURCE: ${input.source}`,
        `ชื่อ: ${input.name || "—"} · เพศ ${input.gender}`,
        `เกิด: ${input.date} · ไม่ทราบเวลาเกิด · lng ${input.lng} · timezone Asia/Bangkok`,
        g.MODE_LOCK_3P,
        `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ${g.DM_FACT_LOCK}`,
        dmThaiLock,
        `3 เสาแบบอ่านไทย: ปี=${STEM_TH[calc.pillars.year.stem]}/${BRANCH_TH_NAME[calc.pillars.year.branch]} · เดือน=${STEM_TH[calc.pillars.month.stem]}/${BRANCH_TH_NAME[calc.pillars.month.branch]} · วัน=${STEM_TH[calc.pillars.day.stem]}/${BRANCH_TH_NAME[calc.pillars.day.branch]} · ยาม=ไม่ทราบเวลาเกิด`,
        `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
        `โครงดวง: ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วย ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
        g.LIMIT_3P_INTRO,
      ].join("\n");
    }
    const startAge = await computeStartAge(input.date, input.time, input.gender, input.lng);
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      input.gender,
      birthDate,
      startAge,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null
    );
    const dm = calc.dayMaster;
    const ageNow = Math.max(0, new Date().getUTCFullYear() - birthDate.getUTCFullYear());
    const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
    const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
    const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
    const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
    const lines = [
      `DATA SOURCE: ${input.source}`,
      `ชื่อ: ${input.name || "—"} · เพศ ${input.gender} · อายุปัจจุบันประมาณ ${ageNow}`,
      `เกิด: ${input.date} ${input.time} · lng ${input.lng} · timezone Asia/Bangkok`,
      `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ${g.DM_FACT_LOCK}`,
      g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh),
      `สี่เสาแบบอ่านไทย: ปี=${STEM_TH[calc.pillars.year.stem]}/${BRANCH_TH_NAME[calc.pillars.year.branch]} · เดือน=${STEM_TH[calc.pillars.month.stem]}/${BRANCH_TH_NAME[calc.pillars.month.branch]} · วัน=${STEM_TH[calc.pillars.day.stem]}/${BRANCH_TH_NAME[calc.pillars.day.branch]} · ยาม=${STEM_TH[calc.pillars.hour.stem]}/${BRANCH_TH_NAME[calc.pillars.hour.branch]}`,
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
      `โครงดวง: ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วย ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
    ];
    // TODO Step1.1: dedupe 用神/格局 ที่ซ้ำกับ renderChartPrompt
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g);
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet));
    lines.push(`ย้อนหลัง 12 เดือน: 0-3 เดือนล่าสุด / 4-6 เดือน / 7-9 เดือน / 10-12 เดือน`);
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu] buildIntroBaziContextFromBirth failed:", e);
    return "(ไม่สามารถคำนวณดวง intro ได้)";
  }
}

function buildPrompt(opts: {
  ctx: string;
  message: string;
  history: Msg[];
  topic?: string;
  lang: string;
  mode?: string;
}): string {
  /* 25 พ.ค. · ทุก persona/คำสั่ง/ภาษา/หัวคัมภีร์ อ่านจาก md (แก้ผ่าน /admin/sifu-prompts) · ไม่มี persona ผูกในโค้ด · .default.md = ตัวกันพัง */
  const langKey = (opts.lang || "th").toUpperCase();

  if (opts.mode === "intro") {
    const introInteraction = loadInteractionMaster();
    const introInteractionBlock = introInteraction.text
      ? "\n" + loadPromptMd("prompts/sifu-intro-interaction-header.md").trim().replace("{{INTERACTION}}", () => introInteraction.text) + "\n"
      : "";
    const introEngine = loadEngineKnowledge();
    const introEngineBlock = introEngine.text
      ? "\n" + loadPromptMd("prompts/sifu-engine-header.md").trim().replace("{{ENGINE}}", () => introEngine.text) + "\n"
      : "";
    const introLang = loadPromptSections("prompts/sifu-intro-lang.md");
    return loadPromptMd("prompts/sifu-intro.md")
      .replace("{{LANG}}", () => introLang[langKey] || introLang.TH || "")
      .replace("{{INTERACTION}}", () => introInteractionBlock + introEngineBlock)
      .replace("{{CTX}}", () => opts.ctx)
      .replace("{{MESSAGE}}", () => opts.message);
  }

  const histText = opts.history.length
    ? "\n\nประวัติคำถาม:\n" + opts.history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";
  const topicMap = loadPromptKV("prompts/sifu-topics.md");
  const focus = opts.topic && topicMap[opts.topic] ? `\nหัวข้อ: ${topicMap[opts.topic]}` : "";
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
  const qaLang = loadPromptSections("prompts/sifu-lang.md");
  return loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock)
    .replace("{{CTX}}", () => opts.ctx)
    .replace("{{FOCUS_HIST}}", () => focus + histText)
    .replace("{{MESSAGE}}", () => opts.message);
}

/* 🔍 ดักจับ prompt จริงที่ส่งเข้า AI · พิสูจน์ตำรา+engine ถูกยัดจริง · ทำงานเฉพาะ env SIFU_DUMP_PROMPT=1 · default off ไม่กระทบ prod */
function dumpPromptIfDebug(prompt: string, tag: string) {
  if (!process.env.SIFU_DUMP_PROMPT) return;
  try {
    const path = `/tmp/sifu-prompt-${tag}-${Date.now()}.txt`;
    writeFileSync(path, prompt);
    console.log(`[sifu][DUMP] ${tag} · ${prompt.length} chars → ${path}`);
  } catch (e) { console.error("[sifu][DUMP] fail:", (e as Error).message); }
}

async function runClaudeCli(prompt: string): Promise<string> {
  dumpPromptIfDebug(prompt, "cli");
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--setting-sources", "user",
    ];
    const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
    const c = spawn("sudo", spawnArgs, {
      cwd: "/var/www/checklist-app",
      env: process.env,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
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

/* 🌊 Streaming version · pipe stdout เป็น chunks · ใช้ใน SSE
 * stream-json + include-partial-messages = real token streaming */
function spawnClaudeStreaming(prompt: string) {
  dumpPromptIfDebug(prompt, "stream");
  const claudeArgs = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
    "--setting-sources", "user",
  ];
  const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
  const c = spawn("sudo", spawnArgs, { cwd: "/var/www/checklist-app", env: process.env });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

/* Parser · แยก JSON line-by-line · ดึง text content จาก stream-json */
function makeJsonlParser(onText: (text: string) => void) {
  let buf = "";
  return (chunk: Buffer) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        // partial: { type:'stream_event', event:{type:'content_block_delta', delta:{type:'text_delta', text:'...'}} }
        // final:   { type:'assistant', message:{ content:[{type:'text', text:'...'}] } }
        if (obj.type === "stream_event" && obj.event?.type === "content_block_delta" && obj.event.delta?.type === "text_delta") {
          onText(obj.event.delta.text);
        } else if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
          // จะมาทีหลัง · skip เพราะ partial ส่งครบแล้ว
        }
      } catch (_) {
        // not JSON · skip
      }
    }
  };
}

async function streamOpenRouter(prompt: string, onText: (text: string) => void): Promise<{ full: string; model: string }> {
  dumpPromptIfDebug(prompt, "openrouter");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let full = "";
  try {
    const r = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hourkey.io",
        "X-Title": "hourkey · Sifu Intro",
      },
      body: JSON.stringify({
        model: INTRO_OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.35,
        max_tokens: 1500,
        stream: true,
      }),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) {
      const errText = await r.text().catch(() => "");
      throw new Error(`openrouter ${r.status} ${errText.slice(0, 200)}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content;
            const text = typeof delta === "string"
              ? delta
              : Array.isArray(delta)
                ? delta.map((x) => x?.text || "").join("")
                : "";
            if (text) {
              full += text;
              onText(text);
            }
          } catch {}
        }
      }
    }
    return { full: full.trim(), model: INTRO_OPENROUTER_MODEL };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const profileId: string | undefined = body.profileId;
    const topic: string | undefined = body.topic;
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
    const mode: string | undefined = body.mode === "intro" ? "intro" : undefined;

    if (!message) {
      return NextResponse.json({ error: "no message" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "message too long" }, { status: 400 });
    }

    /* 💾 Cache check ก่อน */
    const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version;
    const dayKey = await getDayPillarKey();
    const key = cacheKey({ profileId, topic, mode, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
    const useCache = mode !== "intro";
    const cached = useCache ? await getCachedReply(key) : null;
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, key: key.slice(0, 8) });
    }

    const ctx = mode === "intro"
      ? (profileId ? await buildIntroBaziContext(profileId) : "(intro mode แต่ไม่มี profileId)")
      : (profileId ? await buildBaziContext(profileId) : "(ไม่มี profileId · ตอบทั่วไป)");
    /* ⚠️ ส่ง history จริงเข้า prompt (ไม่ใช่ history:[] แบบ GET) · คำตอบต้องจำบทสนทนา */
    const prompt = buildPrompt({ ctx, message, history, topic, lang, mode });

    /* 🌊 SSE streaming เมื่อ Accept: text/event-stream หรือ body.stream === true
     * (intro mode คง JSON เดิม · master ใช้ Q&A ปกติ mode=undefined) · ยก pattern จาก /api/network/sifu + GET handler */
    const wantsStream =
      mode !== "intro" &&
      ((req.headers.get("accept") || "").includes("text/event-stream") || body.stream === true);
    if (wantsStream) {
      const encoder = new TextEncoder();
      let activeChild: ReturnType<typeof spawnClaudeStreaming> | null = null;
      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          let full = "";
          let firstChunkSent = false;
          const t0 = Date.now();
          const safeClose = () => {
            if (closed) return;
            closed = true;
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

          send("meta", { cached: false, key: key.slice(0, 8), startedAt: t0 });
          const child = spawnClaudeStreaming(prompt);
          activeChild = child;
          const killTimer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "timeout" });
            safeClose();
          }, TIMEOUT_MS);

          const parser = makeJsonlParser((text) => {
            full += text;
            if (!firstChunkSent) {
              firstChunkSent = true;
              send("first", { ms: Date.now() - t0, model: "claude-max-cli" });
            }
            send("chunk", { text });
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            console.warn("[sifu sse stderr]", chunk.toString().slice(0, 200));
          });
          child.on("close", (code) => {
            activeChild = null;
            clearTimeout(killTimer);
            const ms = Date.now() - t0;
            if (code === 0 && full.trim()) {
              const payload = { reply: full.trim(), model: "claude-max-cli" };
              if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
              send("done", { ms, model: payload.model, cached: false, chars: full.length });
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

    const t0 = Date.now();
    const reply = await runClaudeCli(prompt);
    const ms = Date.now() - t0;
    const payload = { reply, model: "claude-max-cli" };
    if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
    return NextResponse.json({ ...payload, cached: false, ms, key: key.slice(0, 8) });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[sifu] error:", err);
    return NextResponse.json({ error: err.message || "internal" }, { status: 500 });
  }
}

/* 🌊 SSE Streaming endpoint · GET /api/sifu?stream=1&profileId=&topic=&lang=&message= */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("stream") !== "1") {
    return NextResponse.json({ error: "use ?stream=1" }, { status: 400 });
  }
  const message = (url.searchParams.get("message") || "").trim();
  const profileId = url.searchParams.get("profileId") || undefined;
  const topic = url.searchParams.get("topic") || undefined;
  const lang = (["th","en","zh"].includes(url.searchParams.get("lang") || "") ? url.searchParams.get("lang") : "th") as string;
  const mode = url.searchParams.get("mode") === "intro" ? "intro" : undefined;

  if (!message) {
    return NextResponse.json({ error: "no message" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version;
  const dayKey = await getDayPillarKey();
  const key = cacheKey({ profileId, topic, mode, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
  const useCache = mode !== "intro";
  const cached = useCache ? await getCachedReply(key) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
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

      // 1. Cache hit → ส่งทั้งก้อนทันที
      if (cached) {
        send("meta", { cached: true, key: key.slice(0, 8) });
        send("chunk", { text: cached.reply });
        send("done", { ms: 0, model: cached.model, cached: true });
        safeClose();
        return;
      }

      // 2. Cache miss → spawn Claude + pipe stdout chunk-by-chunk
      send("meta", { cached: false, key: key.slice(0, 8), startedAt: Date.now() });
      let ctx = mode === "intro"
        ? "(intro mode แต่ไม่มี profileId)"
        : "(ไม่มี profileId)";
      try {
        if (mode === "intro") {
          const birthParams = parseIntroBirthParams(url);
          if (profileId) {
            ctx = await buildIntroBaziContext(profileId);
            if (ctx.startsWith("(ไม่") && birthParams) ctx = await buildIntroBaziContextFromBirth(birthParams);
          } else {
            ctx = birthParams ? await buildIntroBaziContextFromBirth(birthParams) : ctx;
          }
        }
        else ctx = profileId ? await buildBaziContext(profileId) : ctx;
      } catch (e) {
        console.warn("[sifu sse] ctx err:", (e as Error).message);
      }
      const warmup = mode === "intro" ? buildIntroWarmup(ctx) : null;
      const promptBase = buildPrompt({ ctx, message, history: [], topic, lang, mode });
      const prompt = warmup
        ? `${promptBase}\n\n${loadPromptMd("prompts/sifu-intro-resume-note.md").trim()}`
        : promptBase;

      const t0 = Date.now();
      if (mode === "intro") {
        let firstChunkSent = !!warmup;
        if (warmup) {
          send("first", { ms: 0, synthetic: true, provider: "engine" });
          send("chunk", { text: warmup });
        }
        try {
          const result = await streamOpenRouter(prompt, (text) => {
            if (!firstChunkSent) {
              send("first", { ms: Date.now() - t0, provider: "openrouter" });
              firstChunkSent = true;
            }
            send("chunk", { text });
          });
          if (result.full) {
            send("done", { ms: Date.now() - t0, model: result.model, provider: "openrouter", cached: false, chars: result.full.length });
          } else {
            send("error", { error: "openrouter empty" });
          }
        } catch (e) {
          console.warn("[sifu intro openrouter]", (e as Error).message);
          send("error", { error: "openrouter failed" });
        }
        safeClose();
        return;
      }

      const c = spawnClaudeStreaming(prompt);
      let full = "";
      let firstChunkSent = false;

      if (warmup) {
        send("first", { ms: 0, synthetic: true });
        send("chunk", { text: warmup });
        firstChunkSent = true;
      }

      const killTimer = setTimeout(() => {
        try { c.kill("SIGKILL"); } catch {}
        send("error", { error: "timeout" });
        safeClose();
      }, TIMEOUT_MS);

      const parser = makeJsonlParser((text: string) => {
        send("chunk", { text });
        full += text;
        if (!firstChunkSent) {
          send("first", { ms: Date.now() - t0 });
          firstChunkSent = true;
        }
      });
      c.stdout.on("data", parser);
      c.stderr.on("data", (chunk: Buffer) => {
        console.warn("[sifu sse stderr]", chunk.toString().slice(0, 200));
      });
      c.on("close", (code) => {
        clearTimeout(killTimer);
        const ms = Date.now() - t0;
        if (code === 0 && full.trim()) {
          const payload = { reply: full.trim(), model: "claude-max-cli" };
          if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
          send("done", { ms, model: payload.model, cached: false, chars: full.length });
        } else {
          send("error", { error: `claude exit ${code}` });
        }
        safeClose();
      });
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
