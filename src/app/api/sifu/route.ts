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
import { getSession, type Session } from "@/lib/auth";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";
import { boundaryWarning3p, monthPillarBoundary } from "@/lib/bazi-boundary";
import { computeSiLingDays } from "@/lib/chart-table";
import { validateIdentity, stripIdLine, extractExpectedDM } from "@/lib/identity-lock";
import { checkSifuEvidenceTrace } from "@/lib/sifu-evidence-trace";
import { SIFU_CODEX_QTBJ_RETRIEVAL_VERSION, loadQtbjTiaohouCompactKnowledge } from "@/lib/sifu-qtbj-compact";
import { logResearchAiMessageSafe } from "@/lib/research-log";
import { buildSifuShadowModePlan } from "@/lib/sifu-shadow-mode";
import { logSifuSourceAuditSafe } from "@/lib/sifu-source-audit-log";

type Msg = { role: "user" | "assistant"; content: string };
type SifuModel = "claude-max-cli" | "codex-cli";
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanSifuThreadId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[^\w:.-]+/g, "_").slice(0, 80);
  return s || null;
}
function cleanProfileId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}
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
const CODEX_CLI_MODEL = (process.env.SIFU_CODEX_MODEL || "").trim();
const CODEX_COMPACT_KNOWLEDGE = [
  "Codex compact mode: ใช้ข้อมูลดวง/packet/interactions ที่ส่งมาเป็น source of truth สูงสุด",
  "ห้ามแต่งปฏิกิริยา ก้าน/กิ่ง ธาตุซ่อน 用神/忌神 หรือวัยจรที่ packet ไม่ได้ให้",
  "ถ้ามี block 窮通寶鑑 ให้ใช้เฉพาะชั้น 調候/月令 เพื่ออธิบายความร้อน-เย็น-แห้ง-ชื้น ห้าม override 用神/喜忌/格局 ที่ packet ล็อคมา",
  "ไทยนำ จีนรอง อธิบายผลจริงตรงคำถาม และรักษา ID line ตามกฎ prompt หลัก",
].join("\n");
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
const QTBJ_TIAOHOU_FILE = "qtbj-tiaohou-clean.md";
const QTBJ_TIAOHOU_THAI_NOTES_FILE = "qtbj-tiaohou-thai-notes.md";
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
  { file: QTBJ_TIAOHOU_FILE, label: "📜 窮通寶鑑 · 調候用神/月令 ตัวบทจริง canonical (admin library id 13 · 10干×12เดือน · ใช้เติมชั้นร้อนเย็นแห้งชื้น ห้าม override packet)" },
  { file: QTBJ_TIAOHOU_THAI_NOTES_FILE, label: "📘 窮通寶鑑 · Thai teaching notes จาก memo id 13 (ชั้นอธิบาย 調候/月令 เป็นไทย · ใช้เสริม canonical ห้าม override packet)" },
  { file: "smtg-clean.md", label: "📜 三命通會 (萬民英 · 明 1578 · 神煞+納音+論女命 verbatim)" },
  { file: "yhzp-clean.md", label: "📜 淵海子平 (徐升 · 宋 1271 · 子平 ต้นน้ำ · 五干通變圖+喜忌篇 verbatim)" },
  { file: "sftk-clean.md", label: "📜 神峰通考 (張楠 · 明 · 命理正宗 · 病藥論+動靜說+蓋頭說+男女合婚說 verbatim · ต้นทาง BY-08)" },
  { file: "bazi-zixi-mangpai.md", label: "📜 論妻子 · ดูคู่+ดูบุตร (子平真詮 verbatim แกน · นับลูก長生沐浴之歌 + เพศ庚男辛女/陽男陰女 · มุม盲派暗藏เสริมไม่ทับ)" },
  { file: "yhzp-juan3-koujue.md", label: "📜 口訣淵海子平卷三 · บทพยากรณ์ verbatim+แปลไทย (寸金搜髓論+傷官說+心鏡歌+妖祥賦+綜釋賦+玄機賦 · 113口訣 · แกน格局成敗·官殺印財·傷官用神 + 調候/六親宮位/相克致病 · ไม่ซ้ำเล่มอื่น)" },
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

function buildSifuRuleVersion(model: SifuModel): string {
  const baseVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version + "-" + loadSifuExtraKnowledge().version + "-idlock1-dayboundary1";
  return model === "codex-cli" ? baseVersion + "-" + SIFU_CODEX_QTBJ_RETRIEVAL_VERSION : baseVersion;
}
/* 💾 DB result cache · TTL 24h */
const CACHE_TTL_HOURS = 24;
function resolveSifuModel(raw: unknown): SifuModel {
  const s = String(raw || "").trim().toLowerCase();
  return s === "codex" || s === "codex-cli" ? "codex-cli" : "claude-max-cli";
}
function cacheKey(opts: {
  profileId?: string;
  contextHash?: string;
  orgId?: string | null;
  topic?: string;
  mode?: string;
  model?: SifuModel;
  lang: string;
  message: string;
  dayPillar?: string;
  ruleVersion: string;
}): string {
  const parts = [
    "v8-pillarlock", // 31 พ.ค. · PILLAR LOCK เต็มผัง + กฎคัดกิ่งตรงๆ · bump = invalidate คำตอบเก่า (เดิม v7-multiprofile)
    opts.ruleVersion,
    opts.orgId || "noorg",
    opts.profileId || "anon",
    opts.contextHash || "noctx",
    opts.topic || "free",
    opts.mode || "default",
    ...(opts.model === "codex-cli" ? ["codex-cli"] : []),
    opts.lang,
    opts.dayPillar || "nopil",
    opts.message,
  ].join("|");
  return createHash("sha256").update(parts).digest("hex");
}

function contextHash(ctx: string): string {
  return createHash("sha1").update(ctx).digest("hex").slice(0, 16);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function firstContextLine(ctx: string, prefix: string): string | null {
  return ctx.split("\n").find((line) => line.startsWith(prefix)) || null;
}

function packetContextExcerpt(ctx: string): string[] {
  const lines = ctx
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^===\s*20\s*คัมภีร์/i.test(line));
  return lines.slice(0, 120).map((line) => line.slice(0, 500));
}

function extractPillarsFromLock(line: string | null): {
  year: string | null;
  month: string | null;
  day: string | null;
  hour: string | null;
  raw: string | null;
} {
  if (!line) return { year: null, month: null, day: null, hour: null, raw: null };
  const m = line.match(/年(\S+)\s+月(\S+)\s+日(\S+)\s+時(\S+)/);
  return {
    year: m?.[1] || null,
    month: m?.[2] || null,
    day: m?.[3] || null,
    hour: m?.[4] || null,
    raw: line,
  };
}

