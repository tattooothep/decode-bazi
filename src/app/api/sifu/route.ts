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
import { StringDecoder } from "string_decoder";
import { q1, q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";
import { computeSiLingDays } from "@/lib/chart-table";
import { validateIdentity, stripIdLine, extractExpectedDM } from "@/lib/identity-lock";

type Msg = { role: "user" | "assistant"; content: string };
type IntroBirthInput = {
  name?: string;
  date: string;
  time: string;
  lng: number;
  gender: "M" | "F";
  birthTimeKnown?: boolean;
  dayBoundary?: "23:00" | "00:00";
  dayBoundarySource?: "explicit" | "default";
  source: "profile" | "params";
};

const TIMEOUT_MS = 600_000; // 600s · ยัดตำราคลาสสิก 4 ไฟล์เต็ม (~141KB prompt · first token ~546s) · nginx /api/sifu ต้อง >600s · ช้าค่อยตัด
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SIFU_HEARTBEAT_MS = Number(process.env.SIFU_SSE_HEARTBEAT_MS || 7_000);
const SIFU_FIRST_PING_MS = Number(process.env.SIFU_SSE_FIRST_PING_MS || 3_000);
const SIFU_CONTEXT_CACHE_MS = Number(process.env.SIFU_CONTEXT_CACHE_MS || 5 * 60_000);
const SIFU_CONTEXT_CACHE_MAX = Number(process.env.SIFU_CONTEXT_CACHE_MAX || 80);
const SIFU_TIMING_LOG = process.env.SIFU_TIMING_LOG !== "0";

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
/* 通根 (root strength) จาก wrapper-7 · sifu เดิมใช้แค่ wrapper-6 (หยาบ) · ดึง 5 เกรด + ราก/contest เข้า packet
   (ฐานตัดสิน 從格/用神 · เรียกที่ route ไม่แตะ bazi-calc/extensions LOCKED · ส่ง arg เข้า packet) */
async function computeRootedness(pillars: { year: { stem: string; branch: string }; month: { stem: string; branch: string }; day: { stem: string; branch: string }; hour: { stem: string; branch: string } | null }): Promise<ReturnType<typeof buildStructuredChartPacket>["rootedness"]> {
  try {
    const w7 = await import("../../../../data/library/wrappers/7-yongshen-v2.js") as unknown as {
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
    console.warn("[sifu] rootedness (wrapper-7) failed:", (e as Error).message);
    return null;
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

/* 27 พ.ค. · คัมภีร์เจาะลึก 5 เล่ม ที่ AI ซินแสขอเพิ่ม (十神 บทบาท · 格局 子平真詮 · 合婚 ดวงคู่ · 納音60 · 神煞)
 * โหลดเสริมพร้อมตำราเดิม · กลไกเดียวกับ loadEngineKnowledge เป๊ะ (folder loop + cache 60s + version hash)
 * ไม่แตะ 3 loader เดิม (ajek/interaction/engine) · เติมของใหม่ ห้ามกระทบเดิม */
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
      console.warn("[sifu] extra knowledge missing:", file, (e as Error).message);
    }
  }
  const text = parts.join("\n");
  const version = text ? hash.digest("hex").slice(0, 12) : "none";
  _sifuExtraCache = { text, ts: now, version };
  return _sifuExtraCache;
}

/* 💾 DB result cache · TTL 24h */
const CACHE_TTL_HOURS = 24;
function cacheKey(opts: {
  profileId?: string;
  contextHash?: string;
  orgId?: string | null;
  topic?: string;
  mode?: string;
  lang: string;
  message: string;
  dayPillar?: string;
  ruleVersion: string;
}): string {
  const parts = [
    "v7-multiprofile", // 26 พ.ค. · multi-profile + org guard · bump = invalidate คำตอบเก่า (เดิม v6-packet)
    opts.ruleVersion,
    opts.orgId || "noorg",
    opts.profileId || "anon",
    opts.contextHash || "noctx",
    opts.topic || "free",
    opts.mode || "default",
    opts.lang,
    opts.dayPillar || "nopil",
    opts.message,
  ].join("|");
  return createHash("sha256").update(parts).digest("hex");
}

function contextHash(ctx: string): string {
  return createHash("sha1").update(ctx).digest("hex").slice(0, 16);
}

type SifuContextCacheStatus = "hit" | "miss" | "skip";
type SifuContextResult = { ctx: string; cache: SifuContextCacheStatus; fingerprint?: string };
type SifuTimingBase = {
  route: "POST" | "GET";
  mode?: string;
  stream?: boolean;
  profileId?: string;
  contextCache?: SifuContextCacheStatus;
  ctxMs?: number;
  promptMs?: number;
  promptChars?: number;
};
const globalForSifu = globalThis as unknown as {
  _sifuContextCache?: Map<string, { ctx: string; ts: number }>;
};
const sifuContextCache = globalForSifu._sifuContextCache ?? new Map<string, { ctx: string; ts: number }>();
if (process.env.NODE_ENV !== "production") globalForSifu._sifuContextCache = sifuContextCache;

function pruneSifuContextCache() {
  if (sifuContextCache.size <= SIFU_CONTEXT_CACHE_MAX) return;
  const victims = Array.from(sifuContextCache.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .slice(0, Math.max(1, sifuContextCache.size - SIFU_CONTEXT_CACHE_MAX));
  for (const [key] of victims) sifuContextCache.delete(key);
}

function sifuTimingLog(stage: string, data: SifuTimingBase & Record<string, unknown>) {
  if (!SIFU_TIMING_LOG) return;
  const safeProfile = data.profileId ? String(data.profileId).slice(0, 8) : "anon";
  console.log(
    `[sifu timing] ${stage} route=${data.route} mode=${data.mode || "default"} stream=${data.stream ? "1" : "0"} profile=${safeProfile}` +
    ` ctx=${data.ctxMs ?? "-"}ms ctxCache=${data.contextCache || "-"} prompt=${data.promptMs ?? "-"}ms chars=${data.promptChars ?? "-"} total=${data.totalMs ?? "-"}ms first=${data.firstMs ?? "-"}ms cached=${data.cached ? "1" : "0"}`
  );
}

function promptSafe(raw: unknown, fallback = "—"): string {
  const s = String(raw ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!s) return fallback;
  return s
    .replace(/FACT LOCK:/gi, "FACT_LOCK:")
    .replace(/Day Master/gi, "DayMaster")
    .replace(/⟦ID⟧/g, "ID");
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
async function buildBaziContext(profileId: string, orgId: string | null, userId?: string | null): Promise<string> {
  if (!orgId) return "(ไม่พบ profile)"; // ไม่มี session/org = อ่านดวงใครไม่ได้ (กันข้ามบัญชี)
  try {
    const row = await q1<{
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
    }>(
      `SELECT id, name, nickname, relationship_type,
              (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known, day_boundary
       FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
      [profileId, orgId]
    );
    if (!row) return "(ไม่พบ profile)";
    const owner = row.is_self ? row : await q1<{
      id: string;
      name?: string;
      nickname?: string | null;
    }>(
      `SELECT id, name, nickname
       FROM profiles
       WHERE org_id=$1 AND is_archived=false
         AND created_by_user_id=$2
         AND (relationship_type IS NULL OR btrim(relationship_type) = '')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId, userId || ""]
    );
    const ownerName = promptSafe(owner ? (owner.nickname || owner.name) : "", "ไม่พบ self profile");
    const subjectName = promptSafe(row.nickname || row.name, "—");
    const subjectRole = promptSafe(row.is_self ? "ตัวเอง/เจ้าของบัญชี" : row.relationship_type, "คนในเครือข่าย");

    const dt = row.birth_datetime;
    const [date, timeRaw] = dt.split("T");
    const time = (timeRaw || "12:00").slice(0, 5);  // ตัดวินาทีออก (DB ให้ HH:MM:SS) · กัน new Date(`...T13:15:00:00`) เสีย → อายุ/วัยจร = NaN
    const lng = Number(row.birth_lng || 100.5018);
    const gender = (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M") as "M" | "F"; // DB เก็บ "F"/"M" (ไม่ใช่ "female") · รับทั้ง F/female/f → กันผู้หญิงกลายเป็นชาย
    const birthTimeKnown = knownBirthTime(row.birth_time_known);
    const dayBoundary: "23:00" | "00:00" = row.day_boundary === "00:00" ? "00:00" : "23:00";
    const dayBoundarySource: "explicit" | "default" = row.day_boundary === "00:00" || row.day_boundary === "23:00" ? "explicit" : "default";

    const calc = birthTimeKnown
      ? await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, dayBoundary, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    const g = loadPromptKV("prompts/sifu-ctx-guards.md"); // คำสั่ง/ล็อก แก้ผ่าน admin
    const is3p = calc.mode === "3p";
    /* 27 พ.ค. · 3 เสาไหลเข้า packet เต็ม (ได้ปฏิกิริยา/ดาว/通根/透干/空亡 ของ 年月日 ลึกเท่า 4 เสา)
     * กันเดายาม: ไม่เรียก computeStartAge (time ปลอม → 起運ปลอม) ใช้ 10 · packet ตัด 起運/เสายาม/命宮/身宮/小運 เองตาม mode 3p */
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
      `IDENTITY CONTEXT: ผู้ถาม/เจ้าของบัญชี = ${ownerName} (profileId=${owner?.id || "unknown"}) · ดวงที่กำลังดู/ตอบ = ${subjectName} (${subjectRole}, profileId=${row.id}) · ถ้าคำถามใช้คำว่า "คุณ/ผม/เรา" ให้หมายถึงผู้ถาม; ถ้ากำลังดูดวงคนอื่นให้เรียกชื่อ/บทบาทคนที่เลือก ห้ามสลับ Day Master หรือชื่อระหว่าง profile`,
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
      `納音: 年${ny.year?.zh||"-"} · 月${ny.month?.zh||"-"} · 日${ny.day?.zh||"-"} · 時${ny.hour?.zh||"-"}`,
    ];
    // TODO Step1.1: dedupe 用神/格局 ที่ซ้ำกับ renderChartPrompt
    const rootedness = await computeRootedness(calc.pillars);
    const [slY, slMo, slD] = date.split("-").map(Number);
    const [slH, slMi] = time.split(":").map(Number);
    const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);  // 司令 วันนับจาก節 (ICT→BJT)
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, gender, siLingDays, {
      dayBoundary,
      dayBoundarySource,
    });
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet, { subjectLabel: `${subjectName}·${row.id.slice(0, 8)}` }));
    if (ext.special_chart.applicable) {
      lines.push(`ดวงพิเศษ: ${ext.special_chart.type_zh} · friendly=${ext.special_chart.friendly_elements.join("·")}`);
    }
    if (is3p) lines.push(g.LIMIT_3P_QA); // กันเหนียว: ห้ามอ่านลูก/บั้นปลาย/命宮ที่พึ่งยาม
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu] buildBaziContext failed:", e);
    return "(ไม่สามารถคำนวณดวงได้)";
  }
}

