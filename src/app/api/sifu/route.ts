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
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { q1, q } from "@/lib/db";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd } from "@/lib/prompt-md";

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

const TIMEOUT_MS = 180_000; // 180s · 13-step ajek rules · streaming-less
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const INTRO_OPENROUTER_MODEL = process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";
const CHILD_USER = "jarvis";
const HIDDEN_STEMS_MAP: Record<string, string[]> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
  辰: ["戊", "乙", "癸"], 巳: ["丙", "戊", "庚"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};
const STEM_ELEMENT_MAP: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY_MAP: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
const ELEMENT_PRODUCES_MAP: Record<string, string> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const ELEMENT_CONTROLS_MAP: Record<string, string> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
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
const DM_WARMUP_MAP: Record<string, string> = {
  "wood:yang": "แกนในเป็นคนเดินหน้า โตจากแรงผลักและความเชื่อของตัวเอง เวลาชีวิตติดมักไม่ยอมแพ้ง่าย",
  "wood:yin": "แกนในเป็นคนค่อยๆ เติบโต เก็บรายละเอียดเก่ง รู้จังหวะเข้าหาและถอยห่างจากคนรอบตัว",
  "fire:yang": "แกนในเป็นคนเปิดเผย ชัดเจน มีแรงส่งสูง เวลาเชื่ออะไรจะผลักเรื่องนั้นให้ไปข้างหน้าอย่างจริงจัง",
  "fire:yin": "แกนในไวต่อบรรยากาศและความรู้สึกคนอื่น มีเสน่ห์จากความอบอุ่นและวิธีพูดที่ค่อยๆ แตะใจคน",
  "earth:yang": "แกนในหนักแน่น รับภาระเก่ง และมักเป็นเสาค้ำให้คนรอบตัว แม้ข้างในจะกดดันไม่น้อย",
  "earth:yin": "แกนในระวังตัว สุขุม และชอบวางเรื่องให้เป็นระบบ เวลาตัดสินใจจะดูผลระยะยาวมากกว่าความฉาบฉวย",
  "metal:yang": "แกนในตรง คม และตัดสินใจชัด เมื่อถึงเวลาต้องเลือกมักไม่ชอบยืดเรื่องให้ค้างคา",
  "metal:yin": "แกนในละเอียด รอบคอบ และมีมาตรฐานในใจสูง จึงอ่านคนและอ่านสถานการณ์ค่อนข้างไว",
  "water:yang": "แกนในเคลื่อนไหวเร็ว ปรับตัวเก่ง รับแรงกดดันได้ดี และมักหาทางออกได้แม้ตอนสถานการณ์บีบ",
  "water:yin": "แกนในลึก เงียบ และช่างสังเกต มองอะไรหลายชั้นก่อนพูดหรือก่อนเปิดใจให้ใครง่ายๆ",
};
const TEN_GOD_TH: Record<string, string> = {
  比肩: "ดาวเพื่อนร่วมแรง",
  劫財: "ดาวแย่งทรัพย์",
  食神: "ดาวความสามารถ",
  傷官: "ดาวแสดงออก",
  偏財: "ดาวทรัพย์นอกระบบ",
  正財: "ดาวทรัพย์ตรง",
  七殺: "ดาวแรงกดดัน",
  正官: "ดาวระเบียบอำนาจ",
  偏印: "ดาวครูแปลกทาง",
  正印: "ดาวครูผู้ใหญ่",
  日主: "ตัวตนหลัก",
};
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};
const BRANCH_TH_NAME: Record<string, string> = {
  子: "ชวด", 丑: "ฉลู", 寅: "ขาล", 卯: "เถาะ", 辰: "มะโรง", 巳: "มะเส็ง",
  午: "มะเมีย", 未: "มะแม", 申: "วอก", 酉: "ระกา", 戌: "จอ", 亥: "กุน",
};
function tenGodOf(dayMaster: string, targetStem: string): string | null {
  const dmEl = STEM_ELEMENT_MAP[dayMaster];
  const tEl = STEM_ELEMENT_MAP[targetStem];
  if (!dmEl || !tEl) return null;
  const samePol = STEM_POLARITY_MAP[dayMaster] === STEM_POLARITY_MAP[targetStem];
  if (dmEl === tEl) return samePol ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES_MAP[dmEl] === tEl) return samePol ? "食神" : "傷官";
  if (ELEMENT_CONTROLS_MAP[dmEl] === tEl) return samePol ? "偏財" : "正財";
  if (ELEMENT_CONTROLS_MAP[tEl] === dmEl) return samePol ? "七殺" : "正官";
  if (ELEMENT_PRODUCES_MAP[tEl] === dmEl) return samePol ? "偏印" : "正印";
  return null;
}