function classifyPredictionPhase(message: string, history: Msg[]): string {
  const text = [message, ...history.slice(-4).map((m) => m.content)].join("\n").toLowerCase();
  if (/(เฉลย|จริงๆ|จริง ๆ|เกิดขึ้นจริง|รถล้ม|แขนหัก|ยาย.*เสีย|ตั้งครรภ์|ใส่ตัวอ่อน|icsi|feedback|actual)/i.test(text)) {
    return "post_feedback";
  }
  if (history.length && /(ขยายความ|อธิบาย|หมายถึง|แปลว่า|ทำไม|เพราะอะไร|แล้วถ้า|ถ้างั้น|ต่อจาก|ข้อไหน|จุดไหน|แก้ยังไง|clarif)/i.test(message)) {
    return "clarification";
  }
  if (/(ปีไหน|เดือนไหน|ช่วงไหน|อดีต|อนาคต|ทำนาย|ดูปี|ดูเดือน|อุบัติเหตุ|งาน|เงิน|สุขภาพ|คู่|ความรัก|ลูก|ตั้งครรภ์|icsi)/i.test(message)) {
    return "before_prediction";
  }
  return "general";
}

function extractPredictionDateWindow(message: string): Record<string, unknown> | null {
  const years = Array.from(new Set((message.match(/(?:25[0-9]{2}|20[0-9]{2}|19[0-9]{2})/g) || []).map((x) => Number(x))));
  const months = Array.from(new Set((message.match(/(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/gi) || []).map((x) => x.trim())));
  if (years.length || months.length) return { years, months, raw: message.slice(0, 240) };
  if (/(ปีหน้า|next year)/i.test(message)) return { relative: "next_year", raw: message.slice(0, 240) };
  if (/(ปีนี้|this year)/i.test(message)) return { relative: "this_year", raw: message.slice(0, 240) };
  if (/(เดือนไหน|ช่วงไหน|เมื่อไหร่|ตอนไหน|date window|window)/i.test(message)) return { relative: "unspecified_requested", raw: message.slice(0, 240) };
  return null;
}

function predictionEventType(message: string): string {
  if (/(อุบัติเหตุ|รถ|ล้ม|ผ่าตัด|เจ็บ|ป่วย)/i.test(message)) return "accident_health";
  if (/(งาน|การงาน|เปลี่ยนงาน|อาชีพ)/i.test(message)) return "career";
  if (/(เงิน|รวย|ทรัพย์|รายได้|ลงทุน|เทรด)/i.test(message)) return "wealth";
  if (/(คู่|แฟน|สามี|ภรรยา|ความรัก|แต่ง)/i.test(message)) return "relationship";
  if (/(ลูก|ตั้งครรภ์|ท้อง|icsi|ตัวอ่อน)/i.test(message)) return "fertility_family";
  if (/(ยาย|ตา|ย่า|ปู่|พ่อ|แม่|เสีย|สูญเสีย|ครอบครัว)/i.test(message)) return "family";
  if (/(ปี|เดือน|ช่วง|อดีต|อนาคต)/i.test(message)) return "timing";
  return "general";
}

function predictionEvidenceRuleIds(eventType: string, packetHash: string | null): string[] {
  const ids = ["profile_packet_bound", "fact_lock", "pillar_lock", `intent_${eventType}`];
  if (packetHash) ids.push("packet_hash_present");
  return ids;
}

function predictionIntentConfidence(message: string, eventType: string, dateWindow: Record<string, unknown> | null): number {
  let score = eventType === "general" ? 0.45 : 0.62;
  if (dateWindow) score += 0.1;
  if (/(ปีไหน|เดือนไหน|ช่วงไหน|ทำนาย|ดูปี|ดูเดือน)/i.test(message)) score += 0.08;
  if (/(เฉลย|เกิดขึ้นจริง|feedback|actual)/i.test(message)) score -= 0.2;
  return Math.max(0.1, Math.min(0.9, Number(score.toFixed(2))));
}

function sifuKnowledgeHashes(model: SifuModel): Record<string, string | boolean | null> {
  return {
    ajek: loadAjekRules().version,
    interaction: loadInteractionMaster().version,
    engine: loadEngineKnowledge().version,
    extra: loadSifuExtraKnowledge().version,
    qtbj: model === "codex-cli" ? SIFU_CODEX_QTBJ_RETRIEVAL_VERSION : null,
    compact_knowledge: model === "codex-cli",
  };
}

function buildSifuAuditEvidence(input: {
  profileId: string | null;
  threadId: string | null;
  threadProfileId: string | null;
  ctx: string;
  message: string;
  prompt?: string | null;
  promptVersion: string;
  model: SifuModel;
  historyProfileIds: string[];
  historyDroppedCount: number;
  predictionPhase: string;
  identityCheckResult: string;
}) {
  const factLock = firstContextLine(input.ctx, "FACT LOCK:");
  const pillarLock = firstContextLine(input.ctx, "PILLAR LOCK");
  const identityContext = firstContextLine(input.ctx, "IDENTITY CONTEXT:");
  const nameLine = firstContextLine(input.ctx, "ชื่อ:");
  const birthLine = firstContextLine(input.ctx, "เกิด:");
  const boundaryLine = firstContextLine(input.ctx, "ขอบวัน/Day boundary");
  const yongshenLine = firstContextLine(input.ctx, "用神:");
  const gejuLine = firstContextLine(input.ctx, "格局:");
  const packetExcerpt = packetContextExcerpt(input.ctx);
  const pillars = extractPillarsFromLock(pillarLock);
  const expectedDm = extractExpectedDM(input.ctx);
  const packetEvidenceText = [
    identityContext,
    nameLine,
    birthLine,
    boundaryLine,
    factLock,
    pillarLock,
    yongshenLine,
    gejuLine,
    packetExcerpt.join("\n"),
  ].filter(Boolean).join("\n");
  const packetHash = packetEvidenceText ? hashText(packetEvidenceText) : null;
  const ctxHash = contextHash(input.ctx);
  const promptHash = input.prompt ? hashText(input.prompt) : null;
  const hasProfile = !!input.profileId;
  const hasLocks = !!factLock && !!pillarLock && !!expectedDm;
  const eventType = predictionEventType(input.message);
  const dateWindow = extractPredictionDateWindow(input.message);
  const predictionRows = input.predictionPhase === "before_prediction"
    ? [{
        event_type: eventType,
        date_window: dateWindow,
        confidence: predictionIntentConfidence(input.message, eventType, dateWindow),
        evidence_rule_ids: predictionEvidenceRuleIds(eventType, packetHash),
        packet_hash: packetHash,
        profile_id: input.profileId,
        source: "question_intent",
      }]
    : [];

  return {
    profileSnapshot: {
      profile_id: input.profileId,
      identity_context: identityContext,
      name_line: nameLine,
      birth_line: birthLine,
      day_boundary_line: boundaryLine,
    },
    pillarsSnapshot: {
      day_master: expectedDm,
      year: pillars.year,
      month: pillars.month,
      day: pillars.day,
      hour: pillars.hour,
      yongshen_line: yongshenLine,
      geju_line: gejuLine,
      raw: pillars.raw,
    },
    packetHash,
    packetSnapshotSafe: {
      identity_context: identityContext,
      fact_lock: factLock,
      pillar_lock: pillarLock,
      yongshen_line: yongshenLine,
      geju_line: gejuLine,
      packet_context_excerpt: packetExcerpt,
      context_hash: ctxHash,
    },
    contextHash: ctxHash,
    promptHash,
    promptVersion: input.promptVersion,
    knowledgeHashes: sifuKnowledgeHashes(input.model),
    factLock,
    pillarLock,
    threadId: input.threadId,
    threadProfileId: input.threadProfileId,
    historyProfileIds: input.historyProfileIds,
    identityCheckResult: input.identityCheckResult,
    predictionPhase: input.predictionPhase,
    predictionRows,
    historyDroppedCount: input.historyDroppedCount,
    profileBindingStatus: hasProfile && hasLocks ? "bound" : hasProfile ? "profile_without_locks" : "missing_profile",
    auditQuality: hasProfile && hasLocks && packetHash ? "packet_evidence" : "insufficient",
  };
}

type SifuSourceShadowAuditInput = {
  session: Session | null;
  req: Request;
  route: "api/sifu";
  mode?: string;
  topic?: string;
  lang: string;
  model: SifuModel;
  cached: boolean;
  profileId: string | null;
  ctx: string;
  message: string;
  history: Msg[];
  prompt: string | null;
};

function shadowAuditMode(mode?: string): "single" | "intro" {
  return mode === "intro" ? "intro" : "single";
}

function buildSifuShadowAuditHashes(ctx: string, prompt: string | null): {
  promptHash: string | null;
  contextHash: string;
  packetHash: string | null;
} {
  const factLock = firstContextLine(ctx, "FACT LOCK:");
  const pillarLock = firstContextLine(ctx, "PILLAR LOCK");
  const packetEvidenceText = [
    firstContextLine(ctx, "IDENTITY CONTEXT:"),
    firstContextLine(ctx, "ชื่อ:"),
    firstContextLine(ctx, "เกิด:"),
    firstContextLine(ctx, "ขอบวัน/Day boundary"),
    factLock,
    pillarLock,
    firstContextLine(ctx, "用神:"),
    firstContextLine(ctx, "格局:"),
    packetContextExcerpt(ctx).join("\n"),
  ].filter(Boolean).join("\n");
  return {
    promptHash: prompt ? hashText(prompt) : null,
    contextHash: contextHash(ctx),
    packetHash: packetEvidenceText ? hashText(packetEvidenceText) : null,
  };
}

/* SIFU_SOURCE_SHADOW_AUDIT_START
 * Phase 6B/8 · sidecar source audit only. Strict opt-in + canary scoped; default off.
 * Never mutate prompt/cache/response/SSE and never call a model from here. */
function sifuShadowAuditEnvSet(name: string): Set<string> {
  return new Set(String(process.env[name] || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean));
}

function isSifuSourceShadowAuditCanaryAllowed(input: SifuSourceShadowAuditInput): boolean {
  if (process.env.SIFU_SOURCE_SHADOW_AUDIT_ALLOW_ALL === "1") return true;
  const profileIds = sifuShadowAuditEnvSet("SIFU_SOURCE_SHADOW_AUDIT_PROFILE_IDS");
  const userIds = sifuShadowAuditEnvSet("SIFU_SOURCE_SHADOW_AUDIT_USER_IDS");
  const profileId = String(input.profileId || "").trim();
  const userId = String(input.session?.userId || "").trim();
  return (!!profileId && profileIds.has(profileId)) || (!!userId && userIds.has(userId));
}

function scheduleSifuSourceShadowAudit(input: SifuSourceShadowAuditInput): void {
  if (process.env.SIFU_SOURCE_SHADOW_AUDIT !== "1") return;
  if (input.mode === "intro") return;
  if (!isSifuSourceShadowAuditCanaryAllowed(input)) return;

  const timer = setTimeout(() => {
    try {
      const hashes = buildSifuShadowAuditHashes(input.ctx, input.prompt);
      const plan = buildSifuShadowModePlan({
        model: input.model,
        route: input.route,
        mode: shadowAuditMode(input.mode),
        topic: input.topic || null,
        lang: input.lang,
        question: input.message,
        history: input.history.map((h) => `${h.role}: ${h.content}`),
        packetText: input.ctx,
        profileId: input.profileId,
        promptHash: hashes.promptHash,
        contextHash: hashes.contextHash,
        packetHash: hashes.packetHash,
        cached: input.cached,
      });
      logSifuSourceAuditSafe({ session: input.session, req: input.req, record: plan.candidate.sourceAudit });
    } catch (e) {
      console.warn("[sifu-source-shadow-audit] skipped:", e instanceof Error ? e.message : e);
    }
  }, 0);
  (timer as unknown as { unref?: () => void }).unref?.();
}
/* SIFU_SOURCE_SHADOW_AUDIT_END */

function hasPacketEvidence(ctx: string): boolean {
  return !!firstContextLine(ctx, "FACT LOCK:") && !!firstContextLine(ctx, "PILLAR LOCK") && !!extractExpectedDM(ctx);
}

const PACKET_CLAIM_RE = /(packet\s*ระบุ|แพ็กเก็ต\s*ระบุ|แพคเก็ต\s*ระบุ|ตรงดวง|ล็อกดวงนี้)/gi;

function packetEvidenceGuardText(ctx: string): string {
  return hasPacketEvidence(ctx)
    ? "\nPACKET EVIDENCE: PRESENT · อ้าง packet/ดวงได้เฉพาะจาก FACT LOCK, PILLAR LOCK และ structured packet ใน context นี้เท่านั้น\n"
    : "\nPACKET EVIDENCE: MISSING · ห้ามใช้คำว่า \"packet ระบุ\", \"ตรงดวง\", \"ล็อกดวงนี้\" หรืออ้างว่าอ่าน packet/ดวงเฉพาะบุคคล\n";
}

function sanitizePacketEvidenceClaims(reply: string, ctx: string): string {
  if (hasPacketEvidence(ctx)) return reply;
  return reply.replace(PACKET_CLAIM_RE, "ข้อมูลที่มี");
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
      `PILLAR LOCK (ก้าน/กิ่งทุกเสา · เวลาอ้างเสาใดให้คัดจากบรรทัดนี้ตรงๆ ห้ามประกอบ/เดาเอง): 年${calc.pillarsZh.year} 月${calc.pillarsZh.month} 日${calc.pillarsZh.day} 時${is3p ? "—" : calc.pillarsZh.hour}`,
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
      monthBoundary: is3p ? monthPillarBoundary(date) : null, // 月柱ก้ำกึ่ง節氣 → ไหล conf ลง field เดือน (เฉพาะ 3 เสา)
    });
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet, { subjectLabel: `${subjectName}·${row.id.slice(0, 8)}` }));
    if (ext.special_chart.applicable) {
      lines.push(`ดวงพิเศษ: ${ext.special_chart.type_zh} · friendly=${ext.special_chart.friendly_elements.join("·")}`);
    }
    if (is3p) {
      lines.push(g.LIMIT_3P_QA); // กันเหนียว: ห้ามอ่านลูก/บั้นปลาย/命宮ที่พึ่งยาม
      const bw = boundaryWarning3p(date); // เกิดวันคาบ節氣 + ไม่รู้เวลา → เตือนเสาเดือน/ปีก้ำกึ่ง (additive)
      if (bw) lines.push(bw);
    }
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu] buildBaziContext failed:", e);
    return "(ไม่สามารถคำนวณดวงได้)";
  }
}