async function getBaziContextFingerprint(profileId: string, orgId: string, userId?: string | null): Promise<string | null> {
  try {
    const row = await q1<{ fingerprint: string }>(
      `SELECT concat_ws('|',
              p.id,
              COALESCE(EXTRACT(EPOCH FROM p.updated_at)::text, ''),
              COALESCE(p.name, ''),
              COALESCE(p.nickname, ''),
              COALESCE(p.relationship_type, ''),
              COALESCE(to_char(p.birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS'), ''),
              COALESCE(p.birth_lng::text, ''),
              COALESCE(p.gender, ''),
              COALESCE(p.birth_time_known::text, ''),
              COALESCE(p.day_boundary, ''),
              COALESCE(o.id, ''),
              COALESCE(EXTRACT(EPOCH FROM o.updated_at)::text, ''),
              COALESCE(o.name, ''),
              COALESCE(o.nickname, '')
            ) AS fingerprint
       FROM profiles p
       LEFT JOIN LATERAL (
         SELECT id, name, nickname, updated_at
         FROM profiles
         WHERE org_id=$2 AND is_archived=false
           AND created_by_user_id=$3
           AND (relationship_type IS NULL OR btrim(relationship_type) = '')
         ORDER BY created_at DESC
         LIMIT 1
       ) o ON true
       WHERE p.id=$1 AND p.org_id=$2 AND p.is_archived=false`,
      [profileId, orgId, userId || ""]
    );
    return row?.fingerprint || null;
  } catch (e) {
    console.warn("[sifu ctx cache] fingerprint err:", (e as Error).message);
    return null;
  }
}