function tenGodLabel(stem: string, dayMaster: string): string {
  const tg = stem === dayMaster ? "日主" : tenGodOf(dayMaster, stem);
  return tg ? `${TEN_GOD_TH[tg] || tg}` : "-";
}

function buildIntroWarmup(ctx: string): string | null {
  const fact = ctx.match(/FACT LOCK: Day Master = (\S+) · polarity = (\w+) · element = (\w+)/);
  if (!fact) return null;
  const [, , polarityRaw, elementRaw] = fact;
  const element = DM_LABEL_TH[elementRaw] || elementRaw;
  const polarity = DM_POLARITY_TH[polarityRaw] || polarityRaw;
  const body = DM_WARMUP_MAP[`${elementRaw}:${polarityRaw}`] || "แกนในมีแรงของตัวเองชัด และชีวิตมักสอนผ่านประสบการณ์ตรงมากกว่าคำพูด";
  return `คุณเป็นคนธาตุ${element}แบบ${polarity} ${body} ซินแสจะค่อยๆ ไล่ให้คุณเห็นว่าแต่ละช่วงวัยและ 12 เดือนล่าสุดเดินพลังอย่างไร\n\n`;
}

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
    "v2-3p",
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
    const [date, time] = dt.split("T");
    const lng = Number(row.birth_lng || 100.5018);
    const gender = (row.gender === "female" ? "F" : "M") as "M" | "F";
    const birthTimeKnown = knownBirthTime(row.birth_time_known);

    const calc = birthTimeKnown
      ? await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    if (calc.mode === "3p") {
      return [
        `ชื่อ: ${row.name || "—"} · เพศ ${gender}`,
        `เกิด: ${date} · ไม่ทราบเวลาเกิด · ลองจิจูด ${lng}`,
        `โหมดคำนวณ: 3 เสา (年/月/日) · ห้ามสร้างหรือเดาเสายาม`,
        `3 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時(ไม่คำนวณ)`,
        `FACT LOCK: Day Master = ${calc.dayMaster} · element = ${STEM_ELEMENT_MAP[calc.dayMaster] || "unknown"} · ห้ามเรียกธาตุหลักผิด`,
        `วันเจ้า: ${calc.dayMaster} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
        `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
        `格局: ${calc.geJu.structure || "ปกติ"}`,
        `ข้อจำกัดสำคัญ: ไม่มีเสายาม จึงไม่อ่านเรื่องลูก/บั้นปลาย/เรือนยาม/河洛/命宮ที่ต้องพึ่งเวลาเกิด ให้ตอบจากปี เดือน วัน ฤดู และ Day Master เท่านั้น`,
      ].join("\n");
    }
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      gender,
      new Date(`${date}T${time}:00+07:00`),
      10,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null
    );
    const lp = ext.luck_pillars[ext.current_luck_idx];
    const ny = ext.nayin;
    const lpStr = lp ? `${lp.stem}${lp.branch} (${lp.qi_phase})` : "—";

    const lines = [
      `ชื่อ: ${row.name || "—"} · เพศ ${gender}`,
      `เกิด: ${date} ${time} · ลองจิจูด ${lng}`,
      `4 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時${calc.pillarsZh.hour}`,
      `วันเจ้า: ${calc.dayMaster} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
      `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
      `格局: ${calc.geJu.structure || "ปกติ"}`,
      `納音: 年${ny.year?.zh||"-"} · 月${ny.month?.zh||"-"} · 日${ny.day?.zh||"-"} · 時${ny.hour?.zh||"-"}`,
      `เสาโชคปัจจุบัน: ${lpStr}`,
      `流年 2026: ${ext.current_year_pillar.stem}${ext.current_year_pillar.branch}`,
    ];
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
    if (calc.mode === "3p") {
      const dm = calc.dayMaster;
      const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
      const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
      const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
      const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
      return [
        `DATA SOURCE: ${input.source}`,
        `ชื่อ: ${input.name || "—"} · เพศ ${input.gender}`,
        `เกิด: ${input.date} · ไม่ทราบเวลาเกิด · lng ${input.lng} · timezone Asia/Bangkok`,
        `MODE LOCK: 3-pillar mode · ไม่มีเสายาม · ห้ามเดาเสา 12:00 เป็นชั่วยามจริง`,
        `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ห้ามเรียกธาตุหลักผิด`,
        `DM THAI LOCK: ต้องเรียกตัวตนหลักว่า "ธาตุ${dmElementTh}แบบ${dmPolarityTh}" เท่านั้น · ธาตุรองห้ามเรียกเป็นตัวตนหลัก`,
        `3 เสาแบบอ่านไทย: ปี=${STEM_TH[calc.pillars.year.stem]}/${BRANCH_TH_NAME[calc.pillars.year.branch]} · เดือน=${STEM_TH[calc.pillars.month.stem]}/${BRANCH_TH_NAME[calc.pillars.month.branch]} · วัน=${STEM_TH[calc.pillars.day.stem]}/${BRANCH_TH_NAME[calc.pillars.day.branch]} · ยาม=ไม่ทราบเวลาเกิด`,
        `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
        `โครงดวง: ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วย ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
        `ข้อจำกัด: ไม่มีเสายาม จึงไม่อ่านเรือนลูก/บั้นปลาย/命宮/河洛/拱夾ที่ต้องใช้เวลาเกิด ให้เน้น Day Master เดือนเกิด ฤดู ธาตุช่วย และภาพชีวิตจาก 3 เสา`,
      ].join("\n");
    }
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      input.gender,
      birthDate,
      10,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null
    );
    const dm = calc.dayMaster;
    const ageNow = Math.max(0, new Date().getUTCFullYear() - birthDate.getUTCFullYear());
    const lp = ext.luck_pillars[ext.current_luck_idx];
    const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
    const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
    const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
    const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
    const pkeys = ["year", "month", "day", "hour"] as const;
    const pillarZh: Record<(typeof pkeys)[number], string> = { year: "年", month: "月", day: "日", hour: "時" };
    const pillarEn: Record<(typeof pkeys)[number], string> = { year: "Year", month: "Month", day: "Day", hour: "Hour" };
      const pillarFacts = pkeys.map((k) => {
      const p = calc.pillars[k];
      const tg = k === "day" ? "ตัวตนหลัก" : (TEN_GOD_TH[ext.ten_gods_map[k]?.ten_god || ""] || "-");
      const hidden = (HIDDEN_STEMS_MAP[p.branch] || [])
        .map((h, idx) => `${idx === 0 ? "แกนหลัก" : `แรงแฝง${idx}`}:${STEM_TH[h] || h}/${DM_LABEL_TH[STEM_ELEMENT_MAP[h]] || STEM_ELEMENT_MAP[h] || "-"}/${tenGodLabel(h, dm)}`)
        .join(" · ") || "-";
      const phase = ext.three_phases[k];
      const stars = ext.special_stars[k].map((s) => s.th || s.zh).slice(0, 3).join(" · ") || "-";
      const react = [
        ...ext.interactions.filter((i) => i.pillars_pair.includes(k)).map((i) => i.type === "六沖" ? "แรงปะทะ" : i.type === "六合" ? "แรงประสาน" : i.type === "六害" ? "แรงแทรก" : "แรงแตก"),
        ...ext.stem_interactions.filter((i) => i.pillars_pair.includes(k)).map((i) => i.type === "五合" ? "แรงรวมตัว" : "แรงขัด"),
        ...ext.fan_yin_fu_yin.filter((i) => i.natal_pillar === k || i.other_pillar === k).map((i) => i.type.includes("伏吟") ? "แรงซ้ำเรื่องเดิม" : "แรงพลิกเรื่องเดิม"),
      ].join(" · ") || "-";
      const kw = [
        ext.kong_wang.per_pillar[k] ? "any" : "",
        ext.kong_wang.per_pillar_year[k] ? "year" : "",
        ext.kong_wang.per_pillar_day[k] ? "day" : "",
      ].filter(Boolean).join("/") || "no";
      const ny = ext.nayin[k];
      const palace = ext.palace_readings[k];
      return `${pillarEn[k]} ${pillarZh[k]}: ฟ้า=${STEM_TH[p.stem] || p.stem}/${tg}; ดิน=${BRANCH_TH_NAME[p.branch] || p.branch}/${DM_LABEL_TH[STEM_ELEMENT_MAP[(HIDDEN_STEMS_MAP[p.branch] || [])[0] || ""]] || "-"}; แรงดิน->${tenGodLabel((HIDDEN_STEMS_MAP[p.branch] || [])[0] || "", dm)}; ธาตุซ่อน=${hidden}; วัฏจักร=ตัวตน:${phase.dm || "-"} เสา:${phase.pillar || "-"} ซ่อน:${phase.hidden_main || "-"}; ปฏิกิริยา=${react}; เรือน=${palace.title_th}; ดาวประกอบเท่านั้น=${stars}; นับเสียงประกอบ=${ny ? `${ny.th || ny.en}` : "-"}; ภาพเปลี่ยนผ่านประกอบ=${palace.hex ? `${palace.hex.th || palace.hex.en}` : "-"}`;
    });
    const lifeDecades = ext.liu_nian_timeline
      .filter((x) => x.age >= 0 && x.age <= ageNow)
      .reduce<Array<{ start: number; sample: string[] }>>((acc, x) => {
        const bucketStart = Math.floor(x.age / 10) * 10;
        let bucket = acc.find((b) => b.start === bucketStart);
        if (!bucket) {
          bucket = { start: bucketStart, sample: [] };
          acc.push(bucket);
        }
        if (bucket.sample.length < 2) bucket.sample.push(`${x.pillar.stem}${x.pillar.branch}${x.ten_god ? `/${x.ten_god}` : ""}${x.vs_day_branch.length ? `/${x.vs_day_branch.join(",")}` : ""}`);
        return acc;
      }, [])
      .map((b) => `${b.start}-${b.start + 9}:${b.sample.join("|")}`)
      .slice(0, 7)
      .join(" ; ");
    const lines = [
      `DATA SOURCE: ${input.source}`,
      `ชื่อ: ${input.name || "—"} · เพศ ${input.gender} · อายุปัจจุบันประมาณ ${ageNow}`,
      `เกิด: ${input.date} ${input.time} · lng ${input.lng} · timezone Asia/Bangkok`,
      `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ห้ามเรียกธาตุหลักผิด`,
      `DM THAI LOCK: ต้องเรียกตัวตนหลักว่า "ธาตุ${dmElementTh}แบบ${dmPolarityTh}" เท่านั้น · ธาตุรองห้ามเรียกเป็นตัวตนหลัก`,
      `สี่เสาแบบอ่านไทย: ปี=${STEM_TH[calc.pillars.year.stem]}/${BRANCH_TH_NAME[calc.pillars.year.branch]} · เดือน=${STEM_TH[calc.pillars.month.stem]}/${BRANCH_TH_NAME[calc.pillars.month.branch]} · วัน=${STEM_TH[calc.pillars.day.stem]}/${BRANCH_TH_NAME[calc.pillars.day.branch]} · ยาม=${STEM_TH[calc.pillars.hour.stem]}/${BRANCH_TH_NAME[calc.pillars.hour.branch]}`,
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
      `โครงดวง: ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วย ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
      `CHART PACKET รายเสา:\n${pillarFacts.join("\n")}`,
      `ลำดับน้ำหนักการอ่าน: 1) วันเจ้าและหยินหยาง 2) เดือนเกิด/ฤดู 3) กำลังตัวตนและธาตุช่วย 4) ธาตุซ่อนและดาวสิบเทพ 5) ปฏิกิริยาระหว่างเสา 6) วัยจร/ปีจร 7) เรือนชีวิต 8) ดาวพิเศษ/ภาพเปลี่ยนผ่าน/นับเสียงเป็นข้อมูลประกอบเท่านั้น`,
      `ธาตุรวม: ไม้ ${ext.element_counts.wood} · ไฟ ${ext.element_counts.fire} · ดิน ${ext.element_counts.earth} · ทอง ${ext.element_counts.metal} · น้ำ ${ext.element_counts.water} · ห้ามพูดตัวเลขเปอร์เซ็นต์`,
      `ช่องว่างของดวง: วัน=${ext.kong_wang.void_branches.map((b) => BRANCH_TH_NAME[b] || b).join("/")} · ปี=${ext.kong_wang.year_xun_voids.map((b) => BRANCH_TH_NAME[b] || b).join("/")}`,
      `วัยจรปัจจุบัน: ${lp ? `${STEM_TH[lp.stem] || lp.stem}/${BRANCH_TH_NAME[lp.branch] || lp.branch} อายุ ${lp.age_start}-${lp.age_end} · ${lp.qi_phase || "-"}` : "-"}`,
      `ปีจรปัจจุบัน: ${STEM_TH[ext.current_year_pillar.stem] || ext.current_year_pillar.stem}/${BRANCH_TH_NAME[ext.current_year_pillar.branch] || ext.current_year_pillar.branch}`,
      `คู่ครอง/ตัวตน: ${BRANCH_TH_NAME[ext.spouse_palace.day_branch] || ext.spouse_palace.day_branch} · ธาตุซ่อน ${ext.spouse_palace.hidden_stems.map((h) => STEM_TH[h] || h).join(" · ") || "-"} · ปฏิกิริยา ${ext.spouse_palace.relationship_flags.join(" · ") || "-"}`,
      `timeline 10 ปี: ${lifeDecades || "-"}`,
      `ย้อนหลัง 12 เดือน: 0-3 เดือนล่าสุด / 4-6 เดือน / 7-9 เดือน / 10-12 เดือน`,
    ];
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu] buildIntroBaziContextFromBirth failed:", e);
    return "(ไม่สามารถคำนวณดวง intro ได้)";
  }
}

const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทย · **สั้นกระชับ ไม่เกิน 350 คำ** · ใช้ markdown bold/emoji · ตำราคลาสสิก 子平真詮·淵海子平·三命通會 · เดินครบลำดับแต่ไม่ต้องเขียนทุก sub-step",
  en: "Reply in English · **concise, max 350 words** · markdown bold/emoji · classical BaZi sources · follow order but skip verbose sub-steps",
  zh: "用简体中文回答 · **简洁限 350 字内** · markdown 粗体/emoji · 子平真詮·淵海子平·三命通會 · 按顺序但不冗述",
};

const INTRO_LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทย · **ชัด ตรง อ่านง่าย 450-700 คำ** · ใช้น้ำเสียงซินแสพูดกับลูกค้าโดยตรง · มี emoji เล็กน้อยพอให้หายใจ",
  en: "Reply in English · **concise but substantial, 220-320 words** · warm, direct, easy to read · sound like a master greeting a new client immediately · avoid heavy technical jargon",
  zh: "用简体中文回答 · **精简但有内容，约220-320字** · 温和直接、容易读 · 像师傅第一次开口点醒新客人 · 避免过多术语",
};

const TOPIC_FOCUS: Record<string, string> = {
  overview: "ภาพรวมปี ดี-ระวัง-โอกาส",
  career:   "งาน·อาชีพ ปีนี้ · ควรเปลี่ยน/รอ · ช่วงไหนเหมาะ",
  wealth:   "การเงิน·ทรัพย์ ปีนี้ · เข้า-ออก · ลงทุนอะไรเหมาะ",
  love:     "ความรัก·คู่ครอง ปีนี้ · โอกาส·เตือน",
  health:   "สุขภาพ ปีนี้ · จุดเสี่ยง · ฤดูที่อ่อนแอ",
  study:    "การเรียน·พัฒนาตน ปีนี้ · ทักษะที่ควรเสริม",
};

function buildPrompt(opts: {
  ctx: string;
  message: string;
  history: Msg[];
  topic?: string;
  lang: string;
  mode?: string;
}): string {
  if (opts.mode === "intro") {
    const introInteraction = loadInteractionMaster();
    const introInteractionBlock = introInteraction.text
      ? `\n=== 📜 คัมภีร์ปฏิกิริยาดวง (สแกนภายใน · เล่าเป็นไทยล้วน ห้ามโชว์อักษรจีน) ===\nก่อนเล่าชีวิต ให้สแกนผังหา "ปฏิกิริยาระหว่างเสา" (รวม/ปะทะ/ลงโทษ/ทำร้าย/ทำลาย/สามประสาน/แอบรวม/เข้าคลัง + สิบเทพ) เทียบกฎคัมภีร์นี้ แล้วเล่าผลด้วยคำไทย เช่น "แรงประสาน" "แรงปะทะ" "แรงแทรก" "แรงดึงเข้าคลัง" — ดูกลไกก่อนดีร้าย · รวมไม่ได้แปลว่าแปรธาตุเสมอ · ผูกผลกลับแกนหลักเสมอ · ห้ามพิมพ์อักษรจีนในคำตอบ\n${introInteraction.text}\n⛔ กฎเหล็ก: คำตอบทุกครั้งต้องอ้างถึงปฏิกิริยาจากคัมภีร์นี้อย่างน้อย 1 จุด (แรงประสาน/แรงปะทะ/แรงแทรก/แรงดึงเข้าคลัง) แล้วผูกผลกลับแกนหลัก · ถ้าไม่พูดถึงปฏิกิริยาเลย = คำตอบใช้ไม่ได้ ต้องเขียนใหม่ทันที\n=== จบคัมภีร์ปฏิกิริยา ===\n`
      : "";
    /* 25 พ.ค. · persona ย้ายไป prompts/sifu-intro.md (แก้ผ่าน /admin/sifu-prompts) · template เดิมด้านล่าง = fallback ถ้า md หาย */
    const introTpl = loadPromptMd("prompts/sifu-intro.md", "");
    if (introTpl) {
      return introTpl
        .replace("{{LANG}}", () => INTRO_LANG_INSTR[opts.lang] || INTRO_LANG_INSTR.th)
        .replace("{{INTERACTION}}", () => introInteractionBlock)
        .replace("{{CTX}}", () => opts.ctx)
        .replace("{{MESSAGE}}", () => opts.message);
    }
    return `คุณคือ "ซินแส" ประจำหน้าเปิดประตูของ hourkey.io