async function getBaziContextFingerprint(profileId: string, orgId: string, userId?: string | null): Promise<string | null> {
  const safeProfileId = UUID_RE.test(String(profileId || "")) ? profileId : null;
  const safeOrgId = UUID_RE.test(String(orgId || "")) ? orgId : null;
  const safeUserId = UUID_RE.test(String(userId || "")) ? userId : "00000000-0000-4000-8000-000000000000";
  if (!safeProfileId || !safeOrgId) return null;
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
              COALESCE(o.id::text, ''),
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
       WHERE p.id=$1 AND p.org_id=$2 AND COALESCE(p.is_archived, false)=false`,
      [safeProfileId, safeOrgId, safeUserId]
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
        `PILLAR LOCK (ก้าน/กิ่งทุกเสา · เวลาอ้างเสาใดให้คัดจากบรรทัดนี้ตรงๆ ห้ามประกอบ/เดาเอง): 年${calc.pillars.year.stem}${calc.pillars.year.branch} 月${calc.pillars.month.stem}${calc.pillars.month.branch} 日${calc.pillars.day.stem}${calc.pillars.day.branch} 時—`,
        dmThaiLock,
        `3 เสาแบบอ่านไทย: ปี=${STEM_TH[calc.pillars.year.stem]}/${BRANCH_TH_NAME[calc.pillars.year.branch]} · เดือน=${STEM_TH[calc.pillars.month.stem]}/${BRANCH_TH_NAME[calc.pillars.month.branch]} · วัน=${STEM_TH[calc.pillars.day.stem]}/${BRANCH_TH_NAME[calc.pillars.day.branch]} · ยาม=ไม่ทราบเวลาเกิด`,
        `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
        `โครงดวง: ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วย ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
        g.LIMIT_3P_INTRO,
        boundaryWarning3p(input.date), // "" ถ้าไม่ก้ำกึ่ง → filter ทิ้ง
      ].filter(Boolean).join("\n");
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
      `PILLAR LOCK (ก้าน/กิ่งทุกเสา · เวลาอ้างเสาใดให้คัดจากบรรทัดนี้ตรงๆ ห้ามประกอบ/เดาเอง): 年${calc.pillars.year.stem}${calc.pillars.year.branch} 月${calc.pillars.month.stem}${calc.pillars.month.branch} 日${calc.pillars.day.stem}${calc.pillars.day.branch} 時${calc.pillars.hour.stem}${calc.pillars.hour.branch}`,
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
  compactKnowledge?: boolean;
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
  const compact = opts.compactKnowledge === true;
  const ajek = compact ? { text: "", version: "codex-compact" } : loadAjekRules();
  const rulesBlock = compact
    ? "\n\n" + CODEX_COMPACT_KNOWLEDGE + "\n"
    : ajek.text
      ? "\n\n" + loadPromptMd("prompts/sifu-rules-header.md").trim().replace("{{RULES}}", () => ajek.text) + "\n"
      : "";
  const interaction = compact ? { text: "", version: "codex-compact" } : loadInteractionMaster();
  const interactionBlock = compact
    ? "\n\nปฏิกิริยา: ใช้เฉพาะรายการ interaction ที่ packet ส่งมา เช่น ปฏิกิริยาในดวง วัยจร×ดวงเกิด และปีจร×เสาวัน · ห้ามสร้างคู่ใหม่เอง\n"
    : interaction.text
      ? "\n\n" + loadPromptMd("prompts/sifu-interaction-header.md").trim().replace("{{INTERACTION}}", () => interaction.text) + "\n"
      : "";
  const engineKnow = compact ? { text: "", version: "codex-compact" } : loadEngineKnowledge();
  const engineBlock = engineKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-engine-header.md").trim().replace("{{ENGINE}}", () => engineKnow.text) + "\n"
    : "";
  const extraKnow = compact ? { text: "", version: "codex-compact" } : loadSifuExtraKnowledge();
  const extraBlock = extraKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-extra-header.md").trim().replace("{{EXTRA}}", () => extraKnow.text) + "\n"
    : "";
  const qtbjCompact = compact ? loadQtbjTiaohouCompactKnowledge(`${opts.message}\n${histText}\n${opts.ctx}`) : { text: "", version: "full-extra" };
  const qtbjCompactBlock = qtbjCompact.text
    ? "\n\n=== 📜 窮通寶鑑 · 調候用神 compact source ===\n" + qtbjCompact.text + "\n=== จบ 窮通寶鑑 compact source ===\n"
    : "";
  const qaLang = loadPromptSections("prompts/sifu-lang.md");
  return loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock + extraBlock + qtbjCompactBlock)
    .replace("{{CTX}}", () => packetEvidenceGuardText(opts.ctx) + opts.ctx)
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

/* 2 มิ.ย. · in-flight semaphore แบบ "เข้าคิว" (ไม่บล็อก/ไม่เด้ง error ทันที · กันหลายคนยิง spawn Claude พร้อมกันจน fork เดียวล่ม)
 * cap ระดับ process · เกิน → รอคิวจน slot ว่าง · คิวเต็มจริง (MAX_QUEUE) → false ให้ caller เด้ง safety
 * ⚠️ horizontal scale: counter นี้ per-process · ขึ้นหลาย instance ต้องย้ายไป Redis (ดู memory) */
const SIFU_MAX_INFLIGHT = Number(process.env.SIFU_MAX_INFLIGHT || 6);
const SIFU_MAX_QUEUE = Number(process.env.SIFU_MAX_QUEUE || 60);
let _sifuInflight = 0;
const _sifuWaiters: Array<() => void> = [];
function acquireSifuSlot(): Promise<boolean> {
  if (_sifuInflight < SIFU_MAX_INFLIGHT) { _sifuInflight++; return Promise.resolve(true); }
  if (_sifuWaiters.length >= SIFU_MAX_QUEUE) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    _sifuWaiters.push(() => { _sifuInflight++; resolve(true); });
  });
}
function releaseSifuSlot() {
  _sifuInflight = Math.max(0, _sifuInflight - 1);
  const next = _sifuWaiters.shift();
  if (next) next();
}

function codexCliArgs(): string[] {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "-C", "/tmp",
  ];
  if (CODEX_CLI_MODEL) args.push("-m", CODEX_CLI_MODEL);
  args.push("-");
  return args;
}

function codexErrorMessage(err: string): string {
  if (/401 Unauthorized|Missing bearer|authentication/i.test(err)) {
    return "codex_cli_auth_required · Codex CLI ยังไม่ได้ login สำหรับ user jarvis";
  }
  return err.slice(0, 300) || "codex cli failed";
}

function cliErrorMessage(model: SifuModel, err: string): string {
  if (model === "codex-cli") return codexErrorMessage(err);
  return err.slice(0, 300) || "claude cli failed";
}

async function runClaudeCli(prompt: string): Promise<string> {
  dumpPromptIfDebug(prompt, "cli");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  try {
  return await new Promise<string>((resolve, reject) => {
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
  } finally {
    releaseSifuSlot();
  }
}

async function runCodexCli(prompt: string): Promise<string> {
  dumpPromptIfDebug(prompt, "codex");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  try {
  return await new Promise<string>((resolve, reject) => {
    const spawnArgs = ["-u", CHILD_USER, "-H", "codex", ...codexCliArgs()];
    const c = spawn("sudo", spawnArgs, {
      cwd: "/tmp",
      env: process.env,
    });
    let rawOut = "";
    let finalText = "";
    let err = "";
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
    c.stdout.on("data", chunk => {
      const text = chunk.toString();
      rawOut += text;
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.type === "item.completed" && obj.item?.type === "agent_message" && typeof obj.item.text === "string") {
            finalText = obj.item.text;
          } else if (obj.type === "turn.failed" && obj.error?.message) {
            err += "\n" + obj.error.message;
          } else if (obj.type === "error" && obj.message) {
            err += "\n" + obj.message;
          }
        } catch {}
      }
    });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      clearTimeout(timer);
      const out = finalText || rawOut;
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`codex exit ${code} · ${codexErrorMessage(err)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
  } finally {
    releaseSifuSlot();
  }
}