async function buildBaziContextCached(profileId: string, orgId: string | null, userId?: string | null): Promise<SifuContextResult> {
  if (!orgId) return { ctx: await buildBaziContext(profileId, orgId, userId), cache: "skip" };
  const fp = await getBaziContextFingerprint(profileId, orgId, userId);
  if (!fp) return { ctx: await buildBaziContext(profileId, orgId, userId), cache: "skip" };

  const key = createHash("sha1").update(`bazi-ctx-v1|${orgId}|${profileId}|${userId || ""}|${fp}`).digest("hex");
  const now = Date.now();
  const hit = sifuContextCache.get(key);
  if (hit && now - hit.ts < SIFU_CONTEXT_CACHE_MS) {
    hit.ts = now;
    return { ctx: hit.ctx, cache: "hit", fingerprint: fp };
  }

  const ctx = await buildBaziContext(profileId, orgId, userId);
  if (!ctx.startsWith("(ไม่")) {
    sifuContextCache.set(key, { ctx, ts: now });
    pruneSifuContextCache();
  }
  return { ctx, cache: "miss", fingerprint: fp };
}

function parseIntroBirthParams(url: URL): IntroBirthInput | null {
  const date = (url.searchParams.get("birthDate") || "").trim();
  const birthTimeKnown = knownBirthTime(url.searchParams.get("birthTimeKnown"));
  const time = birthTimeKnown ? (url.searchParams.get("birthTime") || "12:00").trim().slice(0, 5) : "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (birthTimeKnown && !/^\d{2}:\d{2}$/.test(time))) return null;
  const lng = Number(url.searchParams.get("birthLng") || 100.5018);
  const genderRaw = (url.searchParams.get("gender") || "M").toLowerCase();
  const dayBoundaryRaw = url.searchParams.get("dayBoundary") || url.searchParams.get("db") || "";
  const dayBoundary = dayBoundaryRaw === "00:00" ? "00:00" : "23:00";
  const dayBoundarySource = dayBoundaryRaw === "00:00" || dayBoundaryRaw === "23:00" ? "explicit" : "default";
  return {
    name: url.searchParams.get("name") || undefined,
    date,
    time,
    lng: Number.isFinite(lng) ? lng : 100.5018,
    gender: genderRaw === "female" || genderRaw === "f" ? "F" : "M",
    birthTimeKnown,
    dayBoundary,
    dayBoundarySource,
    source: "params",
  };
}