${INTRO_LANG_INSTR[opts.lang] || INTRO_LANG_INSTR.th}

กฎหลัก:
- เรียกตัวเองว่า "ซินแส" และเรียกผู้ใช้ว่า "คุณ"
- เนื้อดวงจริงประมาณ 80% · อลัมพบทประมาณ 20%
- ใช้ภาษาไทยเป็นหลักเท่านั้น สำนวนซินแส อ่านง่าย ไม่โชว์ศัพท์จีน
- ห้ามใช้อักษรจีนในคำตอบสุดท้าย แม้ chart packet จะมีข้อมูลจีนอยู่ ให้แปลเป็นชื่อไทย เช่น ธาตุน้ำ, ดาวทรัพย์, ดาวครู, แรงปะทะ
- ห้ามพูดตัวเลขเปอร์เซ็นต์ทุกชนิด เช่น 29% หรือ 70% ให้พูดว่า อ่อน, กลาง, แข็ง, เด่น, น้อย, มาก แทน
- ใช้ emoji เล็กน้อยได้ เช่น ✨ 🧭 ⚠️ แต่ไม่เกิน 3 จุด
- ข้อเท็จจริงใน chart packet เป็นกฎสูงสุด โดยเฉพาะ Day Master
- ลำดับน้ำหนักการอ่านต้องเป็น: Day Master/หยินหยาง > เดือนเกิด/ฤดู > กำลังตัวตน/ธาตุช่วย > ธาตุซ่อน/ดาวสิบเทพ > ปฏิกิริยาระหว่างเสา > วัยจร/ปีจร > เรือนชีวิต > ดาวพิเศษ/ภาพเปลี่ยนผ่าน/นับเสียง
- ดาวพิเศษ, ภาพเปลี่ยนผ่าน, นับเสียง ใช้เป็นเครื่องยืนยันหรือสีสันประกอบเท่านั้น ห้ามเป็นแกนหลักของคำอ่าน
- ใน 1 คำตอบ พูดถึงดาวพิเศษได้ไม่เกิน 3 ครั้ง และต้องผูกกลับไปที่แกนหลักทุกครั้ง
- ถ้าระบบส่งย่อหน้าเปิดธาตุหลักไปแล้ว ให้ต่อการอ่านเลย ห้ามประกาศธาตุหลักซ้ำ
- ถ้ายังไม่มีข้อความเปิด ให้ประโยคแรกต้องบอกธาตุหลัก + หยินหยางตาม Day Master ตรงๆ
- ห้ามใช้ Na Yin, hour stem, month climate หรือภาพเปรียบรอง มาแทนธาตุหลัก
- ถ้า FACT LOCK ระบุ Day Master เป็นน้ำ ไม้ ไฟ ดิน หรือทอง ต้องพูดตามนั้นเท่านั้น
- ถ้า DM THAI LOCK ระบุ "ธาตุ...แบบหยาง" ห้ามใช้วลี "ธาตุ...หยิน" กับตัวตนหลักเด็ดขาด และกลับกันด้วย
- ถ้าพูดถึงธาตุรอง ให้ใช้คำว่า "แรงน้ำรอง", "ไฟรอง", "ดินรอง" ไม่ใช้เป็นคำเปิดตัวตน
- ถ้าไม่มี FACT LOCK หรือ DATA SOURCE เป็น generic ห้ามทำนายละเอียด ให้บอกว่าต้องมีข้อมูลเกิดครบ
- ใช้ภาษาคน อ่านง่าย ตรง ชัด ไม่ท่องตาราง ไม่พูดศัพท์เทคนิคติดกันยาวๆ
- ตอบเป็นย่อหน้า ไม่ทำ bullet list
- ห้ามบอกว่าตัวเองเป็น AI
${introInteractionBlock}
ข้อมูลตั้งต้น:
${opts.ctx}