async function runSifuCli(prompt: string, model: SifuModel): Promise<string> {
  return model === "codex-cli" ? runCodexCli(prompt) : runClaudeCli(prompt);
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

function spawnCodexStreaming(prompt: string) {
  dumpPromptIfDebug(prompt, "codex-stream");
  const spawnArgs = ["-u", CHILD_USER, "-H", "codex", ...codexCliArgs()];
  const c = spawn("sudo", spawnArgs, { cwd: "/tmp", env: process.env });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

function spawnSifuStreaming(prompt: string, model: SifuModel) {
  return model === "codex-cli" ? spawnCodexStreaming(prompt) : spawnClaudeStreaming(prompt);
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

function makeCodexJsonlParser(onText: (text: string) => void, onError: (text: string) => void) {
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
        if (obj.type === "item.completed" && obj.item?.type === "agent_message" && typeof obj.item.text === "string") {
          onText(obj.item.text);
        } else if (obj.type === "turn.failed" && obj.error?.message) {
          onError(obj.error.message);
        } else if (obj.type === "error" && obj.message) {
          onError(obj.message);
        }
      } catch {
        onError(line);
      }
    }
  };
}

function makeSifuCliParser(
  model: SifuModel,
  onText: (text: string) => void,
  onError: (text: string) => void
) {
  return model === "codex-cli" ? makeCodexJsonlParser(onText, onError) : makeJsonlParser(onText);
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
    const rawHistory: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const profileId = cleanProfileId(body.profileId);
    const threadProfileId = cleanProfileId(body.threadProfileId || body.historyProfileId);
    const topic: string | undefined = body.topic;
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
    const mode: string | undefined = body.mode === "intro" ? "intro" : undefined;
    const sifuModel = resolveSifuModel(body.model);
    const threadId = cleanSifuThreadId(body.threadId);

    if (!message) {
      return NextResponse.json({ error: "no message" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "message too long" }, { status: 400 });
    }

    /* 🔐 session → org · ดวงที่ถามได้ต้องอยู่ใน org เดียวกับผู้ login (ดวงตัวเอง+ญาติในบัญชี) · กันอ่านข้ามบัญชี */
    const session = await getSession();
    /* 1 มิ.ย. · AI ดูดวงต้องสมัคร/login ก่อน (เจ้านายสั่ง · ตัด guest intro) */
    if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
    const orgId = session?.orgId ?? null;

    if (mode !== "intro" && !profileId) {
      return NextResponse.json({ error: "profile_required" }, { status: 400 });
    }
    if (body.profileId && !profileId) {
      return NextResponse.json({ error: "invalid_profileId" }, { status: 400 });
    }
    const historyProfileIds = Array.isArray(body.historyProfileIds)
      ? body.historyProfileIds.map(cleanProfileId).filter((x: string | null): x is string => !!x)
      : threadProfileId ? [threadProfileId] : [];
    const historyProfileMatch = rawHistory.length === 0
      || (!!threadProfileId && !!profileId && threadProfileId === profileId);
    const history = historyProfileMatch ? rawHistory : [];
    const historyDroppedCount = historyProfileMatch ? 0 : rawHistory.length;
    const predictionPhase = classifyPredictionPhase(message, history);

    const ajekVersion = buildSifuRuleVersion(sifuModel);
    const dayKey = await getDayPillarKey();
    const ctxT0 = Date.now();
    let contextCache: SifuContextCacheStatus = "skip";
    let ctx: string;
    if (mode === "intro") {
      ctx = profileId ? await buildIntroBaziContext(profileId, orgId) : "(intro mode แต่ไม่มี profileId)";
    } else {
      const ctxResult = await buildBaziContextCached(profileId as string, orgId, session?.userId);
      ctx = ctxResult.ctx;
      contextCache = ctxResult.cache;
    }
    const ctxMs = Date.now() - ctxT0;
    const expectedDMFromCtx = mode !== "intro" ? extractExpectedDM(ctx) : null;
    const factLockFromCtx = mode !== "intro" ? firstContextLine(ctx, "FACT LOCK:") : null;
    const pillarLockFromCtx = mode !== "intro" ? firstContextLine(ctx, "PILLAR LOCK") : null;
    if (mode !== "intro" && (ctx.startsWith("(ไม่") || !expectedDMFromCtx || !factLockFromCtx || !pillarLockFromCtx)) {
      return NextResponse.json({ error: "profile_context_unlocked" }, { status: ctx.startsWith("(ไม่") ? 404 : 500 });
    }
    /* 💾 Cache หลัง build context เท่านั้น: profile/dayBoundary/packet เปลี่ยน = ctx hash เปลี่ยน = ไม่คืนคำตอบดวงเก่า */
    const key = cacheKey({ profileId: profileId || undefined, contextHash: contextHash(ctx), orgId, topic, mode, model: sifuModel, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
    const useCache = mode !== "intro";
    const cached = useCache ? await getCachedReply(key) : null;
    if (cached) {
      const auditPromptT0 = Date.now();
      const auditPrompt = buildPrompt({ ctx, message, history, topic, lang, mode, compactKnowledge: sifuModel === "codex-cli" });
      const auditPromptMs = Date.now() - auditPromptT0;
      const audit = buildSifuAuditEvidence({
        profileId,
        threadId,
        threadProfileId,
        ctx,
        message,
        prompt: auditPrompt,
        promptVersion: ajekVersion,
        model: sifuModel,
        historyProfileIds,
        historyDroppedCount,
        predictionPhase,
        identityCheckResult: "cached",
      });
      scheduleSifuSourceShadowAudit({
        session,
        req,
        route: "api/sifu",
        mode,
        topic,
        lang,
        model: sifuModel,
        cached: true,
        profileId,
        ctx,
        message,
        history,
        prompt: auditPrompt,
      });
      logResearchAiMessageSafe({
        session,
        req,
        feature: "sifu_master",
        mode: mode || null,
        topic,
        lang,
        profileId: profileId || null,
        question: message,
        answer: cached.reply,
        history,
        requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
        responseMeta: { cache_key: key.slice(0, 8), context_cache: contextCache, thread_id: threadId, audit_quality: audit.auditQuality, packet_hash: audit.packetHash, prompt_hash: audit.promptHash },
        model: cached.model,
        durationMs: Date.now() - reqT0,
        cached: true,
        ...audit,
      });
      sifuTimingLog("reply-cache-hit", {
        route: "POST", mode, stream: false, profileId: profileId || undefined, contextCache, ctxMs,
        promptMs: auditPromptMs, promptChars: auditPrompt.length, totalMs: Date.now() - reqT0, cached: true,
      });
      return NextResponse.json({ ...cached, reply: sanitizePacketEvidenceClaims(cached.reply, ctx), cached: true, key: key.slice(0, 8) });
    }
    /* ⚠️ ส่ง history จริงเข้า prompt (ไม่ใช่ history:[] แบบ GET) · คำตอบต้องจำบทสนทนา */
    const promptT0 = Date.now();
    const prompt = buildPrompt({ ctx, message, history, topic, lang, mode, compactKnowledge: sifuModel === "codex-cli" });
    const promptMs = Date.now() - promptT0;
    const auditFor = (identityCheckResult: string) => buildSifuAuditEvidence({
      profileId,
      threadId,
      threadProfileId,
      ctx,
      message,
      prompt,
      promptVersion: ajekVersion,
      model: sifuModel,
      historyProfileIds,
      historyDroppedCount,
      predictionPhase,
      identityCheckResult,
    });
    /* 🌊 SSE streaming เมื่อ Accept: text/event-stream หรือ body.stream === true
     * (intro mode คง JSON เดิม · master ใช้ Q&A ปกติ mode=undefined) · ยก pattern จาก /api/network/sifu + GET handler */
    const wantsStream =
      mode !== "intro" &&
      ((req.headers.get("accept") || "").includes("text/event-stream") || body.stream === true);
    if (wantsStream) {
      const encoder = new TextEncoder();
      let activeChild: ReturnType<typeof spawnSifuStreaming> | null = null;
      const stream = new ReadableStream({
        async start(controller) {
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

          send("meta", { cached: false, key: key.slice(0, 8), model: sifuModel, startedAt: t0, timing: { ctxMs, promptMs, promptChars: prompt.length, contextCache } });
          stopHeartbeat = startSifuHeartbeat(send, (pingCount) => {
            if (!firstDeltaSeen) return rotatingWaitingPhase(pingCount);
            if (expectedDM && !idChecked) return "identity_lock";
            if (!firstChunkSent) return "waiting_visible_chunk";
            return "streaming";
          });
          /* 2 มิ.ย. · เข้าคิว slot ก่อน spawn · ถ้าเต็มเกิน MAX_QUEUE → เด้ง safety · heartbeat ข้างบนส่ง ping ระหว่างรอคิว user จึงไม่เห็นค้าง */
          const _slotOk = await acquireSifuSlot();
          if (!_slotOk) { send("error", { error: "ระบบกำลังประมวลผลคำถามจำนวนมาก · กรุณาลองใหม่ใน 1-2 นาที" }); safeClose(); return; }
          let _slotReleased = false;
          const releaseSlotOnce = () => { if (!_slotReleased) { _slotReleased = true; releaseSifuSlot(); } };
          const child = spawnSifuStreaming(prompt, sifuModel);
          activeChild = child;
          child.on("error", releaseSlotOnce);
          const killTimer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "timeout" });
            safeClose();
          }, TIMEOUT_MS);

          const sendFirstOnce = () => {
            if (!firstChunkSent) {
              firstMs = Date.now() - t0;
              firstChunkSent = true;
              send("first", { ms: firstMs, model: sifuModel });
            }
          };
          const rejectId = (reason: string) => {
            idRejected = true;
            clearTimeout(killTimer);
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "identity_mismatch", reason });
            safeClose();
          };
          let cliErr = "";
          const parser = makeSifuCliParser(sifuModel, (text) => {
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
              const rest = sanitizePacketEvidenceClaims(idBuf.slice(nl + 1), ctx); // strip บรรทัด ID · ปล่อยเฉพาะเนื้อ
              if (rest) { full += rest; sendFirstOnce(); send("chunk", { text: rest }); }
              return;
            }
            const visibleText = sanitizePacketEvidenceClaims(text, ctx);
            full += visibleText;
            sendFirstOnce();
            send("chunk", { text: visibleText });
          }, (text) => {
            cliErr += "\n" + text;
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            cliErr += text;
            console.warn("[sifu sse stderr]", text.slice(0, 200));
          });
          child.on("close", (code) => {
            releaseSlotOnce();
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
              const payload = { reply: full.trim(), model: sifuModel }; // full = strip ID แล้ว (idBuf ไม่เข้า full)
              /* HK_SIFU_EVIDENCE_TRACE_V1 — log-only (stream ส่งครบแล้ว · ไม่ retry/ไม่ตัด · try-catch กัน uncaught ใน ReadableStream) */
              let evTrace: ReturnType<typeof checkSifuEvidenceTrace> | null = null;
              try {
                evTrace = checkSifuEvidenceTrace(payload.reply, message, !!expectedDM);
                if (!evTrace.ok) console.warn(`[sifu] evidence-trace incomplete (stream) profile=${profileId || "-"} missing=${evTrace.missing.join(",")}`);
              } catch { /* log-only · ห้ามให้กระทบ stream ที่ส่งครบแล้ว */ }
              if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
              scheduleSifuSourceShadowAudit({
                session,
                req,
                route: "api/sifu",
                mode,
                topic,
                lang,
                model: sifuModel,
                cached: false,
                profileId,
                ctx,
                message,
                history,
                prompt,
              });
              logResearchAiMessageSafe({
                session,
                req,
                feature: "sifu_master",
                mode: mode || null,
                topic,
                lang,
                profileId: profileId || null,
                question: message,
                answer: payload.reply,
                history,
                requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
                responseMeta: { stream: true, cache_key: key.slice(0, 8), context_cache: contextCache, chars: full.length, thread_id: threadId, evidence_trace: evTrace },
                model: payload.model,
                durationMs: Date.now() - reqT0,
                cached: false,
                ...auditFor(expectedDM ? "pass" : "not_required"),
              });
              send("done", { ms, model: payload.model, cached: false, chars: full.length });
              sifuTimingLog("stream-done", {
                route: "POST", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
                promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
              });
            } else {
              send("error", { error: `${sifuModel} exit ${code} · ${cliErrorMessage(sifuModel, cliErr)}`, ms });
              sifuTimingLog("stream-error", {
                route: "POST", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
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
    let reply = await runSifuCli(prompt, sifuModel);
    let idCheck = validateIdentity(reply, expectedDM);
    if (!idCheck.ok) {
      console.warn(`[sifu] identity ${idCheck.reason} (expect=${expectedDM} got=${idCheck.parsedDM}) · retry`);
      reply = await runSifuCli(prompt, sifuModel);
      idCheck = validateIdentity(reply, expectedDM);
      if (!idCheck.ok) {
        console.error(`[sifu] identity FAIL after retry (expect=${expectedDM} got=${idCheck.parsedDM})`);
        return NextResponse.json({ error: "identity_mismatch" }, { status: 502 });
      }
    }
    /* HK_SIFU_EVIDENCE_TRACE_V1 — log-only · วัดว่าคำตอบดูดวงเดิน用神/ปฏิกิริยา/รากครบไหม (ไม่ retry/ไม่ block) */
    let evTrace: ReturnType<typeof checkSifuEvidenceTrace> | null = null;
    try {
      evTrace = checkSifuEvidenceTrace(reply, message, !!expectedDM);
      if (!evTrace.ok) console.warn(`[sifu] evidence-trace incomplete (json) profile=${profileId || "-"} missing=${evTrace.missing.join(",")}`);
    } catch { /* log-only · ห้ามให้กระทบคำตอบ */ }
    const cleanReply = sanitizePacketEvidenceClaims(stripIdLine(reply), ctx);
    const ms = Date.now() - t0;
    const payload = { reply: cleanReply, model: sifuModel };
    if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {}); // cache เฉพาะที่ผ่าน id-check แล้ว (ถึงบรรทัดนี้=ผ่าน)
    scheduleSifuSourceShadowAudit({
      session,
      req,
      route: "api/sifu",
      mode,
      topic,
      lang,
      model: sifuModel,
      cached: false,
      profileId,
      ctx,
      message,
      history,
      prompt,
    });
    logResearchAiMessageSafe({
      session,
      req,
      feature: "sifu_master",
      mode: mode || null,
      topic,
      lang,
      profileId: profileId || null,
      question: message,
      answer: payload.reply,
      history,
      requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
      responseMeta: { stream: false, cache_key: key.slice(0, 8), context_cache: contextCache, chars: payload.reply.length, thread_id: threadId, evidence_trace: evTrace },
      model: payload.model,
      durationMs: Date.now() - reqT0,
      cached: false,
      ...auditFor("pass"),
    });
    sifuTimingLog("json-done", {
      route: "POST", mode, stream: false, profileId: profileId || undefined, contextCache, ctxMs,
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
  const rawProfileId = url.searchParams.get("profileId");
  const profileId = cleanProfileId(rawProfileId);
  const topic = url.searchParams.get("topic") || undefined;
  const lang = (["th","en","zh"].includes(url.searchParams.get("lang") || "") ? url.searchParams.get("lang") : "th") as string;
  const mode = url.searchParams.get("mode") === "intro" ? "intro" : undefined;
  const sifuModel = resolveSifuModel(url.searchParams.get("model"));
  const threadId = cleanSifuThreadId(url.searchParams.get("threadId"));
  const threadProfileId = cleanProfileId(url.searchParams.get("threadProfileId") || url.searchParams.get("historyProfileId"));
  const historyProfileIds = (url.searchParams.get("historyProfileIds") || "")
    .split(",")
    .map((x) => cleanProfileId(x))
    .filter((x: string | null): x is string => !!x);

  if (!message) {
    return NextResponse.json({ error: "no message" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  /* 🔐 session → org · เหมือน POST · กันอ่านดวงข้ามบัญชี */
  const session = await getSession();
  /* 1 มิ.ย. · AI ดูดวงต้องสมัคร/login ก่อน (เจ้านายสั่ง · ตัด guest intro) */
  if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const orgId = session?.orgId ?? null;
  if (mode !== "intro" && !profileId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }
  if (rawProfileId && !profileId) {
    return NextResponse.json({ error: "invalid_profileId" }, { status: 400 });
  }

  const ajekVersion = buildSifuRuleVersion(sifuModel);
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
  if (mode !== "intro" && (ctx.startsWith("(ไม่") || !extractExpectedDM(ctx) || !firstContextLine(ctx, "FACT LOCK:") || !firstContextLine(ctx, "PILLAR LOCK"))) {
    return NextResponse.json({ error: "profile_context_unlocked" }, { status: ctx.startsWith("(ไม่") ? 404 : 500 });
  }
  const key = cacheKey({ profileId: profileId || undefined, contextHash: contextHash(ctx), orgId, topic, mode, model: sifuModel, lang, message, dayPillar: dayKey, ruleVersion: ajekVersion });
  const useCache = mode !== "intro";
  const cached = useCache ? await getCachedReply(key) : null;
  const predictionPhase = classifyPredictionPhase(message, []);

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
        const safeReply = sanitizePacketEvidenceClaims(cached.reply, ctx);
        const auditPromptT0 = Date.now();
        const auditPrompt = buildPrompt({ ctx, message, history: [], topic, lang, mode, compactKnowledge: sifuModel === "codex-cli" });
        const auditPromptMs = Date.now() - auditPromptT0;
        const audit = buildSifuAuditEvidence({
          profileId,
          threadId,
          threadProfileId,
          ctx,
          message,
          prompt: auditPrompt,
          promptVersion: ajekVersion,
          model: sifuModel,
          historyProfileIds,
          historyDroppedCount: 0,
          predictionPhase,
          identityCheckResult: "cached",
        });
        scheduleSifuSourceShadowAudit({
          session,
          req,
          route: "api/sifu",
          mode,
          topic,
          lang,
          model: sifuModel,
          cached: true,
          profileId,
          ctx,
          message,
          history: [],
          prompt: auditPrompt,
        });
        logResearchAiMessageSafe({
          session,
          req,
          feature: "sifu_master",
          mode: mode || null,
          topic,
          lang,
          profileId: profileId || null,
          question: message,
          answer: safeReply,
          history: [],
          requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, prediction_phase: predictionPhase },
          responseMeta: { stream: true, cache_key: key.slice(0, 8), context_cache: contextCache, thread_id: threadId, audit_quality: audit.auditQuality, packet_hash: audit.packetHash, prompt_hash: audit.promptHash },
          model: cached.model,
          durationMs: Date.now() - reqT0,
          cached: true,
          ...audit,
        });
        send("meta", { cached: true, key: key.slice(0, 8), timing: { ctxMs, promptMs: auditPromptMs, promptChars: auditPrompt.length, contextCache } });
        send("chunk", { text: safeReply });
        send("done", { ms: 0, model: cached.model, cached: true });
        sifuTimingLog("stream-cache-hit", {
          route: "GET", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
          promptMs: auditPromptMs, promptChars: auditPrompt.length, totalMs: Date.now() - reqT0, cached: true,
        });
        safeClose();
        return;
      }

      // 2. Cache miss → spawn Claude + pipe stdout chunk-by-chunk
      const warmup = mode === "intro" ? buildIntroWarmup(ctx) : null;
      const promptT0 = Date.now();
      const promptBase = buildPrompt({ ctx, message, history: [], topic, lang, mode, compactKnowledge: sifuModel === "codex-cli" });
      const prompt = warmup
        ? `${promptBase}\n\n${loadPromptMd("prompts/sifu-intro-resume-note.md").trim()}`
        : promptBase;
      const promptMs = Date.now() - promptT0;
      send("meta", { cached: false, key: key.slice(0, 8), model: sifuModel, startedAt: Date.now(), timing: { ctxMs, promptMs, promptChars: prompt.length, contextCache } });

      const t0 = Date.now();
      if (mode === "intro") {
        let firstChunkSent = !!warmup;
        stopHeartbeat = startSifuHeartbeat(send, (pingCount) => firstChunkSent ? "streaming" : rotatingWaitingPhase(pingCount));
        if (warmup) {
          send("first", { ms: 0, synthetic: true, provider: "engine" });
            send("chunk", { text: sanitizePacketEvidenceClaims(warmup, ctx) });
        }
        try {
          const result = await streamOpenRouter(prompt, (text) => {
            if (!firstChunkSent) {
              send("first", { ms: Date.now() - t0, provider: "openrouter" });
              firstChunkSent = true;
            }
            send("chunk", { text: sanitizePacketEvidenceClaims(text, ctx) });
          });
          if (result.full) {
            send("done", { ms: Date.now() - t0, model: result.model, provider: "openrouter", cached: false, chars: result.full.length });
            sifuTimingLog("intro-done", {
              route: "GET", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
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

      /* 2 มิ.ย. · เข้าคิว slot ก่อน spawn (เหมือน POST · heartbeat ส่ง ping ระหว่างรอ) */
      const _slotOkG = await acquireSifuSlot();
      if (!_slotOkG) { send("error", { error: "ระบบกำลังประมวลผลคำถามจำนวนมาก · กรุณาลองใหม่ใน 1-2 นาที" }); safeClose(); return; }
      let _slotReleasedG = false;
      const releaseSlotOnceG = () => { if (!_slotReleasedG) { _slotReleasedG = true; releaseSifuSlot(); } };
      const c = spawnSifuStreaming(prompt, sifuModel);
      c.on("error", releaseSlotOnceG);
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
        send("chunk", { text: sanitizePacketEvidenceClaims(warmup, ctx) });
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
      let cliErr = "";
      const parser = makeSifuCliParser(sifuModel, (text: string) => {
        firstDeltaSeen = true;
        if (idRejected) return;
        if (expectedDM && !idChecked) {
          idBuf += text;
          const nl = idBuf.indexOf("\n");
          if (nl === -1) { if (idBuf.length > 120) rejectIdG("no_id_line"); return; }
          idChecked = true;
          const chk = validateIdentity(idBuf.slice(0, nl) + "\n", expectedDM);
          if (!chk.ok) { rejectIdG(chk.reason); return; }
          const rest = sanitizePacketEvidenceClaims(idBuf.slice(nl + 1), ctx);
          if (rest) { full += rest; send("chunk", { text: rest }); if (!firstChunkSent) { firstMs = Date.now() - t0; send("first", { ms: firstMs }); firstChunkSent = true; } }
          return;
        }
        const visibleText = sanitizePacketEvidenceClaims(text, ctx);
        send("chunk", { text: visibleText });
        full += visibleText;
        if (!firstChunkSent) {
          firstMs = Date.now() - t0;
          send("first", { ms: firstMs });
          firstChunkSent = true;
        }
      }, (text: string) => {
        cliErr += "\n" + text;
      });
      c.stdout.on("data", parser);
      c.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        cliErr += text;
        console.warn("[sifu sse stderr]", text.slice(0, 200));
      });
      c.on("close", (code) => {
        releaseSlotOnceG();
        clearTimeout(killTimer);
        if (idRejected) { safeClose(); return; }
        const ms = Date.now() - t0;
        if (expectedDM && !idChecked) { send("error", { error: "identity_mismatch", reason: "no_id_line" }); safeClose(); return; }
        if (code === 0 && full.trim()) {
          const payload = { reply: full.trim(), model: sifuModel };
          if (useCache) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
          scheduleSifuSourceShadowAudit({
            session,
            req,
            route: "api/sifu",
            mode,
            topic,
            lang,
            model: sifuModel,
            cached: false,
            profileId,
            ctx,
            message,
            history: [],
            prompt,
          });
          logResearchAiMessageSafe({
            session,
            req,
            feature: "sifu_master",
            mode: mode || null,
            topic,
            lang,
            profileId: profileId || null,
            question: message,
            answer: payload.reply,
            history: [],
            requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, prediction_phase: predictionPhase },
            responseMeta: { stream: true, cache_key: key.slice(0, 8), context_cache: contextCache, chars: full.length, thread_id: threadId },
            model: payload.model,
            durationMs: Date.now() - reqT0,
            cached: false,
            ...buildSifuAuditEvidence({
              profileId,
              threadId,
              threadProfileId,
              ctx,
              message,
              prompt,
              promptVersion: ajekVersion,
              model: sifuModel,
              historyProfileIds,
              historyDroppedCount: 0,
              predictionPhase,
              identityCheckResult: expectedDM ? "pass" : "not_required",
            }),
          });
          send("done", { ms, model: payload.model, cached: false, chars: full.length });
          sifuTimingLog("stream-done", {
            route: "GET", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
            promptMs, promptChars: prompt.length, firstMs, totalMs: Date.now() - reqT0, cached: false,
          });
        } else {
          send("error", { error: `${sifuModel} exit ${code} · ${cliErrorMessage(sifuModel, cliErr)}` });
          sifuTimingLog("stream-error", {
            route: "GET", mode, stream: true, profileId: profileId || undefined, contextCache, ctxMs,
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