async function buildIntroBaziContext(profileId: string, orgId: string | null): Promise<string> {
  if (!orgId) return "(ไม่พบ profile)"; // ไม่มี session/org = อ่านดวงใครไม่ได้ (กันข้ามบัญชี)
  try {
    const row = await q1<{
      name?: string;
      birth_datetime: string;
      birth_lng: number | null;
      gender: string | null;
      birth_time_known: boolean | null;
      day_boundary: string | null;
    }>(
      `SELECT name, to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known, day_boundary FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
      [profileId, orgId]
    );
    if (!row) return "(ไม่พบ profile)";
    const [date, timeRaw] = row.birth_datetime.split("T");
    return buildIntroBaziContextFromBirth({
      name: row.name,
      date,
      time: (timeRaw || "12:00").slice(0, 5),
      lng: Number(row.birth_lng || 100.5018),
      gender: (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M") as "M" | "F", // DB เก็บ "F"/"M" · รับทั้ง F/female/f → กันผู้หญิงกลายเป็นชาย
      birthTimeKnown: knownBirthTime(row.birth_time_known),
      dayBoundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
      dayBoundarySource: row.day_boundary === "00:00" || row.day_boundary === "23:00" ? "explicit" : "default",
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
    const dayBoundary = input.dayBoundary === "00:00" ? "00:00" : "23:00";
    const calc = birthTimeKnown
      ? await calcBazi({ date: input.date, time: input.time, longitude: input.lng, gmtOffsetHours: 7, gender: input.gender, dayBoundary, birthTimeKnown: true })
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
    const rootedness = await computeRootedness(calc.pillars);
    const [slY, slMo, slD] = String(input.date).split("-").map(Number);
    const [slH, slMi] = String(input.time || "12:00").split(":").map(Number);
    const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);  // 司令
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, input.gender, siLingDays, {
      dayBoundary,
      dayBoundarySource: input.dayBoundarySource || "default",
    });
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet, { subjectLabel: input.name ? `${input.name}` : undefined }));
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
    const introExtra = loadSifuExtraKnowledge();
    const introExtraBlock = introExtra.text
      ? "\n" + loadPromptMd("prompts/sifu-extra-header.md").trim().replace("{{EXTRA}}", () => introExtra.text) + "\n"
      : "";
    const introLang = loadPromptSections("prompts/sifu-intro-lang.md");
    return loadPromptMd("prompts/sifu-intro.md")
      .replace("{{LANG}}", () => introLang[langKey] || introLang.TH || "")
      .replace("{{INTERACTION}}", () => introInteractionBlock + introEngineBlock + introExtraBlock)
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
  const extraKnow = loadSifuExtraKnowledge();
  const extraBlock = extraKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-extra-header.md").trim().replace("{{EXTRA}}", () => extraKnow.text) + "\n"
    : "";
  const qaLang = loadPromptSections("prompts/sifu-lang.md");
  return loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock + extraBlock)
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
  const reqT0 = Date.now();
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

    /* 🔐 session → org · ดวงที่ถามได้ต้องอยู่ใน org เดียวกับผู้ login (ดวงตัวเอง+ญาติในบัญชี) · กันอ่านข้ามบัญชี */
    const session = await getSession();
    const orgId = session?.orgId ?? null;

    const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version + "-" + loadSifuExtraKnowledge().version + "-idlock1-dayboundary1";
    const dayKey = await getDayPillarKey();
    const ctxT0 = Date.now();
    let contextCache: SifuContextCacheStatus = "skip";
    let ctx: string;
    if (mode === "intro") {
      ctx = profileId ? await buildIntroBaziContext(profileId, orgId) : "(intro mode แต่ไม่มี profileId)";
    } else if (profileId) {
      const ctxResult = await buildBaziContextCached(profileId, orgId, session?.userId);
      ctx = ctxResult.ctx;
      contextCache = ctxResult.cache;
    } else {
      ctx = "(ไม่มี profileId · ตอบทั่วไป)";
    }
    const ctxMs = Date.now() - ctxT0;
    /* 💾 Cache หลัง build context เท่านั้น: profile/dayBoundary/packet เปลี่ยน = ctx hash เปลี่ยน = ไม่คืนคำตอบดวงเก่า */
    const key = cacheKey({ profileId, contextHash: contextHash(ctx), orgId, topic, mode, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
    const useCache = mode !== "intro";
    const cached = useCache ? await getCachedReply(key) : null;
    if (cached) {
      sifuTimingLog("reply-cache-hit", {
        route: "POST", mode, stream: false, profileId, contextCache, ctxMs,
        promptMs: 0, promptChars: 0, totalMs: Date.now() - reqT0, cached: true,
      });
      return NextResponse.json({ ...cached, cached: true, key: key.slice(0, 8) });
    }
    /* ⚠️ ส่ง history จริงเข้า prompt (ไม่ใช่ history:[] แบบ GET) · คำตอบต้องจำบทสนทนา */
    const promptT0 = Date.now();
    const prompt = buildPrompt({ ctx, message, history, topic, lang, mode });
    const promptMs = Date.now() - promptT0;

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
          let firstMs: number | null = null;
          let firstDeltaSeen = false;
          let stopHeartbeat: (() => void) | null = null;
          const t0 = Date.now();
          /* identity-lock: buffer บรรทัดแรก (⟦ID⟧日干=X⟧) เทียบ 日干 · ผิด/ไม่มี=ตัด stream (ไม่ retry · master ให้ถามใหม่) */
          const expectedDM = extractExpectedDM(ctx);
          let idBuf = "", idChecked = false, idRejected = false;
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

          send("meta", { cached: false, key: key.slice(0, 8), startedAt: t0, timing: { ctxMs, promptMs, promptChars: prompt.length, contextCache } });
          stopHeartbeat = startSifuHeartbeat(send, (pingCount) => {
            if (!firstDeltaSeen) return rotatingWaitingPhase(pingCount);
            if (expectedDM && !idChecked) return "identity_lock";
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
              firstMs = Date.now() - t0;
              firstChunkSent = true;
              send("first", { ms: firstMs, model: "claude-max-cli" });
            }
          };
          const rejectId = (reason: string) => {
            idRejected = true;
            clearTimeout(killTimer);
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "identity_mismatch", reason });
            safeClose();
          };
          const parser = makeJsonlParser((text) => {
            firstDeltaSeen = true;
            if (idRejected) return;
            if (expectedDM && !idChecked) {
              idBuf += text;
              const nl = idBuf.indexOf("\n");
              if (nl === -1) {
                if (idBuf.length > 120) rejectId("no_id_line"); // AI ไม่ขึ้น ID line ในบรรทัดแรก
                return; // ยังไม่ครบบรรทัด · ห้ามปล่อย chunk (buffer ต่อ · ไม่ block)
              }
              idChecked = true;
              const chk = validateIdentity(idBuf.slice(0, nl) + "\n", expectedDM);
              if (!chk.ok) { rejectId(chk.reason); return; }
              const rest = idBuf.slice(nl + 1); // strip บรรทัด ID · ปล่อยเฉพาะเนื้อ
              if (rest) { full += rest; sendFirstOnce(); send("chunk", { text: rest }); }
              return;
            }
            full += text;
            sendFirstOnce();
            send("chunk", { text });
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            console.warn("[sifu sse stderr]", chunk.toString().slice(0, 200));
          });
          child.on("close", (code) => {
            activeChild = null;
            clearTimeout(killTimer);
            if (idRejected) { safeClose(); return; } // ตัดไปแล้วจาก identity-lock
            const ms = Date.now() - t0;
            if (expectedDM && !idChecked) { // AI ตอบจบแต่ไม่เคยขึ้น ID line (ตอบสั้น/ไม่มี newline) → ตัด
              console.error(`[sifu] identity no_id_line on close (expect=${expectedDM})`);
              send("error", { error: "identity_mismatch", reason: "no_id_line" });
              safeClose(); return;
            }
            if (code === 0 && full.trim()) {
              const payload = { reply: full.trim(), model: "claude-max-cli" }; // full = strip ID แล้ว (idBuf ไม่เข้า full)
              if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
              send("done", { ms, model: payload.model, cached: false, chars: full.length });
              sifuTimingLog("stream-done", {
                route: "POST", mode, stream: true, profileId, contextCache, ctxMs,
                promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
              });
            } else {
              send("error", { error: `claude exit ${code}`, ms });
              sifuTimingLog("stream-error", {
                route: "POST", mode, stream: true, profileId, contextCache, ctxMs,
                promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
                code,
              });
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
    /* identity-lock: เทียบ 日干 ที่ AI echo กับ engine · ไม่ตรง=retry 1 ครั้ง → error (กันอ่านผิดคนละดวง) */
    const expectedDM = extractExpectedDM(ctx);
    let reply = await runClaudeCli(prompt);
    let idCheck = validateIdentity(reply, expectedDM);
    if (!idCheck.ok) {
      console.warn(`[sifu] identity ${idCheck.reason} (expect=${expectedDM} got=${idCheck.parsedDM}) · retry`);
      reply = await runClaudeCli(prompt);
      idCheck = validateIdentity(reply, expectedDM);
      if (!idCheck.ok) {
        console.error(`[sifu] identity FAIL after retry (expect=${expectedDM} got=${idCheck.parsedDM})`);
        return NextResponse.json({ error: "identity_mismatch" }, { status: 502 });
      }
    }
    const cleanReply = stripIdLine(reply);
    const ms = Date.now() - t0;
    const payload = { reply: cleanReply, model: "claude-max-cli" };
    if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {}); // cache เฉพาะที่ผ่าน id-check แล้ว (ถึงบรรทัดนี้=ผ่าน)
    sifuTimingLog("json-done", {
      route: "POST", mode, stream: false, profileId, contextCache, ctxMs,
      promptMs, promptChars: prompt.length, totalMs: Date.now() - reqT0, cached: false,
    });
    return NextResponse.json({ ...payload, cached: false, ms, key: key.slice(0, 8) });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[sifu] error:", err);
    return NextResponse.json({ error: err.message || "internal" }, { status: 500 });
  }
}

/* 🌊 SSE Streaming endpoint · GET /api/sifu?stream=1&profileId=&topic=&lang=&message= */
export async function GET(req: Request) {
  const reqT0 = Date.now();
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

  /* 🔐 session → org · เหมือน POST · กันอ่านดวงข้ามบัญชี */
  const session = await getSession();
  const orgId = session?.orgId ?? null;

  const ajekVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version + "-" + loadSifuExtraKnowledge().version + "-idlock1-dayboundary1";
  const dayKey = await getDayPillarKey();
  const ctxT0 = Date.now();
  let contextCache: SifuContextCacheStatus = "skip";
  let ctx = mode === "intro"
    ? "(intro mode แต่ไม่มี profileId)"
    : "(ไม่มี profileId)";
  try {
    if (mode === "intro") {
      const birthParams = parseIntroBirthParams(url);
      if (profileId) {
        ctx = await buildIntroBaziContext(profileId, orgId);
        if (ctx.startsWith("(ไม่") && birthParams) ctx = await buildIntroBaziContextFromBirth(birthParams);
      } else {
        ctx = birthParams ? await buildIntroBaziContextFromBirth(birthParams) : ctx;
      }
    } else {
      if (profileId) {
        const ctxResult = await buildBaziContextCached(profileId, orgId, session?.userId);
        ctx = ctxResult.ctx;
        contextCache = ctxResult.cache;
      }
    }
  } catch (e) {
    console.warn("[sifu sse] ctx err:", (e as Error).message);
  }
  const ctxMs = Date.now() - ctxT0;
  const key = cacheKey({ profileId, contextHash: contextHash(ctx), orgId, topic, mode, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
  const useCache = mode !== "intro";
  const cached = useCache ? await getCachedReply(key) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let stopHeartbeat: (() => void) | null = null;
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

      // 1. Cache hit → ส่งทั้งก้อนทันที
      if (cached) {
        send("meta", { cached: true, key: key.slice(0, 8), timing: { ctxMs, promptMs: 0, promptChars: 0, contextCache } });
        send("chunk", { text: cached.reply });
        send("done", { ms: 0, model: cached.model, cached: true });
        sifuTimingLog("stream-cache-hit", {
          route: "GET", mode, stream: true, profileId, contextCache, ctxMs,
          promptMs: 0, promptChars: 0, totalMs: Date.now() - reqT0, cached: true,
        });
        safeClose();
        return;
      }

      // 2. Cache miss → spawn Claude + pipe stdout chunk-by-chunk
      const warmup = mode === "intro" ? buildIntroWarmup(ctx) : null;
      const promptT0 = Date.now();
      const promptBase = buildPrompt({ ctx, message, history: [], topic, lang, mode });
      const prompt = warmup
        ? `${promptBase}\n\n${loadPromptMd("prompts/sifu-intro-resume-note.md").trim()}`
        : promptBase;
      const promptMs = Date.now() - promptT0;
      send("meta", { cached: false, key: key.slice(0, 8), startedAt: Date.now(), timing: { ctxMs, promptMs, promptChars: prompt.length, contextCache } });

      const t0 = Date.now();
      if (mode === "intro") {
        let firstChunkSent = !!warmup;
        stopHeartbeat = startSifuHeartbeat(send, (pingCount) => firstChunkSent ? "streaming" : rotatingWaitingPhase(pingCount));
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
            sifuTimingLog("intro-done", {
              route: "GET", mode, stream: true, profileId, contextCache, ctxMs,
              promptMs, promptChars: prompt.length, totalMs: Date.now() - reqT0, cached: false,
            });
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
      let firstMs: number | null = null;
      let firstDeltaSeen = false;
      /* identity-lock (GET Q&A) · warmup/intro = engine สรุป → skip */
      const expectedDM = warmup ? null : extractExpectedDM(ctx);
      let idBuf = "", idChecked = false, idRejected = false;
      stopHeartbeat = startSifuHeartbeat(send, (pingCount) => {
        if (!firstDeltaSeen) return rotatingWaitingPhase(pingCount);
        if (expectedDM && !idChecked) return "identity_lock";
        if (!firstChunkSent) return "waiting_visible_chunk";
        return "streaming";
      });

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

      const rejectIdG = (reason: string) => {
        idRejected = true;
        clearTimeout(killTimer);
        try { c.kill("SIGKILL"); } catch {}
        send("error", { error: "identity_mismatch", reason });
        safeClose();
      };
      const parser = makeJsonlParser((text: string) => {
        firstDeltaSeen = true;
        if (idRejected) return;
        if (expectedDM && !idChecked) {
          idBuf += text;
          const nl = idBuf.indexOf("\n");
          if (nl === -1) { if (idBuf.length > 120) rejectIdG("no_id_line"); return; }
          idChecked = true;
          const chk = validateIdentity(idBuf.slice(0, nl) + "\n", expectedDM);
          if (!chk.ok) { rejectIdG(chk.reason); return; }
          const rest = idBuf.slice(nl + 1);
          if (rest) { full += rest; send("chunk", { text: rest }); if (!firstChunkSent) { firstMs = Date.now() - t0; send("first", { ms: firstMs }); firstChunkSent = true; } }
          return;
        }
        send("chunk", { text });
        full += text;
        if (!firstChunkSent) {
          firstMs = Date.now() - t0;
          send("first", { ms: firstMs });
          firstChunkSent = true;
        }
      });
      c.stdout.on("data", parser);
      c.stderr.on("data", (chunk: Buffer) => {
        console.warn("[sifu sse stderr]", chunk.toString().slice(0, 200));
      });
      c.on("close", (code) => {
        clearTimeout(killTimer);
        if (idRejected) { safeClose(); return; }
        const ms = Date.now() - t0;
        if (expectedDM && !idChecked) { send("error", { error: "identity_mismatch", reason: "no_id_line" }); safeClose(); return; }
        if (code === 0 && full.trim()) {
          const payload = { reply: full.trim(), model: "claude-max-cli" };
          if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
          send("done", { ms, model: payload.model, cached: false, chars: full.length });
          sifuTimingLog("stream-done", {
            route: "GET", mode, stream: true, profileId, contextCache, ctxMs,
            promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
          });
        } else {
          send("error", { error: `claude exit ${code}` });
          sifuTimingLog("stream-error", {
            route: "GET", mode, stream: true, profileId, contextCache, ctxMs,
            promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
            code,
          });
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