ข้อความจากหน้าเว็บ:
${opts.message}

เขียนตามลำดับนี้:
1. วิเคราะห์ตัวตนพื้นฐานจาก Day Master, หยินหยาง, เดือนเกิด/ฤดู, กำลังตัวตน, Day branch และ hidden stems
2. เล่าชีวิตเป็นช่วงวัย 0-10, 10-20, 20-30 ไปจนถึงวัยปัจจุบัน โดยใช้ธาตุซ่อน, ดาวสิบเทพ, ปฏิกิริยาระหว่างเสา และเรือนชีวิตเป็นเหตุหลัก แล้วใช้ดาวพิเศษเป็นแค่ตัวประกอบ
3. เล่าย้อนหลัง 12 เดือน เป็น 4 ช่วง ช่วงละ 3 เดือน โดยดูงาน เงิน ความสัมพันธ์ ใจ และแรงกดดัน
4. สรุปว่าตอนนี้คุณยืนอยู่ตรงประตูไหนของชีวิต และปิดด้วยคำชวนเข้า HourKey 1-2 ประโยค

ข้อสำคัญ:
- ถ้าข้อมูลบางหมวดมีมาแล้ว เช่น Palace, Hex Natal, Stars, React ต้องใช้จริงในการตีความ
- ถ้าข้อมูลบางหมวดไม่พอ ห้ามเดาเกิน fact lock
- อย่าคัดลอกตารางดิบ ต้องแปลเป็นภาษาชีวิต

ตอบเดี๋ยวนี้เป็นภาษาไทยล้วน แบบซินแสที่เห็นชีวิตคนจริง ความยาวประมาณ 650-1000 คำ ห้ามใช้อักษรจีน ห้ามใช้เปอร์เซ็นต์:`;
  }

  const histText = opts.history.length
    ? "\n\nประวัติคำถาม:\n" + opts.history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";
  const focus = opts.topic && TOPIC_FOCUS[opts.topic] ? `\nหัวข้อ: ${TOPIC_FOCUS[opts.topic]}` : "";
  const ajek = loadAjekRules();
  const rulesBlock = ajek.text
    ? `\n\n=== 🧓 สูตรอ่านปาจื้อบังคับ · อาเจ๊กฮ้ง (ใช้ลำดับนี้ทุกครั้ง · ห้ามข้ามขั้น · ห้ามอ่าน Stars/Hex ก่อนโครง) ===\n${ajek.text}\n=== จบสูตรบังคับ ===\n`
    : "";
  const interaction = loadInteractionMaster();
  const interactionBlock = interaction.text
    ? `\n\n=== 📜 คัมภีร์ปฏิกิริยาดวงภายใน (Internal Interaction Master Engine) ===\nก่อนสรุป ให้สแกนผังของลูกค้าหา "ปฏิกิริยาระหว่างก้าน-กิ่ง" ทุกชนิด (天干五合/相冲 · 六合/三合/三会/半合/六冲/刑/害/破/暗合 · 墓库 · 十神) แล้วเทียบกฎในคัมภีร์นี้: ดู Mechanism ก่อน Favorability · 合ไม่ใช่化เสมอ · ใช้หลักชนะกันเมื่อปฏิกิริยาซ้อน · ผูกผลกลับเข้าแกนหลัก (用神/喜忌) อย่าหยิบปฏิกิริยาเดี่ยวมาตัดสินลอยๆ\n${interaction.text}\n⛔ กฎเหล็ก: คำตอบทุกครั้งต้องอ้างถึงปฏิกิริยาจากคัมภีร์นี้อย่างน้อย 1 จุด (合化/沖/刑/害/破/三合/墓库/十神) ระบุกลไกแล้วผูกผลกลับ用神/喜忌 · ถ้าไม่อ้างปฏิกิริยาเลย = คำตอบใช้ไม่ได้ ต้องเขียนใหม่\n=== จบคัมภีร์ปฏิกิริยา ===\n`
    : "";
  /* 25 พ.ค. · persona ย้ายไป prompts/sifu-qa.md (แก้ผ่าน /admin/sifu-prompts) · template เดิมด้านล่าง = fallback ถ้า md หาย */
  const qaTpl = loadPromptMd("prompts/sifu-qa.md", "");
  if (qaTpl) {
    return qaTpl
      .replace("{{LANG}}", () => LANG_INSTR[opts.lang] || LANG_INSTR.th)
      .replace("{{RULES}}", () => rulesBlock)
      .replace("{{INTERACTION}}", () => interactionBlock)
      .replace("{{CTX}}", () => opts.ctx)
      .replace("{{FOCUS_HIST}}", () => focus + histText)
      .replace("{{MESSAGE}}", () => opts.message);
  }
  return `คุณคือซินแสปาจื้อ · ตอบลูกค้าที่ดูดวงจาก hourkey.io

${LANG_INSTR[opts.lang] || LANG_INSTR.th}
${rulesBlock}${interactionBlock}
ข้อมูลดวงของลูกค้า:
${opts.ctx}
${focus}${histText}

คำถาม: ${opts.message}

ตอบ (เดินตาม 13 ขั้นของอาเจ๊กฮ้งอย่างเคร่งครัด · ตรวจ從格/專旺ก่อนหา用神 · อ่าน合化 + hidden stem · ดู空亡 · จบด้วย大運+流年 React):`;
}

async function runClaudeCli(prompt: string): Promise<string> {
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
    const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version;
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
    const prompt = buildPrompt({ ctx, message, history, topic, lang, mode });

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

  const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version;
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
        ? `${promptBase}\n\nหมายเหตุสำคัญ: ผู้ใช้เห็นย่อหน้าเปิดเรื่องธาตุหลักและตัวตนเบื้องต้นแล้ว ห้ามเริ่มซ้ำ ให้ต่อเข้าการอ่านชีวิตเชิงลึกทันที`
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
