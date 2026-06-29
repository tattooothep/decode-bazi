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
import { loadEnvConfig } from "@next/env";
import { spawn, execFileSync } from "child_process";
import { readFileSync, statSync, writeFileSync, rmSync, chownSync, chmodSync } from "fs";
import { join } from "path";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { StringDecoder } from "string_decoder";
import { q1, q } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth";
import { reserveHourForUser, drainHoursByCharsForUser } from "@/lib/spend-hours";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";
import { boundaryWarning3p, monthPillarBoundary } from "@/lib/bazi-boundary";
import { computeQiyunLock } from "@/lib/bazi-qiyun";
import { computeSiLingDays } from "@/lib/chart-table";
import { validateIdentity, stripIdLine, extractExpectedDM } from "@/lib/identity-lock";
import { extractTraceFacts, parseTraceLine, stripTraceLine, validateTrace, parseClaimedSources, type TraceFacts } from "@/lib/sifu-trace-lock";
import { checkSifuEvidenceTrace } from "@/lib/sifu-evidence-trace";
import { checkSifuCriticalEvidence, type CriticalEvidenceCheck } from "@/lib/sifu-critical-evidence-gate";
import { checkSifuFactClaimGate, type SifuFactClaimCheck } from "@/lib/sifu-fact-claim-gate";
import { ensureServerEnv } from "@/lib/server-env";
import { SIFU_CODEX_QTBJ_RETRIEVAL_VERSION, loadQtbjTiaohouCompactKnowledge } from "@/lib/sifu-qtbj-compact";
import { buildSifuCompactBaseline } from "@/lib/sifu-compact-baseline";
import { logResearchAiMessageSafe } from "@/lib/research-log";
import { buildSifuShadowModePlan } from "@/lib/sifu-shadow-mode";
import { logSifuSourceAuditSafe } from "@/lib/sifu-source-audit-log";
import type { SifuAnswerSupportedByAudit } from "@/lib/sifu-source-audit";

loadEnvConfig(process.cwd(), false, console, true);
ensureServerEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);

type Msg = { role: "user" | "assistant"; content: string };
type SifuModel = "claude-max-cli" | "codex-cli" | "grok-cli" | "gemini-api";
type SifuPayload = { reply: string; model: SifuModel; provider_model?: string | null };
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
const SIFU_CLAUDE_COMPACT_KNOWLEDGE = process.env.SIFU_CLAUDE_COMPACT_KNOWLEDGE === "1";
const SIFU_MIN_VISIBLE_REPLY_CHARS = Math.max(0, Number(process.env.SIFU_MIN_VISIBLE_REPLY_CHARS || 60));
const SIFU_FUSION_MIN_VISIBLE_REPLY_CHARS = Math.max(SIFU_MIN_VISIBLE_REPLY_CHARS, Number(process.env.SIFU_FUSION_MIN_VISIBLE_REPLY_CHARS || 900));
const SIFU_DIRECT_MESSAGE_MAX_CHARS = 2_000;
const SIFU_FUSION_INTERNAL_MESSAGE_MAX_CHARS = boundedIntEnv("SIFU_FUSION_INTERNAL_MESSAGE_MAX_CHARS", 80_000, 4_000, 120_000);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedIntEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function geminiApiKey(): string {
  ensureServerEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  return String(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "").trim();
}

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

function buildSifuGateRetryPrompt(input: {
  prompt: string;
  expectedDM: string | null;
  traceFacts: TraceFacts | null;
  idReason: string;
  traceReason: string;
  critical: CriticalEvidenceCheck;
  factClaim?: SifuFactClaimCheck;
  emptyVisible: boolean;
  tooShortVisible: boolean;
  minVisibleReplyChars?: number;
  criticalHardGate?: boolean;
}): string {
  const lines = [
    "=== SYSTEM RETRY GATE (ไม่ผ่านตัวตรวจหลังบ้าน) ===",
    "คำตอบก่อนหน้าไม่ผ่าน ให้สร้างคำตอบใหม่ทั้งหมด ห้ามอ้างว่าก่อนหน้าตอบแล้ว",
  ];
  const hardGate = input.criticalHardGate !== false;
  if (hardGate && input.expectedDM) {
    lines.push(`- บรรทัดแรกต้องเป็น exact: ⟦ID⟧日干=${input.expectedDM}⟧`);
  }
  if (hardGate && input.traceFacts?.gejuTokens.length) {
    const cong = input.traceFacts.congExpected === true ? "มี" : input.traceFacts.congExpected === false ? "ไม่มี" : "ก้ำกึ่ง";
    const geju = input.traceFacts.gejuTokens[0];
    const yong = input.traceFacts.yongWords.find((w) => /[ก-๙]/.test(w)) || input.traceFacts.yongWords[0] || "-";
    lines.push(`- บรรทัดที่สองต้องขึ้นต้น exact: ⟦TRACE⟧從=${cong}·格局=${geju}·用神=${yong}`);
    lines.push("- ห้ามใช้ป้ายรอง/raw engine มาเป็น格局ใน TRACE หรือในเนื้อ ถ้าโครงดวงระบุ strict月令หลัก ให้ใช้ strict月令หลักเท่านั้น");
  } else if (!hardGate) {
    lines.push("- รอบนี้เป็น Fusion raw-data mode: ไม่ต้องใส่ ID/TRACE/marker เพื่อผ่านระบบ ให้ตอบเนื้อหาจริงจากคัมภีร์ + ผัง + packet evidence");
  }
  if (input.idReason !== "ok" || input.traceReason !== "ok" || !input.critical.ok) {
    lines.push(`- สาเหตุที่ไม่ผ่าน: identity=${input.idReason} trace=${input.traceReason} critical=${input.critical.missing.map((m) => m.code).join(",") || "ok"}`);
  }
  if (input.factClaim && !input.factClaim.ok) {
    lines.push(`- สาเหตุ fact-claim ไม่ผ่าน: ${input.factClaim.violations.map((v) => v.code).join(",")}`);
    lines.push("- ห้ามสร้างปฏิกิริยาที่ packet ไม่ได้ authorize: โดยเฉพาะห้ามพูด 寅戌冲/ขาลจอชง ถ้าลิสต์ให้เป็น 拱/虛拱; เมื่อ午มาเติมให้อ่าน 寅午戌火局");
    lines.push("- ห้ามพูด 戊透干/戊โผล่ก้านฟ้า ถ้า PILLAR LOCK/透出ก้านฟ้าไม่มี戊; ถ้า戊อยู่ใน藏干ให้พูดว่า戊ซ่อนในกิ่ง ไม่ใช่透干");
  }
  if (input.emptyVisible) {
    lines.push("- คำตอบก่อนหน้ามีแต่บรรทัดระบบ/TRACE จนไม่มีเนื้อหาที่ลูกค้าเห็น ต้องตอบเนื้อหาจริงหลังบรรทัดล็อกอย่างน้อย 3 ประโยค ห้ามตอบสั้นแค่รับทราบ/ครับ");
  }
  if (input.tooShortVisible) {
    lines.push(`- เนื้อหาที่ลูกค้าเห็นสั้นเกินไปหลังซ่อนบรรทัดระบบ ต้องตอบเนื้อหาจริงให้ยาวอย่างน้อย ${input.minVisibleReplyChars || SIFU_MIN_VISIBLE_REPLY_CHARS} อักขระ`);
  }
  const criticalRequired = input.critical.required.length ? input.critical.required : input.critical.missing;
  if (input.criticalHardGate !== false && !input.critical.ok && criticalRequired.length) {
    lines.push("- ในเนื้อคำตอบต้องเอ่ยหลักฐานบังคับทั้งหมดของคำถามนี้อย่างน้อยด้วย marker จีนหรือคำไทยในวงเล็บ (ไม่ใช่แก้เฉพาะตัวที่ขาดรอบก่อน เพราะ retry ห้ามทำของที่เคยถูกหลุดหาย):");
    for (const item of criticalRequired) {
      lines.push(`  * ${item.label} (ยอมรับคำใดคำหนึ่ง: ${item.anyOf.join(" / ")})`);
    }
    lines.push("- ถ้ามีทั้ง合และ冲/害ในปีเดียวกัน ต้องอธิบายแบบแก้ขัด เช่น 合絆/貪合忘沖 ก่อนสรุปผลชีวิต ห้ามอ่านเป็น冲อย่างเดียว");
  } else if (!input.critical.ok && criticalRequired.length) {
    lines.push("- critical packet evidence ใช้เป็น audit เท่านั้นในรอบนี้: ห้ามยัด marker เพื่อผ่าน checklist; ใช้ packet เป็นข้อมูลดิบกันอ่านผิดดวง และให้คัมภีร์/canonical เป็น source of truth ของการวินิจฉัย");
  }
  lines.push("=== END RETRY GATE ===");
  return `${input.prompt}\n\n${lines.join("\n")}\n`;
}

function buildSifuAnswerSupportAudit(reply: string, critical: CriticalEvidenceCheck): SifuAnswerSupportedByAudit {
  const normalized = (reply || "").replace(/\s+/g, "");
  const sources: SifuAnswerSupportedByAudit["sources"] = [];
  const add = (sourceId: string, confidence: number, reason: string, markers: RegExp[]) => {
    const spans = markers
      .map((re) => normalized.match(re)?.[0])
      .filter((x): x is string => Boolean(x))
      .slice(0, 4);
    if (!spans.length || sources.some((s) => s.sourceId === sourceId)) return;
    sources.push({ sourceId, confidence, answerSpans: spans, reason });
  };
  add("qtbj-tiaohou-clean", 0.86, "answer mentions strict 調候/月令 markers", [/壬日丑月|壬水丑月|十二月壬水|專用丙火|丙火|調候用神|寒局用火/]);
  add("zpzq-zhenquan-clean", 0.82, "answer mentions classical 格局/月令 markers", [/雜氣正官格|雜氣正官|官印相生|正官佩印|月令|透干|藏干/]);
  add("bazi-geju-master", 0.78, "answer uses compiled 格局 rule markers", [/雜氣正官格|雜氣正官|官印相生|正官佩印|相神/]);
  add("bazi-hechong-resolution", 0.82, "answer mentions 合沖/墓庫 resolver markers", [/丙辛合|丁壬合|貪合忘沖|合絆|合而不化|本身之合|四庫|辰戌丑未|墓庫|丑未冲|未戌破|子未害/]);
  add("bazi-interaction-master", 0.78, "answer mentions interaction/combo markers", [/巳酉丑|三合金|午丑害|丑未冲|未戌破|子未害/]);
  add("bazi-shishen-classical", 0.72, "answer mentions ten-god marker", [/乙傷官|傷官/]);
  const proofLevel: SifuAnswerSupportedByAudit["proofLevel"] =
    sources.length >= 3 && critical.ok ? "medium" :
    sources.length > 0 ? "weak" :
    "none";
  return { method: sources.length ? "lexical" : "not_run", proofLevel, sources };
}
const SIFU_CONTEXT_CACHE_MS = Number(process.env.SIFU_CONTEXT_CACHE_MS || 5 * 60_000);
const SIFU_CONTEXT_CACHE_MAX = Number(process.env.SIFU_CONTEXT_CACHE_MAX || 80);
const SIFU_TIMING_LOG = process.env.SIFU_TIMING_LOG !== "0";

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
// Grok CLI (xAI) · login เป็น jarvis ที่ /home/jarvis/.grok · binary อยู่ใต้ /root (ต้อง full path)
// prompt ยาว → ส่งผ่าน --prompt-file (stdin "-" grok ตีความเป็นชื่อไฟล์) · cwd jarvis home เลี่ยง watch error
const GROK_BIN = process.env.SIFU_GROK_BIN || "/root/.grok/bin/grok";
const GROK_CLI_MODEL = (process.env.SIFU_GROK_MODEL || "").trim();
const GROK_CWD = process.env.SIFU_GROK_CWD || "/home/jarvis";
const GROK_MAX_ATTEMPTS = Math.max(1, Math.min(3, Number(process.env.SIFU_GROK_MAX_ATTEMPTS || 2)));
const GROK_VISIBLE_GUARD_VERSION = "grok-visible-guard1";
const GEMINI_API_MODEL = (process.env.SIFU_GEMINI_MODEL || "gemini-3.1-pro-preview").trim();
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(512, Number(process.env.SIFU_GEMINI_MAX_OUTPUT_TOKENS || 8192));
const GEMINI_THINKING_BUDGET_RAW = process.env.SIFU_GEMINI_THINKING_BUDGET;
const GEMINI_THINKING_BUDGET = GEMINI_THINKING_BUDGET_RAW == null || GEMINI_THINKING_BUDGET_RAW === ""
  ? (GEMINI_API_MODEL.includes("-pro") ? null : 0)
  : Number(GEMINI_THINKING_BUDGET_RAW);
const CODEX_COMPACT_KNOWLEDGE = [
  "Codex compact mode: FACT/PILLAR LOCK เป็นข้อเท็จจริง; คัมภีร์คลาสสิกเป็น source of truth ใน scope ของมัน; packet/interactions เป็นหลักฐานคำนวณพร้อม provenance",
  "ห้ามแต่งปฏิกิริยา ก้าน/กิ่ง ธาตุซ่อน หรือวัยจรที่ packet ไม่ได้ให้; ถ้า packet field ขัด strict classic/canonical ให้ลดเป็น raw/secondary",
  "ถ้ามี block 窮通寶鑑 ให้ใช้ชั้น 調候/月令 ชนะตัวเลขธาตุดิบและ病藥 fallback; ถ้ามี子平真詮 strict月令 ให้ใช้เป็น格局หลัก",
  "ไทยนำ จีนรอง อธิบายผลจริงตรงคำถาม และรักษา ID line ตามกฎ prompt หลัก",
].join("\n");
function shouldUseCompactKnowledge(model: SifuModel): boolean {
  return model === "codex-cli" || model === "grok-cli" || SIFU_CLAUDE_COMPACT_KNOWLEDGE;
}
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
  { file: QTBJ_TIAOHOU_FILE, label: "📜 窮通寶鑑 · 調候用神/月令 ตัวบทจริง canonical (admin library id 13 · 10干×12เดือน · source of truth ชั้นร้อนเย็นแห้งชื้น; raw packet เป็น evidence)" },
  { file: QTBJ_TIAOHOU_THAI_NOTES_FILE, label: "📘 窮通寶鑑 · Thai teaching notes จาก memo id 13 (ชั้นอธิบาย 調候/月令 เป็นไทย · ใช้เสริม canonical; ห้ามชนะตัวบทจริง)" },
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

type CompactExcerptSpec = {
  path: string;
  label: string;
  start: string;
  end: string;
};
const SIFU_COMPACT_EXCERPTS: CompactExcerptSpec[] = [
  {
    path: join(SIFU_EXTRA_DIR, "zpzq-zhenquan-clean.md"),
    label: "子平真詮 · 論雜氣/四庫 · verbatim source excerpt",
    start: "四墓者，雜氣也",
    end: "是故四墓不忌刑衝，刑衝未必成格",
  },
  {
    path: INTERACTION_MASTER_PATH,
    label: "Interaction Master · 天干五合 丙辛/丁壬",
    start: "### 5.1 天干五合",
    end: "### 5.2 天干相冲",
  },
  {
    path: INTERACTION_MASTER_PATH,
    label: "Interaction Master · 三合局 巳酉丑",
    start: "### 6.2 三合局",
    end: "### 6.3 三会方局",
  },
  {
    path: join(SIFU_EXTRA_DIR, "bazi-hechong-resolution.md"),
    label: "合冲 Resolution · 貪合忘冲 / 合解冲",
    start: "STEP 2  ตรวจ地支ระดับ會/合/沖/刑/害/破",
    end: "**Q3: 刑/害 อยู่ตรงไหนเทียบกับ 合/沖?**",
  },
];
let _sifuCompactAuthorityCache: { text: string; ts: number; version: string } | null = null;
function sourceExcerpt(spec: CompactExcerptSpec): { text: string; versionText: string } {
  const raw = readFileSync(spec.path, "utf8");
  const start = raw.indexOf(spec.start);
  const end = raw.indexOf(spec.end, start >= 0 ? start : 0);
  const body = start >= 0
    ? raw.slice(start, end > start ? end : undefined).trim()
    : "";
  return {
    text: body ? `\n\n──────── ${spec.label} ────────\n${body}` : "",
    versionText: `${spec.path}\n${body || raw.slice(0, 1200)}`,
  };
}
function loadSifuCompactAuthorityKnowledge(): { text: string; version: string } {
  const now = Date.now();
  if (_sifuCompactAuthorityCache && now - _sifuCompactAuthorityCache.ts < 60_000) return _sifuCompactAuthorityCache;
  const hash = createHash("sha1");
  const baseline = buildSifuCompactBaseline({ generatedAt: "runtime" });
  hash.update(baseline.baselineHashSha256).update(baseline.sourceMapHashSha256).update(baseline.sourceManifestHash);
  const parts = [
    "=== SIFU COMPACT SOURCE-OF-TRUTH BASELINE (source-mapped) ===",
    `baseline=${baseline.baselineVersion}`,
    `baseline_hash=${baseline.baselineHashSha256}`,
    `source_map_hash=${baseline.sourceMapHashSha256}`,
    `source_manifest_hash=${baseline.sourceManifestHash}`,
    "",
    baseline.text,
    "",
    "=== RUNTIME EXACT SOURCE EXCERPTS (คัมภีร์/authority ที่ต้องชนะ packet/raw label ใน scope) ===",
  ];
  for (const spec of SIFU_COMPACT_EXCERPTS) {
    try {
      const excerpt = sourceExcerpt(spec);
      hash.update(spec.label).update(excerpt.versionText);
      if (excerpt.text) parts.push(excerpt.text);
    } catch (e) {
      console.warn("[sifu] compact authority excerpt missing:", spec.label, (e as Error).message);
      hash.update(spec.label).update("missing");
      parts.push(`\n\n──────── ${spec.label} ────────\n(ไม่พบ excerpt จากไฟล์ต้นทาง — ห้ามอ้างกฎนี้เป็นหลักฐาน)`);
    }
  }
  parts.push("=== END SIFU COMPACT SOURCE-OF-TRUTH BASELINE ===");
  const text = parts.join("\n");
  const version = `compact-r278-${hash.digest("hex").slice(0, 12)}`;
  _sifuCompactAuthorityCache = { text, ts: now, version };
  return _sifuCompactAuthorityCache;
}

function buildSifuRuleVersion(model: SifuModel): string {
  if (shouldUseCompactKnowledge(model)) {
    const grokGuard = model === "grok-cli" ? `-${GROK_VISIBLE_GUARD_VERSION}` : "";
    return loadSifuCompactAuthorityKnowledge().version + "-" + SIFU_CODEX_QTBJ_RETRIEVAL_VERSION + "-idlock1-dayboundary1-compactclassics2" + grokGuard;
  }
  const baseVersion = loadAjekRules().version + "-" + loadInteractionMaster().version + "-" + loadEngineKnowledge().version + "-" + loadSifuExtraKnowledge().version + "-idlock1-dayboundary1";
  if (model === "gemini-api") return baseVersion + `-gemini:${GEMINI_API_MODEL}`;
  return model === "codex-cli" ? baseVersion + "-" + SIFU_CODEX_QTBJ_RETRIEVAL_VERSION : baseVersion;
}
/* 💾 DB result cache · TTL 24h */
const CACHE_TTL_HOURS = 24;
function resolveSifuModel(raw: unknown): SifuModel {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "grok" || s === "grok-cli") return "grok-cli";
  if (s === "gemini" || s === "gemini-api") return "gemini-api";
  return s === "codex" || s === "codex-cli" ? "codex-cli" : "claude-max-cli";
}

function providerModelName(model: SifuModel): string | null {
  if (model === "gemini-api") return GEMINI_API_MODEL;
  if (model === "codex-cli") return CODEX_CLI_MODEL || null;
  if (model === "grok-cli") return GROK_CLI_MODEL || null;
  return null;
}

function expectedFusionInternalToken(): string | null {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}

function isTrustedFusionInternalCall(req: Request): boolean {
  if (req.headers.get("x-sifu-fusion") !== "1") return false;
  const expected = expectedFusionInternalToken();
  const actual = req.headers.get("x-sifu-fusion-token") || "";
  if (!expected || !actual || actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
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
    "v9-factclaim", // 15 มิ.ย. · invalidate cache เก่าที่อาจมี invented 寅戌冲 / false 戊透干
    "v10-timinglock", // 16 มิ.ย. · invalidate cache เก่าที่ไม่มี HK_BAZI_TIMING_LOCK/READ_ORDER และ timing validator
    "v11-qiyunlock", // 16 มิ.ย. · invalidate cache เก่าที่ 3p เหมา startAge=10 และไม่มี HK_QIYUN_LOCK
    opts.ruleVersion,
    opts.orgId || "noorg",
    opts.profileId || "anon",
    opts.contextHash || "noctx",
    opts.topic || "free",
    opts.mode || "default",
    ...(opts.model && opts.model !== "claude-max-cli" ? [opts.model] : []),
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
  const head = lines.slice(0, 120);
  const proofMarkers = lines
    .filter((line) =>
      line.includes("HK_LIUNIAN_YEAR_DRILLDOWN_V1") ||
      line.includes("HK_LUCK_PILLAR_LOCK_V1") ||
      line.includes("HK_QUERY_YEAR_LUCK_LOCK_V1") ||
      line.includes("HK_YEAR_DAYUN_MAP_V2") ||
      line.includes("HK_YEAR_PILLAR_CALENDAR_LOCK_V1") ||
      line.includes("HK_LICHUN_YEAR_BOUNDARY_LOCK_V1") ||
      line.includes("HK_JIAOYUN_BOUNDARY_LOCK_V1") ||
      line.includes("HK_QIYUN_LOCK_V1") ||
      line.includes("HK_SIFU_PREFLIGHT_V1") ||
      line.includes("HK_BAZI_TIMING_LOCK_V1") ||
      line.includes("HK_BAZI_READ_ORDER_LOCK_V1") ||
      line.includes("HK_CURRENT_LUCK_RESOLVED_V1") ||
      line.includes("HK_SANHE_CANDIDATE_LOCK_V1") ||
      line.includes("HK_TWO_SCENARIOS_V1") ||
      line.includes("HK_MONTH_PILLAR_SCENARIO_LOCK_V1") ||
      line.includes("HK_MONTHLY_DRILLDOWN_SCOPE_V1") ||
      line.includes("HK_SYNASTRY_RESOLVED_V1") ||
      line.includes("ปีจร/เดือนจรในวัยจรปัจจุบัน") ||
      line.includes("ตารางปีจรทั้งชีวิต")
    )
    .slice(0, 80);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const line of [...head, ...proofMarkers]) {
    if (seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
  }
  return merged.map((line) => line.slice(0, 1600));
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
  if (shouldUseCompactKnowledge(model)) {
    const compact = loadSifuCompactAuthorityKnowledge();
    return {
      ajek: "compact-baseline",
      interaction: "compact-baseline+runtime-excerpts",
      engine: "packet+compact-baseline",
      extra: compact.version,
      qtbj: SIFU_CODEX_QTBJ_RETRIEVAL_VERSION,
      compact_knowledge: true,
      claude_compact_knowledge: model === "claude-max-cli" && SIFU_CLAUDE_COMPACT_KNOWLEDGE,
      grok_visible_guard: model === "grok-cli" ? GROK_VISIBLE_GUARD_VERSION : null,
    };
  }
  return {
    ajek: loadAjekRules().version,
    interaction: loadInteractionMaster().version,
    engine: loadEngineKnowledge().version,
    extra: loadSifuExtraKnowledge().version,
    qtbj: model === "codex-cli" ? SIFU_CODEX_QTBJ_RETRIEVAL_VERSION : null,
    compact_knowledge: model === "codex-cli",
    gemini_model: model === "gemini-api" ? GEMINI_API_MODEL : null,
  };
}

function compactOutputProtocol(ctx: string): string {
  const dm = extractExpectedDM(ctx);
  const facts = extractTraceFacts(ctx);
  const lines = [
    "",
    "=== FINAL OUTPUT PROTOCOL (compact fast stream · บังคับเป็นอักขระแรกของคำตอบ) ===",
    "ห้ามขึ้นต้นด้วยคำทักทาย ห้าม markdown ห้ามเว้นวรรค ห้าม BOM ห้ามอธิบายก่อนรหัส",
  ];
  if (dm) lines.push(`บรรทัดแรก exact: ⟦ID⟧日干=${dm}⟧`);
  else lines.push("บรรทัดแรก exact: ⟦ID⟧日干=<คัดจาก FACT LOCK Day Master>⟧");
  if (facts?.gejuTokens.length) {
    const cong = facts.congExpected === true ? "มี" : "ไม่มี";
    const geju = facts.gejuTokens[0];
    const yong = facts.yongWords.find((w) => /[ก-๙]/.test(w)) || facts.yongWords[0] || "<คัดจากธาตุช่วย/strict調候>";
    lines.push(`บรรทัดสอง exact-template: ⟦TRACE⟧從=${cong}·格局=${geju}·用神=${yong}·ตำรา=<ชื่อเล่มที่ใช้จริงคั่นด้วย |>·เทรน=ไม่มี⟧`);
  } else {
    lines.push("ถ้าไม่มีบรรทัดโครงดวง ให้ข้าม TRACE ได้ แต่ยังต้องมี ID line ก่อนเสมอ");
  }
  lines.push("หลังจากสองบรรทัดนี้เท่านั้น จึงตอบเนื้อภาษาไทยตามคำถาม");
  lines.push("ถ้าอักขระแรกของคำตอบไม่ใช่ ⟦ ระบบจะตัดคำตอบทิ้งทันที");
  lines.push("=== END FINAL OUTPUT PROTOCOL ===");
  return lines.join("\n");
}

function expectedTraceHeaderLine(facts: TraceFacts | null): string | null {
  if (!facts?.gejuTokens.length) return null;
  const cong = facts.congExpected === true ? "มี" : facts.congExpected === false ? "ไม่มี" : "ก้ำกึ่ง";
  const geju = facts.gejuTokens[0];
  const yong = facts.yongWords.find((w) => /[ก-๙]/.test(w)) || facts.yongWords[0] || "-";
  return `⟦TRACE⟧從=${cong}·格局=${geju}·用神=${yong}·ตำรา=packet·เทรน=ไม่มี⟧`;
}

function normalizeSifuMachineHeader(reply: string, expectedDM: string | null, traceFacts: TraceFacts | null): string {
  const lines: string[] = [];
  if (expectedDM) lines.push(`⟦ID⟧日干=${expectedDM}⟧`);
  const traceLine = expectedTraceHeaderLine(traceFacts);
  if (traceLine) lines.push(traceLine);
  if (!lines.length) return reply;
  const body = stripTraceLine(stripIdLine(reply)).trimStart();
  return body ? `${lines.join("\n")}\n${body}` : lines.join("\n");
}

function shouldRepairGrokMachineHeader(input: {
  model: SifuModel;
  hardGate: boolean;
  expectedDM: string | null;
  idCheck: ReturnType<typeof validateIdentity>;
  trCheck: ReturnType<typeof validateTrace>;
  criticalCheck: CriticalEvidenceCheck;
  visibleReply: string;
}): boolean {
  return input.model === "grok-cli" &&
    input.hardGate &&
    !!input.expectedDM &&
    !input.idCheck.ok &&
    input.trCheck.ok &&
    input.criticalCheck.ok &&
    !!input.visibleReply;
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
  const canonicalGejuLine = firstContextLine(input.ctx, "โครงดวง:");
  const yongLayerLine = firstContextLine(input.ctx, "用神分層");
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
    canonicalGejuLine,
    yongLayerLine,
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
  answer?: string | null;
  answerSupportedBy?: SifuAnswerSupportedByAudit | null;
  /* ⟦SRC⟧ self-report (13 มิ.ย.): เล่มที่ AI อ้างว่าใช้ + ส่วนที่ตอบจากความรู้เทรน · parse จากบรรทัด TRACE */
  claimedSrc?: { books: string[]; trained: string | null } | null;
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
    firstContextLine(ctx, "โครงดวง:"),
    firstContextLine(ctx, "用神分層"),
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
      if (input.claimedSrc) {
        /* self-report จากบรรทัด TRACE (⟦SRC⟧): เล่มที่ AI อ้างว่าใช้ + ส่วนที่ตอบจากความรู้เทรน · proofLevel=claim_only ตามชนิดเดิม */
        plan.candidate.sourceAudit.modelClaimedUsed = {
          present: true,
          proofLevel: "claim_only",
          sourceIds: input.claimedSrc.books,
          raw: input.claimedSrc.trained ? `เทรน=${input.claimedSrc.trained}` : undefined,
        };
      }
      if (input.answer) {
        plan.candidate.sourceAudit.status = "posthoc";
        plan.candidate.sourceAudit.answerHash = hashText(input.answer);
        plan.candidate.sourceAudit.answerSupportedBy = input.answerSupportedBy || {
          method: "not_run",
          proofLevel: "none",
          sources: [],
        };
      }
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

function fusionRawPacketPolicyText(): string {
  return [
    "",
    "=== FUSION RAW PACKET POLICY ===",
    "packet/context เป็นข้อมูลดิบและหลักฐานคำนวณเพื่อกันอ่านผิดดวง ไม่ใช่ checklist บังคับ conclusion หรือบังคับให้เอ่ย marker ในคำตอบ",
    "FACT LOCK/PILLAR LOCK ใช้ล็อกตัวตนและเสาจริงของเคส; คัมภีร์/canonical เป็น source of truth สำหรับการวินิจฉัยใน scope ของมัน",
    "ถ้า packet/raw engine label ขัดกับคัมภีร์ strict/canonical ให้ลด packet/raw label เป็นหลักฐานรอง และอธิบายตามคัมภีร์กับผังจริง",
    "ไม่ต้องใส่คำ/marker เพื่อผ่านระบบตรวจหลังบ้าน ให้ตอบตามเหตุผลจริงจากคัมภีร์ + ผัง + packet evidence",
    "=== END FUSION RAW PACKET POLICY ===",
  ].join("\n");
}

function sanitizePacketEvidenceClaims(reply: string, ctx: string): string {
  if (hasPacketEvidence(ctx)) return reply;
  return reply.replace(PACKET_CLAIM_RE, "ข้อมูลที่มี");
}

function stripSifuInternalMarkersForStream(text: string): string {
  return stripTraceLine(stripIdLine(text))
    .replace(/(^|\n)[ \t]*⟦ID⟧[^\n]*(?:\n|$)/g, "$1")
    .replace(/(^|\n)[ \t]*⟦TRACE⟧[^\n]*(?:\n|$)/g, "$1")
    .replace(/⟦(?:ID|TRACE)⟧[^⟧\n]*(?:⟧)?/g, "");
}

function sanitizeSifuStreamVisible(text: string, ctx: string): string {
  return sanitizePacketEvidenceClaims(stripSifuInternalMarkersForStream(text), ctx);
}

function isExplicitSifuAuditQuestion(message: string): boolean {
  return /(audit|debug|หลังบ้าน|prompt|packet|engine|trace|id\/trace|id trace|13\s*ชั้น|สิบสามชั้น|ขั้นตอน|วิธีอ่าน|ตรวจระบบ|validator|wrapper|cli|stdout)/i.test(message);
}

function sanitizeGrokUserVisibleText(text: string, message: string): string {
  if (!text || isExplicitSifuAuditQuestion(message)) return text;
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const s = line.trim();
      if (!s) return true;
      if (/^(กำลัง|กำลังอ่าน|กำลังเปิด|กำลังตรวจ|reading|opening|checking)\b/i.test(s) && /(ไฟล์|file|prompt|packet|context|ข้อมูลดวง)/i.test(s)) return false;
      if (/(\bprompt\b|พรอมต์|พร้อมต์|คำสั่งระบบ)/i.test(s)) return false;
      if (/(stdout|backend|validator|wrapper|cache|retry|FACT LOCK|PILLAR LOCK|ID\/TRACE|⟦ID⟧|⟦TRACE⟧)/i.test(s)) return false;
      if (/\bCLI\b/i.test(s)) return false;
      return true;
    })
    .join("\n")
    .replace(/prompt packet/gi, "ข้อมูลดวงที่ระบบส่งมา")
    .replace(/packet evidence/gi, "หลักฐานจากผังดวง")
    .replace(/\bpacket\b/gi, "ข้อมูลดวง")
    .replace(/raw engine/gi, "ระบบคำนวณผัง")
    .replace(/\bengine\b/gi, "ระบบคำนวณผัง");
}

function sanitizeModelVisibleReply(text: string, ctx: string, model: SifuModel, message: string): string {
  const safe = sanitizePacketEvidenceClaims(stripSifuInternalMarkersForStream(text), ctx);
  return model === "grok-cli" ? sanitizeGrokUserVisibleText(safe, message) : safe;
}

function buildSifuStreamGuardMeta(identity: string, trace: string) {
  const cleanIdentity = identity === "pass" || identity === "not_required";
  const cleanTrace = trace === "pass" || trace === "not_required";
  const cacheable = cleanIdentity && cleanTrace;
  return { identity, trace, degraded: !cacheable, cacheable };
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
async function getCachedReply(key: string): Promise<SifuPayload | null> {
  try {
    const row = await q1<{ payload: SifuPayload }>(
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
async function setCachedReply(key: string, payload: SifuPayload, ms: number, ruleVersion: string) {
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
              birth_lng, gender, birth_time_known, day_boundary, yongshen_school
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
    const qiyunLock = await computeQiyunLock({ date, time, gender, lng, birthTimeKnown, dayBoundary });
    const startAge = qiyunLock.representativeStartAge ?? 0;
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
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · กำลัง${calc.strength.level}`,
      `納音: 年${ny.year?.zh||"-"} · 月${ny.month?.zh||"-"} · 日${ny.day?.zh||"-"} · 時${ny.hour?.zh||"-"}`,
    ];
    const rootedness = await computeRootedness(calc.pillars);
    const [slY, slMo, slD] = date.split("-").map(Number);
    const [slH, slMi] = time.split(":").map(Number);
    const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);  // 司令 วันนับจาก節 (ICT→BJT)
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, gender, siLingDays, {
      dayBoundary,
      dayBoundarySource,
      monthBoundary: is3p ? monthPillarBoundary(date) : null, // 月柱ก้ำกึ่ง節氣 → ไหล conf ลง field เดือน (เฉพาะ 3 เสา)
      qiyunLock,
    });
    validateChartPacket(packet);
    /* HK_YONG_LOCK_V2 — classics-first: FACT/PILLAR เป็นข้อเท็จจริง; QTBJ/strict classic ชนะ engine รวมใน scope 調候 */
    {
      const _ugTh = (arr: string[]) => arr.length ? arr.map((e) => DM_LABEL_TH[e] || e).join("·") : "-";
      const _ugConf = packet.structure.confidence;
      const _strict = packet.yongShenProtocols?.tiaoHou?.strict;
      const _strictTxt = _strict
        ? ` · strict調候=${_strict.dmStem}日${_strict.monthBranch}月 主=${_ugTh(_strict.primaryElements)} 次=${_ugTh(_strict.secondaryElements)} 再=${_ugTh(_strict.tertiaryElements)}`
        : "";
      lines.push(
        `YONG_LOCK (classics-first · FACT/PILLAR ล็อกข้อเท็จจริง, คัมภีร์ strict ชนะใน scope ของมัน, engineรวมเป็นหลักฐานรอง): ` +
        `engineรวม 用神=${_ugTh(packet.usefulGods.yong)} · 喜=${_ugTh(packet.usefulGods.xi)} · 忌=${_ugTh(packet.usefulGods.ji)}` +
        _strictTxt +
        (_ugConf ? ` · ความมั่นใจโครง=${_ugConf}` : "")
      );
      /* moderate/low = ก้ำกึ่ง → แยกบรรทัดเตือนให้เด่น (high จะไม่มีบรรทัดนี้ = ฟันได้เต็มที่) */
      if (_ugConf && _ugConf !== "high") {
        lines.push(`⚠️ YONG_LOCK ก้ำกึ่ง (confidence=${_ugConf}): 用神อ่านได้ 2 ทาง — ต้องบอกลูกค้าว่าก้ำกึ่ง + อธิบายทั้งสองด้าน + ชี้ทางที่ engine ให้น้ำหนัก · ห้ามฟันธาตุช่วยข้างเดียว (ดูกฎ 4.2)`);
      }
    }
    lines.push(renderChartPrompt(packet, { subjectLabel: `${subjectName}·${row.id.slice(0, 8)}` }));
    /* HK_SCHOOL_CONFIRM_V1 · สำนักที่ user ยืนยันจากชีวิตจริง (profiles.yongshen_school) — ชนะคำถามเฉลย */
    const _schConfirmed = (row as { yongshen_school?: string | null }).yongshen_school;
    if (_schConfirmed === "shun_shi" || _schConfirmed === "fu_yi") {
      const _schTxt = _schConfirmed === "fu_yi"
        ? "②扶抑พยุงตัว (子平真詮) — ธาตุดี=印/比劫พยุงตัว · ระวัง=ธาตุกระแส"
        : "①順勢ตามกระแส (滴天髓) — ตามชุดธาตุช่วยของ engine";
      lines.push(`⚖️ สำนักอ่านดวงนี้ "ยืนยันแล้วจากชีวิตจริงของเจ้าของดวง": สาย${_schTxt} · อ่านธาตุช่วย/แนวทางตามสำนักนี้เป็นหลัก · ไม่ต้องถามคำถามเฉลยชีวิตซ้ำ · ถ้าผู้ใช้เล่าเหตุการณ์ใหม่ที่ขัดแย้งชัดเจน ค่อยชวนทบทวนสำนักอีกครั้ง`);
    }
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

  const key = createHash("sha1").update(`bazi-ctx-v3-liunian-locks-synastry|${orgId}|${profileId}|${userId || ""}|${fp}`).digest("hex");
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
        `โครงดวงเบื้องต้นจาก engine (อ่านประกอบเท่านั้น; ถ้ามี strict月令/คัมภีร์ ให้ชนะบรรทัดนี้): ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วยเบื้องต้น ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
        g.LIMIT_3P_INTRO,
        boundaryWarning3p(input.date), // "" ถ้าไม่ก้ำกึ่ง → filter ทิ้ง
      ].filter(Boolean).join("\n");
    }
    const qiyunLock = await computeQiyunLock({
      date: input.date,
      time: input.time,
      gender: input.gender,
      lng: input.lng,
      birthTimeKnown,
      dayBoundary,
    });
    const startAge = qiyunLock.representativeStartAge ?? 0;
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
      `โครงดวงเบื้องต้นจาก engine (อ่านประกอบเท่านั้น; ค่าหลักดูบรรทัด "โครงดวง:" จาก packet canonical ด้านล่าง): ${calc.geJu.structure || "ปกติ"} · อากาศฤดู ${calc.climate || "-"} · ธาตุช่วยเบื้องต้น ${calc.yongshen.slice(0, 3).map((y) => `${DM_LABEL_TH[y.element] || y.element}`).join(" · ")}`,
    ];
    const rootedness = await computeRootedness(calc.pillars);
    const [slY, slMo, slD] = String(input.date).split("-").map(Number);
    const [slH, slMi] = String(input.time || "12:00").split(":").map(Number);
    const siLingDays = computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0);  // 司令
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g, rootedness, input.gender, siLingDays, {
      dayBoundary,
      dayBoundarySource: input.dayBoundarySource || "default",
      qiyunLock,
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
  const compactAuthority = compact ? loadSifuCompactAuthorityKnowledge() : { text: "", version: "full-extra" };
  const ajek = compact ? { text: "", version: "codex-compact" } : loadAjekRules();
  const rulesBlock = compact
    ? "\n\n" + CODEX_COMPACT_KNOWLEDGE + "\n\n" + compactAuthority.text + "\n"
    : ajek.text
      ? "\n\n" + loadPromptMd("prompts/sifu-rules-header.md").trim().replace("{{RULES}}", () => ajek.text) + "\n"
      : "";
  const interaction = compact ? { text: "", version: "codex-compact" } : loadInteractionMaster();
  const interactionBlock = compact
    ? "\n\nปฏิกิริยา: ใช้เฉพาะรายการ interaction ที่ packet ส่งมา เช่น ปฏิกิริยาในดวง วัยจร×ดวงเกิด และปีจร×เสาวัน · ห้ามสร้างคู่ใหม่เอง · เมื่อ packet มีทั้ง合/冲 ให้ตัดสินตาม runtime exact source excerpts ก่อนตัวเลขธาตุดิบ\n"
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
  const prompt = loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock + extraBlock + qtbjCompactBlock)
    .replace("{{CTX}}", () => packetEvidenceGuardText(opts.ctx) + opts.ctx)
    .replace("{{FOCUS_HIST}}", () => focus + histText)
    .replace("{{MESSAGE}}", () => opts.message);
  return compact ? prompt + compactOutputProtocol(opts.ctx) : prompt;
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

function grokErrorMessage(err: string): string {
  if (/401|Unauthorized|not logged in|authentication|sign in|login/i.test(err)) {
    return "grok_cli_auth_required · Grok CLI ยังไม่ได้ login สำหรับ user jarvis";
  }
  return err.slice(0, 300) || "grok cli failed";
}

function claudeErrorMessage(err: string): string {
  if (/session limit|usage limit|rate limit|quota|429/i.test(err)) {
    return `claude_cli_quota_exhausted · ${err.slice(0, 240) || "Claude CLI quota/session limit"}`;
  }
  if (/401|Unauthorized|not logged in|authentication|sign in|login/i.test(err)) {
    return "claude_cli_auth_required · Claude CLI ยังไม่ได้ login สำหรับ user jarvis";
  }
  return err.slice(0, 300) || "claude cli failed";
}

function geminiErrorMessage(err: string): string {
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(err)) {
    return "gemini_api_key_invalid · Gemini API key ใช้งานไม่ได้หรือสิทธิ์ไม่พอ";
  }
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(err)) {
    return "gemini_api_quota_exhausted · Gemini API quota เต็มหรือถูก rate limit";
  }
  return err.slice(0, 300) || "gemini api failed";
}

function cliErrorMessage(model: SifuModel, err: string): string {
  if (model === "codex-cli") return codexErrorMessage(err);
  if (model === "grok-cli") return grokErrorMessage(err);
  if (model === "gemini-api") return geminiErrorMessage(err);
  return claudeErrorMessage(err);
}

// jarvis uid/gid · lookup ครั้งเดียว cache (chown temp prompt ให้ jarvis เป็นเจ้าของ → 0600 ได้ ไม่ต้อง world-readable)
let _jarvisIds: { uid: number; gid: number } | null | undefined;
function jarvisIds(): { uid: number; gid: number } | null {
  if (_jarvisIds !== undefined) return _jarvisIds;
  try {
    const uid = parseInt(execFileSync("id", ["-u", CHILD_USER]).toString().trim(), 10);
    const gid = parseInt(execFileSync("id", ["-g", CHILD_USER]).toString().trim(), 10);
    _jarvisIds = (Number.isFinite(uid) && Number.isFinite(gid)) ? { uid, gid } : null;
  } catch { _jarvisIds = null; }
  return _jarvisIds;
}
// เขียน prompt (มี PII ดวง user) ลงไฟล์ชั่วคราวให้ jarvis อ่าน (grok ส่ง prompt ทาง --prompt-file) · ลบทันทีหลังใช้
// chown → jarvis owner + 0600 (เฉพาะ jarvis/root อ่าน) · chown fail → fallback 0644 (jarvis ยังอ่านได้ · กัน umask 077)
function writeGrokPromptFile(prompt: string): string {
  const path = `/tmp/grok_sifu_${randomUUID()}.txt`;
  writeFileSync(path, prompt, { mode: 0o600 });
  const ids = jarvisIds();
  let chowned = false;
  if (ids) { try { chownSync(path, ids.uid, ids.gid); chowned = true; } catch {} }
  try { chmodSync(path, chowned ? 0o600 : 0o644); } catch {}
  return path;
}
function grokCliArgs(promptFile: string, format: "plain" | "streaming-json", adapter = false): string[] {
  const args = [
    "--prompt-file", promptFile,
  ];
  if (adapter) {
    args.push(
      "--verbatim",
      "--disable-web-search",
      "--no-memory",
      "--no-subagents",
      "--max-turns", "1",
    );
  }
  args.push("--output-format", format);
  if (GROK_CLI_MODEL) args.push("-m", GROK_CLI_MODEL);
  return args;
}

function grokVisibleDisciplineGuard(): string {
  return [
    "=== GROK USER-VISIBLE DISCIPLINE ===",
    "Default mode is Sifu user answer, not audit/debug.",
    "Use the 13-layer classics process internally, but do not show the checklist, scoring table, or step-by-step method unless the user's current question explicitly asks for audit/debug/method.",
    "Do not claim you are reading/opening files, running tools, using web search, using memory, inspecting a prompt packet, invoking an engine, or seeing backend/CLI internals.",
    "If the original prompt requires ID/TRACE machine headers, output those exact headers first for validation only; never explain, quote, or discuss ID/TRACE in the body.",
    "After any required machine headers, write only the user-facing answer: verdict first, then 3-5 chart/classics evidence points, then practical meaning.",
    "Use user-safe source language: ผังดวง, หลักคัมภีร์, หลักฐานจากเสา/วัยจร/ปีจร. Avoid backend words such as packet, engine, prompt, wrapper, CLI, stdout, cache, retry, FACT LOCK, PILLAR LOCK, or validator in the visible body.",
    "Do not ask for missing birth time, true solar time, or full source text unless the answer materially depends on that ambiguity; if so, state the specific affected judgment.",
    "Keep the classics hierarchy intact: locked chart facts first; strict classics/canonical rules win inside their scope; packet/runtime interactions are evidence and provenance, not a replacement for the classics.",
    "=== END GROK USER-VISIBLE DISCIPLINE ===",
  ].join("\n");
}

function buildGrokCliPrompt(prompt: string, attempt: number): string {
  const retry = attempt > 1
    ? [
        "",
        "RETRY_NOTE:",
        "The previous Grok CLI attempt did not produce a valid plain-text final answer.",
        "Return only the final answer now. Do not call any tool or inspect any file.",
      ].join("\n")
    : "";
  return [
    "=== GROK CLI TEXT-ONLY ADAPTER ===",
    "You are invoked non-interactively by /api/sifu.",
    "Do not call tools, read files, run shell commands, use web search, use memory, or start subagents.",
    "Use only the complete Sifu context below, including its classics hierarchy and structured evidence rules, as the source of truth.",
    "Return only final answer text through the CLI output. Preserve any required ID/TRACE output protocol from the prompt as the first lines.",
    grokVisibleDisciplineGuard(),
    retry,
    "=== ORIGINAL SIFU CONTEXT START ===",
    prompt,
    "=== ORIGINAL SIFU CONTEXT END ===",
  ].filter(Boolean).join("\n");
}

async function runGrokCliAttempt(prompt: string, attempt: number, timeoutMs = TIMEOUT_MS, signal?: AbortSignal, adapter = false): Promise<string> {
  let promptFile = "";
  try {
    promptFile = writeGrokPromptFile(buildGrokCliPrompt(prompt, attempt));
    const pf = promptFile;
    return await new Promise<string>((resolve, reject) => {
      const spawnArgs = ["-u", CHILD_USER, "-H", GROK_BIN, ...grokCliArgs(pf, "plain", adapter)];
      const c = spawn("sudo", spawnArgs, { cwd: GROK_CWD, env: process.env });
      let out = "";
      let err = "";
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        try { c.kill("SIGKILL"); } catch {}
        fail(new Error("aborted"));
      };
      const timer = setTimeout(() => {
        try { c.kill("SIGKILL"); } catch {}
        fail(new Error("timeout"));
      }, timeoutMs);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
      c.stdout.on("data", chunk => { out += chunk.toString(); });
      c.stderr.on("data", chunk => { err += chunk.toString(); });
      c.on("error", e => {
        fail(new Error(`grok spawn error · ${grokErrorMessage(String(e?.message || e))}`));
      });
      c.on("close", code => {
        if (settled) return;
        settled = true;
        cleanup();
        if (code === 0 && out.trim()) resolve(out.trim());
        else {
          const detail = [err, out ? `stdout=${out.slice(0, 300)}` : ""].filter(Boolean).join("\n");
          reject(new Error(`grok exit ${code} · ${grokErrorMessage(detail)}`));
        }
      });
    });
  } finally {
    if (promptFile) { try { rmSync(promptFile, { force: true }); } catch {} }
  }
}

async function runClaudeCli(prompt: string, signal?: AbortSignal): Promise<string> {
  dumpPromptIfDebug(prompt, "cli");
  if (signal?.aborted) throw new Error("aborted");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  try {
  if (signal?.aborted) throw new Error("aborted");
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
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      try { c.kill("SIGKILL"); } catch {}
      fail(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      fail(new Error("timeout"));
    }, TIMEOUT_MS);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    c.stdout.on("data", chunk => { out += chunk.toString(); });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) resolve(out.trim());
      else {
        const detail = [err, out ? `stdout=${out.slice(0, 300)}` : ""].filter(Boolean).join("\n");
        reject(new Error(`claude exit ${code} · ${claudeErrorMessage(detail)}`));
      }
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
  } finally {
    releaseSifuSlot();
  }
}

async function runCodexCli(prompt: string, signal?: AbortSignal): Promise<string> {
  dumpPromptIfDebug(prompt, "codex");
  if (signal?.aborted) throw new Error("aborted");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  try {
  if (signal?.aborted) throw new Error("aborted");
  return await new Promise<string>((resolve, reject) => {
    const spawnArgs = ["-u", CHILD_USER, "-H", "codex", ...codexCliArgs()];
    const c = spawn("sudo", spawnArgs, {
      cwd: "/tmp",
      env: process.env,
    });
    let rawOut = "";
    let finalText = "";
    let err = "";
    let lineBuf = "";
    let settled = false;
    const decoder = new StringDecoder("utf8");
    const parseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
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
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      try { c.kill("SIGKILL"); } catch {}
      fail(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      fail(new Error("timeout"));
    }, TIMEOUT_MS);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    c.stdout.on("data", chunk => {
      const text = decoder.write(chunk);
      rawOut += text;
      lineBuf += text;
      let nl;
      while ((nl = lineBuf.indexOf("\n")) !== -1) {
        parseLine(lineBuf.slice(0, nl));
        lineBuf = lineBuf.slice(nl + 1);
      }
    });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      if (settled) return;
      settled = true;
      cleanup();
      const tail = (lineBuf + decoder.end()).trim();
      if (tail) parseLine(tail);
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

async function runGrokCli(prompt: string, signal?: AbortSignal, adapter = false): Promise<string> {
  dumpPromptIfDebug(buildGrokCliPrompt(prompt, 1), "grok");
  if (signal?.aborted) throw new Error("aborted");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  try {
    if (signal?.aborted) throw new Error("aborted");
    let lastErr: Error | null = null;
    const deadline = Date.now() + TIMEOUT_MS;
    const maxAttempts = adapter ? GROK_MAX_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 1_000) break;
      try {
        return await runGrokCliAttempt(prompt, attempt, remainingMs, signal, adapter);
      } catch (e) {
        lastErr = e as Error;
        if (signal?.aborted || lastErr.message === "aborted") throw lastErr;
        if (attempt < maxAttempts && deadline - Date.now() > 1_000) {
          console.warn(`[sifu] grok attempt ${attempt}/${maxAttempts} failed: ${grokErrorMessage(lastErr.message)} · retry`);
        }
      }
    }
    throw lastErr || new Error("grok cli failed");
  } finally {
    releaseSifuSlot();
  }
}

type GeminiPart = { text?: unknown };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

function buildGeminiApiPrompt(prompt: string): string {
  return `${prompt}

=== GEMINI API RAW-DATA ADAPTER ===
Use the complete prompt packet above as raw chart data and calculation evidence.
Do not invent stems, branches, interactions, luck cycles, or profile facts that are not in the packet.
Classical/canonical sources in the prompt are the interpretive source of truth inside their scope.
The packet prevents wrong-chart hallucination; it is not a checklist that forces your conclusion or wording.
Do not add internal ID/TRACE lines, JSON, code fences, or marker words just to satisfy a checker.
Answer naturally in the requested language with the best judgment you can make from classics + chart facts + packet evidence.
=== END GEMINI API RAW-DATA ADAPTER ===`;
}

async function runGeminiApi(prompt: string, signal?: AbortSignal): Promise<string> {
  const modelPrompt = buildGeminiApiPrompt(prompt);
  dumpPromptIfDebug(modelPrompt, "gemini-api");
  const key = geminiApiKey();
  if (!key) {
    throw new Error("gemini_api_key_missing · set GEMINI_API_KEY or GOOGLE_API_KEY");
  }
  if (signal?.aborted) throw new Error("aborted");
  const _slotOk = await acquireSifuSlot();
  if (!_slotOk) throw new Error("sifu_busy · ระบบกำลังประมวลผลคำถามจำนวนมาก");
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal?.aborted) ac.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const modelPath = GEMINI_API_MODEL.startsWith("models/") ? GEMINI_API_MODEL : `models/${GEMINI_API_MODEL}`;
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`);
    url.searchParams.set("key", key);
    const generationConfig: Record<string, unknown> = {
      temperature: 0.35,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    };
    if (typeof GEMINI_THINKING_BUDGET === "number" && Number.isFinite(GEMINI_THINKING_BUDGET)) {
      generationConfig.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
    }
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: modelPrompt }] }],
        generationConfig,
      }),
      signal: ac.signal,
      cache: "no-store",
    });
    const raw = await r.text();
    let data: GeminiResponse = {};
    try { data = raw ? JSON.parse(raw) as GeminiResponse : {}; } catch {}
    if (!r.ok) {
      throw new Error(`gemini ${r.status} · ${data.error?.message || raw.slice(0, 300)}`);
    }
    const finishReason = data.candidates?.[0]?.finishReason || "";
    const out = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (!out) {
      const reason = data.promptFeedback?.blockReason || finishReason || "no_text";
      throw new Error(`gemini empty · ${reason}`);
    }
    if (finishReason === "MAX_TOKENS") {
      throw new Error(`gemini_truncated · ${finishReason}`);
    }
    return out;
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") throw new Error(signal?.aborted ? "aborted" : "gemini timeout");
    throw new Error(geminiErrorMessage(err.message || String(e)));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    releaseSifuSlot();
  }
}

async function runSifuCli(prompt: string, model: SifuModel, signal?: AbortSignal, opts?: { fusionInternal?: boolean }): Promise<string> {
  if (model === "codex-cli") return runCodexCli(prompt, signal);
  if (model === "grok-cli") return runGrokCli(prompt, signal, opts?.fusionInternal === true);
  if (model === "gemini-api") return runGeminiApi(prompt, signal);
  return runClaudeCli(prompt, signal);
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

function spawnGrokStreaming(prompt: string) {
  const grokPrompt = buildGrokCliPrompt(prompt, 1);
  dumpPromptIfDebug(grokPrompt, "grok-stream");
  const promptFile = writeGrokPromptFile(grokPrompt);
  const spawnArgs = ["-u", CHILD_USER, "-H", GROK_BIN, ...grokCliArgs(promptFile, "streaming-json")];
  const c = spawn("sudo", spawnArgs, { cwd: GROK_CWD, env: process.env });
  // self-cleanup ไฟล์ prompt ชั่วคราว (caller ไม่รู้จัก promptFile)
  const cleanup = () => { try { rmSync(promptFile, { force: true }); } catch {} };
  c.on("close", cleanup);
  c.on("error", cleanup);
  return c;
}

function spawnSifuStreaming(prompt: string, model: SifuModel) {
  if (model === "codex-cli") return spawnCodexStreaming(prompt);
  if (model === "grok-cli") return spawnGrokStreaming(prompt);
  if (model === "gemini-api") throw new Error("gemini_stream_not_supported");
  return spawnClaudeStreaming(prompt);
}

/* Parser · แยก JSON line-by-line · ดึง text content จาก stream-json */
function makeJsonlParser(onText: (text: string) => void) {
  let buf = "";
  let emittedAny = false;
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
          emittedAny = true;
          onText(obj.event.delta.text);
        } else if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
          // compact/fast answers may arrive as final-only without partial deltas.
          // Use it only when no partial text was emitted, otherwise it duplicates the whole answer.
          if (!emittedAny) {
            const finalText = obj.message.content
              .map((part: { type?: string; text?: string }) => part?.type === "text" ? part.text || "" : "")
              .join("");
            if (finalText) {
              emittedAny = true;
              onText(finalText);
            }
          }
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

// grok streaming-json: {"type":"text","data":"..."}=คำตอบ · "thought"=reasoning(ข้าม) · "end"=จบ · "error"=ผิดพลาด
function makeGrokJsonlParser(onText: (text: string) => void, onError: (text: string) => void) {
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
        if (obj.type === "text" && typeof obj.data === "string") {
          onText(obj.data);
        } else if (obj.type === "error" && obj.data) {
          onError(typeof obj.data === "string" ? obj.data : JSON.stringify(obj.data));
        }
        // type "thought" (reasoning) + "end" → ข้าม
      } catch {
        // not JSON · skip
      }
    }
  };
}

function makeSifuCliParser(
  model: SifuModel,
  onText: (text: string) => void,
  onError: (text: string) => void
) {
  if (model === "codex-cli") return makeCodexJsonlParser(onText, onError);
  if (model === "grok-cli") return makeGrokJsonlParser(onText, onError);
  return makeJsonlParser(onText);
}

const SIFU_WAITING_PHASES = [
  "waiting_context",
  "waiting_classics",
  "waiting_transits",
  "waiting_interactions",
  "waiting_reasoning",
];
const SIFU_STREAM_GUARD_TIMEOUT_MS = 4500;

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

async function streamOpenRouter(prompt: string, onText: (text: string) => boolean | void): Promise<{ full: string; model: string }> {
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
              const keepGoing = onText(text);
              if (keepGoing === false) {
                try { await reader.cancel(); } catch {}
                try { ac.abort(); } catch {}
                return { full: full.trim(), model: INTRO_OPENROUTER_MODEL };
              }
              full += text;
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
    const parsedBody = await req.json().catch(() => ({}));
    const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? parsedBody as Record<string, unknown>
      : {};
    const message = String(body.message || "").trim();
    const rawHistory: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const profileId = cleanProfileId(body.profileId);
    const threadProfileId = cleanProfileId(body.threadProfileId || body.historyProfileId);
    const topic = typeof body.topic === "string" ? body.topic : undefined;
    const lang = ["th", "en", "zh"].includes(String(body.lang)) ? String(body.lang) : "th";
    const mode = body.mode === "intro" ? "intro" : undefined;
    const sifuModel = resolveSifuModel(body.model);
    const isFusionInternalCall = isTrustedFusionInternalCall(req);
    const fusionPacketAuditOnly = isFusionInternalCall && body.fusionPacketMode === "raw-data";
    const threadId = cleanSifuThreadId(body.threadId);
    const fusionRunId = isFusionInternalCall ? cleanSifuThreadId(body.fusionRunId || body.fusion_run_id) : null;
    const noCache = body.noCache === true || body.no_cache === true;

    if (!message) {
      return NextResponse.json({ error: "no message" }, { status: 400 });
    }
    const maxMessageChars = isFusionInternalCall ? SIFU_FUSION_INTERNAL_MESSAGE_MAX_CHARS : SIFU_DIRECT_MESSAGE_MAX_CHARS;
    if (message.length > maxMessageChars) {
      return NextResponse.json({ error: "message too long" }, { status: 400 });
    }

    /* 🔐 session → org · ดวงที่ถามได้ต้องอยู่ใน org เดียวกับผู้ login (ดวงตัวเอง+ญาติในบัญชี) · กันอ่านข้ามบัญชี */
    const session = await getSession();
    /* 1 มิ.ย. · AI ดูดวงต้องสมัคร/login ก่อน (เจ้านายสั่ง · ตัด guest intro) */
    if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
    if (sifuModel === "gemini-api" && !isFusionInternalCall) {
      return NextResponse.json({ error: "model_not_available_on_master" }, { status: 400 });
    }
    const orgId = session?.orgId ?? null;

    // เครดิต "ยาม": จอง 1 ยาม atomic ก่อนสร้างคำตอบ (บล็อกยอด 0 + กัน race) · ข้าม fusion-internal · หักจริงตามตัวอักษรหลังได้คำตอบ
    if (!isFusionInternalCall && session?.userId) {
      const rsv = await reserveHourForUser(session.userId, "sifu_master");
      if (!rsv.ok) return NextResponse.json({ error: "insufficient_hours" }, { status: 402 });
    }

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
    const useCache = mode !== "intro" && !noCache;
    const cached = useCache ? await getCachedReply(key) : null;
    if (cached) {
      const safeCachedReply = sanitizeModelVisibleReply(cached.reply, ctx, cached.model || sifuModel, message);
      const cachedCritical = checkSifuCriticalEvidence(safeCachedReply, message, ctx, { hasPacket: !!extractExpectedDM(ctx) });
      const cachedFactClaim = checkSifuFactClaimGate(safeCachedReply, ctx);
      if (!safeCachedReply.trim()) {
        console.warn("[sifu] cache bypass: empty visible reply");
      } else if (!cachedCritical.ok) {
        console.warn(`[sifu] cache bypass: critical evidence stale (${cachedCritical.missing.map((m) => m.code).join(",")})`);
      } else if (!cachedFactClaim.ok) {
        console.warn(`[sifu] cache bypass: fact claim stale (${cachedFactClaim.violations.map((v) => v.code).join(",")})`);
      } else {
      const answerSupportedBy = buildSifuAnswerSupportAudit(safeCachedReply, cachedCritical);
      const auditPromptT0 = Date.now();
      const auditPrompt = buildPrompt({ ctx, message, history, topic, lang, mode, compactKnowledge: shouldUseCompactKnowledge(sifuModel) });
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
        answer: safeCachedReply,
        answerSupportedBy,
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
        answer: safeCachedReply,
        history,
        requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, fusion_run_id: fusionRunId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
        responseMeta: { cache_key: key.slice(0, 8), context_cache: contextCache, thread_id: threadId, fusion_run_id: fusionRunId, audit_quality: audit.auditQuality, packet_hash: audit.packetHash, prompt_hash: audit.promptHash },
        model: cached.model,
        durationMs: Date.now() - reqT0,
        cached: true,
        ...audit,
      });
      sifuTimingLog("reply-cache-hit", {
        route: "POST", mode, stream: false, profileId: profileId || undefined, contextCache, ctxMs,
        promptMs: auditPromptMs, promptChars: auditPrompt.length, totalMs: Date.now() - reqT0, cached: true,
      });
      return NextResponse.json({ ...cached, reply: safeCachedReply, cached: true, key: key.slice(0, 8) });
      }
    }
    /* ⚠️ ส่ง history จริงเข้า prompt (ไม่ใช่ history:[] แบบ GET) · คำตอบต้องจำบทสนทนา */
    const promptT0 = Date.now();
    let prompt = buildPrompt({ ctx, message, history, topic, lang, mode, compactKnowledge: shouldUseCompactKnowledge(sifuModel) });
    if (fusionPacketAuditOnly) prompt += fusionRawPacketPolicyText();
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
          let grokVisibleBuf = "";
          let firstChunkSent = false;
          let firstMs: number | null = null;
          let firstDeltaSeen = false;
          let stopHeartbeat: (() => void) | null = null;
          const t0 = Date.now();
          /* identity-lock: buffer บรรทัดแรก (⟦ID⟧日干=X⟧) เทียบ 日干 · ผิด/ไม่มี=ตัด stream (ไม่ retry · master ให้ถามใหม่) */
          const expectedDM = extractExpectedDM(ctx);
          /* trace-lock (13 มิ.ย. เคส潤下格): ดวงเดี่ยวบังคับบรรทัด ⟦TRACE⟧從·格局·用神⟧ เทียบกับบรรทัดโครงดวงจริง · intro ไม่มีกฎ TRACE → ข้าม */
          const traceFacts = mode !== "intro" ? extractTraceFacts(ctx) : null;
          let idBuf = "", idChecked = false, idRejected = false;
          let streamIdentityResult = expectedDM ? "stream_pending" : "not_required";
          let streamTraceResult = traceFacts ? "stream_pending" : "not_required";
          let guardTimer: ReturnType<typeof setTimeout> | null = null;
          const clearGuardTimer = () => {
            if (!guardTimer) return;
            clearTimeout(guardTimer);
            guardTimer = null;
          };
          const safeClose = () => {
            if (closed) return;
            closed = true;
            clearGuardTimer();
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
            if (expectedDM && !idChecked) return "stream_guard";
            if (!firstChunkSent) return "waiting_visible_chunk";
            return "streaming";
          });
          /* 2 มิ.ย. · เข้าคิว slot ก่อน spawn · ถ้าเต็มเกิน MAX_QUEUE → เด้ง safety · heartbeat ข้างบนส่ง ping ระหว่างรอคิว user จึงไม่เห็นค้าง */
          const _slotOk = await acquireSifuSlot();
          if (!_slotOk) { send("error", { error: "ระบบกำลังประมวลผลคำถามจำนวนมาก · กรุณาลองใหม่ใน 1-2 นาที" }); safeClose(); return; }
          let _slotReleased = false;
          const releaseSlotOnce = () => { if (!_slotReleased) { _slotReleased = true; releaseSifuSlot(); } };
          let child: ReturnType<typeof spawnSifuStreaming>;
          try { child = spawnSifuStreaming(prompt, sifuModel); }
          catch (e) {
            releaseSlotOnce();
            send("error", { error: cliErrorMessage(sifuModel, String((e as Error)?.message || e)) });
            safeClose();
            return;
          }
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
          const emitVisible = (text: string) => {
            if (sifuModel === "grok-cli") {
              grokVisibleBuf += text;
              const lastNl = Math.max(grokVisibleBuf.lastIndexOf("\n"), grokVisibleBuf.lastIndexOf("\r"));
              if (lastNl === -1) return;
              const ready = grokVisibleBuf.slice(0, lastNl + 1);
              grokVisibleBuf = grokVisibleBuf.slice(lastNl + 1);
              const visible = sanitizeGrokUserVisibleText(ready, message);
              if (!visible) return;
              const candidate = full + visible;
              const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
              if (!liveFactClaim.ok) {
                console.error(`[sifu] stream fact claim FAIL (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
                clearTimeout(killTimer);
                try { child.kill("SIGKILL"); } catch {}
                send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
                safeClose();
                return;
              }
              full = candidate;
              sendFirstOnce();
              send("chunk", { text: visible });
              return;
            }
            const visible = text;
            if (!visible) return;
            const candidate = full + visible;
            const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
            if (!liveFactClaim.ok) {
              console.error(`[sifu] stream fact claim FAIL (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
              clearTimeout(killTimer);
              try { child.kill("SIGKILL"); } catch {}
              send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
              safeClose();
              return;
            }
            full = candidate;
            sendFirstOnce();
            send("chunk", { text: visible });
          };
          const flushVisible = () => {
            if (sifuModel !== "grok-cli" || !grokVisibleBuf) return;
            const visible = sanitizeGrokUserVisibleText(grokVisibleBuf, message);
            grokVisibleBuf = "";
            if (!visible) return;
            const candidate = full + visible;
            const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
            if (!liveFactClaim.ok) {
              console.error(`[sifu] stream fact claim FAIL on flush (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
              clearTimeout(killTimer);
              try { child.kill("SIGKILL"); } catch {}
              send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
              safeClose();
              return;
            }
            full = candidate;
            sendFirstOnce();
            send("chunk", { text: visible });
          };
          const releaseStreamGuard = (reason: string): string | null => {
            if (idChecked || idRejected) return null;
            clearGuardTimer();
            const nl = idBuf.indexOf("\n");
            const idCheck = validateIdentity(nl === -1 ? idBuf : idBuf.slice(0, nl) + "\n", expectedDM);
            if (idCheck.reason === "dm_mismatch") {
              console.error(`[sifu] stream identity dm_mismatch (expect=${expectedDM} got=${idCheck.parsedDM})`);
              rejectId("dm_mismatch");
              return null;
            }
            const traceCheck = validateTrace(idBuf, traceFacts);
            streamIdentityResult = expectedDM ? (idCheck.ok ? "pass" : `stream_soft_${idCheck.reason}`) : "not_required";
            streamTraceResult = traceFacts ? (traceCheck.ok ? "pass" : `stream_soft_${traceCheck.reason}`) : "not_required";
            if (streamIdentityResult !== "pass" || (traceFacts && streamTraceResult !== "pass")) {
              console.warn(`[sifu] stream guard soft-release reason=${reason} profile=${profileId || "-"} identity=${streamIdentityResult} trace=${streamTraceResult}`);
            }
            idChecked = true;
            return sanitizeSifuStreamVisible(idBuf, ctx);
          };
          const scheduleStreamGuardTimeout = () => {
            if (guardTimer || idChecked || idRejected) return;
            guardTimer = setTimeout(() => {
              guardTimer = null;
              const startsInternal = /^\s*⟦(?:ID|TRACE)⟧/.test(idBuf);
              const hasLineBreak = idBuf.includes("\n");
              if (startsInternal && !hasLineBreak && !sanitizeSifuStreamVisible(idBuf, ctx).trim()) return;
              const rest = releaseStreamGuard("timeout");
              if (rest !== null) emitVisible(rest);
            }, SIFU_STREAM_GUARD_TIMEOUT_MS);
            (guardTimer as unknown as { unref?: () => void }).unref?.();
          };
          const rejectId = (reason: string) => {
            idRejected = true;
            clearGuardTimer();
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
              scheduleStreamGuardTimeout();
              const nl = idBuf.indexOf("\n");
              if (nl !== -1) {
                const chk = validateIdentity(idBuf.slice(0, nl) + "\n", expectedDM);
                if (chk.reason === "dm_mismatch") { rejectId(chk.reason); return; }
              }
              const hasTrace = !traceFacts || !!parseTraceLine(idBuf);
              const visibleHead = sanitizeSifuStreamVisible(idBuf, ctx);
              const nlCount = (idBuf.match(/\n/g) || []).length;
              if (hasTrace || visibleHead.trim() || nlCount >= 3 || idBuf.length > 500) {
                const rest = releaseStreamGuard(hasTrace ? "trace_seen" : "visible_or_limit");
                if (rest !== null) emitVisible(rest);
              }
              return;
            }
            let visibleText = sanitizeSifuStreamVisible(text, ctx);
            visibleText = stripTraceLine(stripIdLine(visibleText));
            emitVisible(visibleText);
          }, (text) => {
            cliErr += "\n" + text;
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            cliErr += text;
            console.warn("[sifu sse stderr]", text.slice(0, 200));
          });
          child.on("close", async (code) => {
            releaseSlotOnce();
            activeChild = null;
            clearTimeout(killTimer);
            if (idRejected) { safeClose(); return; } // ตัดไปแล้วจาก identity-lock
            const ms = Date.now() - t0;
            if (expectedDM && !idChecked && idBuf) {
              const rest = releaseStreamGuard("close");
              if (rest !== null) emitVisible(rest);
            }
            flushVisible();
            if (idRejected) { safeClose(); return; }
            if (expectedDM && !idChecked) { // AI ตอบจบโดยไม่มี text ให้ปล่อย
              console.error(`[sifu] stream guard empty on close (expect=${expectedDM})`);
              send("error", { error: "identity_mismatch", reason: "no_visible_text" });
              safeClose(); return;
            }
            if (code === 0 && full.trim()) {
              let finalReply = full.trim(); // full = strip ID/TRACE แล้ว (idBuf ไม่เข้า full)
              const finalRawForAudit = idBuf;
              const finalCritical = checkSifuCriticalEvidence(finalReply, message, ctx, { hasPacket: !!expectedDM });
              const finalFactClaim = checkSifuFactClaimGate(finalReply, ctx);
              if (!finalFactClaim.ok) {
                console.error(`[sifu] stream fact claim FAIL on close (${finalFactClaim.violations.map((v) => v.code).join(",")})`);
                send("error", { error: "fact_claim_mismatch", violations: finalFactClaim.violations });
                safeClose();
                return;
              }
              if (!finalCritical.ok) {
                console.warn(`[sifu] critical-evidence incomplete (stream audit-only) profile=${profileId || "-"} missing=${finalCritical.missing.map((m) => m.code).join(",")}`);
              }
              const streamGuard = buildSifuStreamGuardMeta(streamIdentityResult, streamTraceResult);
              const answerSupportedBy = { ...buildSifuAnswerSupportAudit(finalReply, finalCritical), streamGuard };
          const payload: SifuPayload = { reply: finalReply, model: sifuModel, provider_model: providerModelName(sifuModel) };
              /* HK_SIFU_EVIDENCE_TRACE_V1 — log-only (stream ส่งครบแล้ว · ไม่ retry/ไม่ตัด · try-catch กัน uncaught ใน ReadableStream) */
              let evTrace: ReturnType<typeof checkSifuEvidenceTrace> | null = null;
              try {
                evTrace = checkSifuEvidenceTrace(payload.reply, message, !!expectedDM);
                if (!evTrace.ok) console.warn(`[sifu] evidence-trace incomplete (stream) profile=${profileId || "-"} missing=${evTrace.missing.join(",")}`);
              } catch { /* log-only · ห้ามให้กระทบ stream ที่ส่งครบแล้ว */ }
              if (useCache && finalCritical.ok && streamGuard.cacheable) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
              if (!isFusionInternalCall && session?.userId) drainHoursByCharsForUser(session.userId, payload.reply.length, "sifu_master").catch(() => {}); // หักยามตามตัวอักษร (POST stream)
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
                claimedSrc: parseClaimedSources(finalRawForAudit),
                ctx,
                message,
                history,
                prompt,
                answer: payload.reply,
                answerSupportedBy,
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
                requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, fusion_run_id: fusionRunId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
                responseMeta: { stream: true, cache_key: key.slice(0, 8), context_cache: contextCache, chars: full.length, thread_id: threadId, fusion_run_id: fusionRunId, evidence_trace: evTrace, critical_evidence: finalCritical, stream_guard: streamGuard },
                model: payload.model,
                durationMs: Date.now() - reqT0,
                cached: false,
                ...auditFor(streamIdentityResult),
              });
              if (!firstChunkSent) {
                sendFirstOnce();
                send("chunk", { text: payload.reply });
              }
              send("done", { ms, model: payload.model, cached: false, chars: payload.reply.length });
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
          /* Mobile: พับจอ/สลับแอปตัด SSE · อย่า kill CLI — ให้รันจบแล้วบันทึก DB · client กลับมา syncServerHistory */
          console.warn("[sifu] stream client disconnected · CLI continues in background");
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
    const traceFacts = mode !== "intro" ? extractTraceFacts(ctx) : null; // trace-lock (13 มิ.ย. เคส潤下格) · ดวงเดี่ยว Q&A เท่านั้น (intro ไม่มีกฎ TRACE)
    const hardGate = !fusionPacketAuditOnly;
    const minVisibleReplyChars = fusionPacketAuditOnly ? SIFU_FUSION_MIN_VISIBLE_REPLY_CHARS : SIFU_MIN_VISIBLE_REPLY_CHARS;
    let reply = await runSifuCli(prompt, sifuModel, req.signal, { fusionInternal: isFusionInternalCall });
    if (isFusionInternalCall && hardGate && sifuModel === "grok-cli") reply = normalizeSifuMachineHeader(reply, expectedDM, traceFacts);
    let idCheck = validateIdentity(reply, expectedDM);
    let trCheck = validateTrace(reply, traceFacts);
    let criticalCheck = checkSifuCriticalEvidence(stripTraceLine(stripIdLine(reply)), message, ctx, { hasPacket: !!expectedDM });
    let visibleReply = sanitizeModelVisibleReply(reply, ctx, sifuModel, message).trim();
    let tooShortVisible = !!visibleReply && visibleReply.length < minVisibleReplyChars;
    let factClaimCheck = checkSifuFactClaimGate(visibleReply, ctx);
    if (shouldRepairGrokMachineHeader({ model: sifuModel, hardGate, expectedDM, idCheck, trCheck, criticalCheck, visibleReply })) {
      reply = normalizeSifuMachineHeader(reply, expectedDM, traceFacts);
      idCheck = validateIdentity(reply, expectedDM);
      trCheck = validateTrace(reply, traceFacts);
      criticalCheck = checkSifuCriticalEvidence(stripTraceLine(stripIdLine(reply)), message, ctx, { hasPacket: !!expectedDM });
      visibleReply = sanitizeModelVisibleReply(reply, ctx, sifuModel, message).trim();
      tooShortVisible = !!visibleReply && visibleReply.length < minVisibleReplyChars;
      factClaimCheck = checkSifuFactClaimGate(visibleReply, ctx);
    }
    const needsRetry = hardGate
      ? !idCheck.ok || !trCheck.ok || !criticalCheck.ok || !factClaimCheck.ok
      : !visibleReply || tooShortVisible || !factClaimCheck.ok;
    if (needsRetry) {
      console.warn(`[sifu] gate fail id=${idCheck.reason} trace=${trCheck.reason} critical=${criticalCheck.missing.map((m) => m.code).join(",") || "ok"} fact=${factClaimCheck.violations.map((v) => v.code).join(",") || "ok"} empty=${!visibleReply} short=${tooShortVisible ? visibleReply.length : 0} (expect=${expectedDM} got=${idCheck.parsedDM} traceGeju=${trCheck.parsed?.geju || "-"}) · retry`);
      reply = await runSifuCli(buildSifuGateRetryPrompt({
        prompt,
        expectedDM,
        traceFacts,
        idReason: idCheck.reason,
        traceReason: trCheck.reason,
        critical: criticalCheck,
        factClaim: factClaimCheck,
        emptyVisible: !visibleReply,
        tooShortVisible,
        minVisibleReplyChars,
        criticalHardGate: hardGate,
      }), sifuModel, req.signal, { fusionInternal: isFusionInternalCall });
      if (isFusionInternalCall && hardGate && sifuModel === "grok-cli") reply = normalizeSifuMachineHeader(reply, expectedDM, traceFacts);
      idCheck = validateIdentity(reply, expectedDM);
      trCheck = validateTrace(reply, traceFacts);
      criticalCheck = checkSifuCriticalEvidence(stripTraceLine(stripIdLine(reply)), message, ctx, { hasPacket: !!expectedDM });
      visibleReply = sanitizeModelVisibleReply(reply, ctx, sifuModel, message).trim();
      tooShortVisible = !!visibleReply && visibleReply.length < minVisibleReplyChars;
      factClaimCheck = checkSifuFactClaimGate(visibleReply, ctx);
      if (shouldRepairGrokMachineHeader({ model: sifuModel, hardGate, expectedDM, idCheck, trCheck, criticalCheck, visibleReply })) {
        reply = normalizeSifuMachineHeader(reply, expectedDM, traceFacts);
        idCheck = validateIdentity(reply, expectedDM);
        trCheck = validateTrace(reply, traceFacts);
        criticalCheck = checkSifuCriticalEvidence(stripTraceLine(stripIdLine(reply)), message, ctx, { hasPacket: !!expectedDM });
        visibleReply = sanitizeModelVisibleReply(reply, ctx, sifuModel, message).trim();
        tooShortVisible = !!visibleReply && visibleReply.length < minVisibleReplyChars;
        factClaimCheck = checkSifuFactClaimGate(visibleReply, ctx);
      }
    }
    if (hardGate) {
      if (!idCheck.ok) {
        console.error(`[sifu] identity FAIL after retry (expect=${expectedDM} got=${idCheck.parsedDM})`);
        return NextResponse.json({ error: "identity_mismatch" }, { status: 502 });
      }
      if (!trCheck.ok) {
        console.error(`[sifu] trace FAIL after retry (${trCheck.reason} got=${trCheck.parsed?.geju || "-"}/${trCheck.parsed?.yong || "-"} allow=${traceFacts?.gejuTokens.join("/") || "-"})`);
        return NextResponse.json({ error: "trace_mismatch" }, { status: 502 });
      }
      if (!criticalCheck.ok) {
        console.error(`[sifu] critical evidence FAIL after retry (${criticalCheck.missing.map((m) => m.code).join(",")})`);
        return NextResponse.json({ error: "critical_evidence_mismatch", missing: criticalCheck.missing.map((m) => m.code) }, { status: 502 });
      }
      if (!factClaimCheck.ok) {
        console.error(`[sifu] fact claim FAIL after retry (${factClaimCheck.violations.map((v) => v.code).join(",")})`);
        return NextResponse.json({ error: "fact_claim_mismatch", violations: factClaimCheck.violations }, { status: 502 });
      }
      if (!visibleReply) {
        console.error("[sifu] empty visible reply after retry");
        return NextResponse.json({ error: "empty_reply_after_sanitize" }, { status: 502 });
      }
    } else {
      if (!visibleReply) {
        console.error("[sifu] empty visible reply after fusion audit-only retry");
        return NextResponse.json({ error: "empty_reply_after_sanitize" }, { status: 502 });
      }
      if (tooShortVisible) {
        console.error(`[sifu] short visible reply after fusion retry (${visibleReply.length}/${minVisibleReplyChars})`);
        return NextResponse.json({ error: "short_reply_after_retry" }, { status: 502 });
      }
      if (!factClaimCheck.ok) {
        console.error(`[sifu] fact claim FAIL after fusion retry (${factClaimCheck.violations.map((v) => v.code).join(",")})`);
        return NextResponse.json({ error: "fact_claim_mismatch", violations: factClaimCheck.violations }, { status: 502 });
      }
      if (!idCheck.ok || !trCheck.ok || !criticalCheck.ok || tooShortVisible) {
        console.warn(`[sifu] fusion packet audit-only id=${idCheck.reason} trace=${trCheck.reason} critical=${criticalCheck.missing.map((m) => m.code).join(",") || "ok"} fact=${factClaimCheck.violations.map((v) => v.code).join(",") || "ok"} short=${tooShortVisible ? visibleReply.length : 0}`);
      }
    }
    /* HK_SIFU_EVIDENCE_TRACE_V1 — log-only · วัดว่าคำตอบดูดวงเดิน用神/ปฏิกิริยา/รากครบไหม (ไม่ retry/ไม่ block) */
    let evTrace: ReturnType<typeof checkSifuEvidenceTrace> | null = null;
    try {
      evTrace = checkSifuEvidenceTrace(reply, message, !!expectedDM);
      if (!evTrace.ok) console.warn(`[sifu] evidence-trace incomplete (json) profile=${profileId || "-"} missing=${evTrace.missing.join(",")}`);
    } catch { /* log-only · ห้ามให้กระทบคำตอบ */ }
    const cleanReply = visibleReply;
    const answerSupportedBy = buildSifuAnswerSupportAudit(cleanReply, criticalCheck);
    const ms = Date.now() - t0;
    const payload: SifuPayload = { reply: cleanReply, model: sifuModel, provider_model: providerModelName(sifuModel) };
    if (useCache && hardGate) setCachedReply(key, payload, ms, ajekVersion).catch(() => {}); // cache เฉพาะที่ผ่าน hard gate แล้ว
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
      claimedSrc: parseClaimedSources(reply),
      ctx,
      message,
      history,
      prompt,
      answer: cleanReply,
      answerSupportedBy,
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
      requestPayload: { topic, mode, model: sifuModel, profileId, thread_id: threadId, thread_profile_id: threadProfileId, fusion_run_id: fusionRunId, history_dropped_count: historyDroppedCount, prediction_phase: predictionPhase },
      responseMeta: { stream: false, cache_key: key.slice(0, 8), context_cache: contextCache, chars: payload.reply.length, thread_id: threadId, fusion_run_id: fusionRunId, evidence_trace: evTrace, critical_evidence: criticalCheck, fusion_packet_audit_only: fusionPacketAuditOnly },
      model: payload.model,
      durationMs: Date.now() - reqT0,
      cached: false,
      ...auditFor(hardGate ? "pass" : idCheck.ok ? "fusion_audit_pass" : `fusion_audit_${idCheck.reason}`),
    });
    sifuTimingLog("json-done", {
      route: "POST", mode, stream: false, profileId: profileId || undefined, contextCache, ctxMs,
      promptMs, promptChars: prompt.length, totalMs: Date.now() - reqT0, cached: false,
    });
    if (!isFusionInternalCall && session?.userId) drainHoursByCharsForUser(session.userId, payload.reply.length, "sifu_master").catch(() => {}); // หักยามตามตัวอักษร (non-stream)
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
  if (message.length > SIFU_DIRECT_MESSAGE_MAX_CHARS) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  /* 🔐 session → org · เหมือน POST · กันอ่านดวงข้ามบัญชี */
  const session = await getSession();
  /* 1 มิ.ย. · AI ดูดวงต้องสมัคร/login ก่อน (เจ้านายสั่ง · ตัด guest intro) */
  if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
  if (sifuModel === "gemini-api" && !isTrustedFusionInternalCall(req)) {
    return NextResponse.json({ error: "model_not_available_on_master" }, { status: 400 });
  }
  const orgId = session?.orgId ?? null;
  if (mode !== "intro" && !profileId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }
  if (rawProfileId && !profileId) {
    return NextResponse.json({ error: "invalid_profileId" }, { status: 400 });
  }
  // เครดิต "ยาม": จอง 1 ยาม atomic ก่อนเปิด stream (บล็อกยอด 0 + กัน race) · GET = แชทหลัก (EventSource)
  if (session?.userId) {
    const rsv = await reserveHourForUser(session.userId, "sifu_master");
    if (!rsv.ok) return new Response(JSON.stringify({ error: "insufficient_hours" }), { status: 402, headers: { "Content-Type": "application/json" } });
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
    const safeReply = sanitizeModelVisibleReply(cached.reply, ctx, cached.model || sifuModel, message);
        const cachedCritical = checkSifuCriticalEvidence(safeReply, message, ctx, { hasPacket: !!extractExpectedDM(ctx) });
        const cachedFactClaim = checkSifuFactClaimGate(safeReply, ctx);
        if (!safeReply.trim()) {
          console.warn("[sifu] GET cache bypass: empty visible reply");
        } else if (!cachedCritical.ok) {
          console.warn(`[sifu] GET cache bypass: critical evidence stale (${cachedCritical.missing.map((m) => m.code).join(",")})`);
        } else if (!cachedFactClaim.ok) {
          console.warn(`[sifu] GET cache bypass: fact claim stale (${cachedFactClaim.violations.map((v) => v.code).join(",")})`);
        } else {
        const answerSupportedBy = buildSifuAnswerSupportAudit(safeReply, cachedCritical);
        const auditPromptT0 = Date.now();
        const auditPrompt = buildPrompt({ ctx, message, history: [], topic, lang, mode, compactKnowledge: shouldUseCompactKnowledge(sifuModel) });
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
          answer: safeReply,
          answerSupportedBy,
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
      }

      // 2. Cache miss → spawn Claude + pipe stdout chunk-by-chunk
      const warmup = mode === "intro" ? buildIntroWarmup(ctx) : null;
      const promptT0 = Date.now();
      const promptBase = buildPrompt({ ctx, message, history: [], topic, lang, mode, compactKnowledge: shouldUseCompactKnowledge(sifuModel) });
      const prompt = warmup
        ? `${promptBase}\n\n${loadPromptMd("prompts/sifu-intro-resume-note.md").trim()}`
        : promptBase;
      const promptMs = Date.now() - promptT0;
      send("meta", { cached: false, key: key.slice(0, 8), model: sifuModel, startedAt: Date.now(), timing: { ctxMs, promptMs, promptChars: prompt.length, contextCache } });

      const t0 = Date.now();
      if (mode === "intro") {
        let firstChunkSent = false;
        let introFull = "";
        let introRejected = false;
        const emitIntroChunk = (text: string, provider: string, synthetic = false): boolean => {
          const visible = sanitizePacketEvidenceClaims(text, ctx);
          if (!visible) return true;
          const candidate = introFull + visible;
          const introFactClaim = checkSifuFactClaimGate(candidate, ctx);
          if (!introFactClaim.ok) {
            introRejected = true;
            console.error(`[sifu] intro stream fact claim FAIL (${introFactClaim.violations.map((v) => v.code).join(",")})`);
            send("error", { error: "fact_claim_mismatch", violations: introFactClaim.violations });
            return false;
          }
          introFull = candidate;
          if (!firstChunkSent) {
            send("first", { ms: synthetic ? 0 : Date.now() - t0, synthetic: synthetic || undefined, provider });
            firstChunkSent = true;
          }
          send("chunk", { text: visible });
          return true;
        };
        stopHeartbeat = startSifuHeartbeat(send, (pingCount) => firstChunkSent ? "streaming" : rotatingWaitingPhase(pingCount));
        if (warmup) {
          if (!emitIntroChunk(warmup, "engine", true)) {
            safeClose();
            return;
          }
        }
        try {
          const result = await streamOpenRouter(prompt, (text) => {
            return emitIntroChunk(text, "openrouter");
          });
          if (introRejected) {
            safeClose();
            return;
          }
          if (result.full || introFull) {
            const finalIntroFactClaim = checkSifuFactClaimGate(introFull || result.full, ctx);
            if (!finalIntroFactClaim.ok) {
              send("error", { error: "fact_claim_mismatch", violations: finalIntroFactClaim.violations });
              safeClose();
              return;
            }
            send("done", { ms: Date.now() - t0, model: result.model, provider: "openrouter", cached: false, chars: (introFull || result.full).length });
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
      let c: ReturnType<typeof spawnSifuStreaming>;
      try { c = spawnSifuStreaming(prompt, sifuModel); }
      catch (e) {
        releaseSlotOnceG();
        send("error", { error: cliErrorMessage(sifuModel, String((e as Error)?.message || e)) });
        safeClose();
        return;
      }
      c.on("error", releaseSlotOnceG);
      let full = "";
      let grokVisibleBuf = "";
      let firstChunkSent = false;
      let firstMs: number | null = null;
      let firstDeltaSeen = false;
      /* identity-lock (GET Q&A) · warmup/intro = engine สรุป → skip */
      const expectedDM = warmup ? null : extractExpectedDM(ctx);
      /* trace-lock (13 มิ.ย. เคส潤下格) · ดวงเดี่ยวเท่านั้น (กลุ่ม/เทียบ=หลายโครงดวง → ข้ามอัตโนมัติ) */
      const traceFacts = warmup ? null : extractTraceFacts(ctx);
      let idBuf = "", idChecked = false, idRejected = false;
      let streamIdentityResult = expectedDM ? "stream_pending" : "not_required";
      let streamTraceResult = traceFacts ? "stream_pending" : "not_required";
      let guardTimer: ReturnType<typeof setTimeout> | null = null;
      const clearGuardTimer = () => {
        if (!guardTimer) return;
        clearTimeout(guardTimer);
        guardTimer = null;
      };
      stopHeartbeat = startSifuHeartbeat(send, (pingCount) => {
        if (!firstDeltaSeen) return rotatingWaitingPhase(pingCount);
        if (expectedDM && !idChecked) return "stream_guard";
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
        clearGuardTimer();
        clearTimeout(killTimer);
        try { c.kill("SIGKILL"); } catch {}
        send("error", { error: "identity_mismatch", reason });
        safeClose();
      };
      const sendFirstOnceG = () => {
        if (!firstChunkSent) {
          firstMs = Date.now() - t0;
          firstChunkSent = true;
          send("first", { ms: firstMs, model: sifuModel });
        }
      };
      const emitVisibleG = (text: string) => {
        if (sifuModel === "grok-cli") {
          grokVisibleBuf += text;
          const lastNl = Math.max(grokVisibleBuf.lastIndexOf("\n"), grokVisibleBuf.lastIndexOf("\r"));
          if (lastNl === -1) return;
          const ready = grokVisibleBuf.slice(0, lastNl + 1);
          grokVisibleBuf = grokVisibleBuf.slice(lastNl + 1);
          const visible = sanitizeGrokUserVisibleText(ready, message);
          if (!visible) return;
          const candidate = full + visible;
          const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
          if (!liveFactClaim.ok) {
            console.error(`[sifu] GET stream fact claim FAIL (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
            clearTimeout(killTimer);
            try { c.kill("SIGKILL"); } catch {}
            send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
            safeClose();
            return;
          }
          full = candidate;
          sendFirstOnceG();
          send("chunk", { text: visible });
          return;
        }
        const visible = text;
        if (!visible) return;
        const candidate = full + visible;
        const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
        if (!liveFactClaim.ok) {
          console.error(`[sifu] GET stream fact claim FAIL (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
          clearTimeout(killTimer);
          try { c.kill("SIGKILL"); } catch {}
          send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
          safeClose();
          return;
        }
        full = candidate;
        sendFirstOnceG();
        send("chunk", { text: visible });
      };
      const flushVisibleG = () => {
        if (sifuModel !== "grok-cli" || !grokVisibleBuf) return;
        const visible = sanitizeGrokUserVisibleText(grokVisibleBuf, message);
        grokVisibleBuf = "";
        if (!visible) return;
        const candidate = full + visible;
        const liveFactClaim = checkSifuFactClaimGate(candidate, ctx);
        if (!liveFactClaim.ok) {
          console.error(`[sifu] GET stream fact claim FAIL on flush (${liveFactClaim.violations.map((v) => v.code).join(",")})`);
          clearTimeout(killTimer);
          try { c.kill("SIGKILL"); } catch {}
          send("error", { error: "fact_claim_mismatch", violations: liveFactClaim.violations });
          safeClose();
          return;
        }
        full = candidate;
        sendFirstOnceG();
        send("chunk", { text: visible });
      };
      const releaseStreamGuardG = (reason: string): string | null => {
        if (idChecked || idRejected) return null;
        clearGuardTimer();
        const nl = idBuf.indexOf("\n");
        const idCheck = validateIdentity(nl === -1 ? idBuf : idBuf.slice(0, nl) + "\n", expectedDM);
        if (idCheck.reason === "dm_mismatch") {
          console.error(`[sifu] GET stream identity dm_mismatch (expect=${expectedDM} got=${idCheck.parsedDM})`);
          rejectIdG("dm_mismatch");
          return null;
        }
        const traceCheck = validateTrace(idBuf, traceFacts);
        streamIdentityResult = expectedDM ? (idCheck.ok ? "pass" : `stream_soft_${idCheck.reason}`) : "not_required";
        streamTraceResult = traceFacts ? (traceCheck.ok ? "pass" : `stream_soft_${traceCheck.reason}`) : "not_required";
        if (streamIdentityResult !== "pass" || (traceFacts && streamTraceResult !== "pass")) {
          console.warn(`[sifu] GET stream guard soft-release reason=${reason} profile=${profileId || "-"} identity=${streamIdentityResult} trace=${streamTraceResult}`);
        }
        idChecked = true;
        return sanitizeSifuStreamVisible(idBuf, ctx);
      };
      const scheduleStreamGuardTimeoutG = () => {
        if (guardTimer || idChecked || idRejected) return;
        guardTimer = setTimeout(() => {
          guardTimer = null;
          const startsInternal = /^\s*⟦(?:ID|TRACE)⟧/.test(idBuf);
          const hasLineBreak = idBuf.includes("\n");
          if (startsInternal && !hasLineBreak && !sanitizeSifuStreamVisible(idBuf, ctx).trim()) return;
          const rest = releaseStreamGuardG("timeout");
          if (rest !== null) emitVisibleG(rest);
        }, SIFU_STREAM_GUARD_TIMEOUT_MS);
        (guardTimer as unknown as { unref?: () => void }).unref?.();
      };
      let cliErr = "";
      const parser = makeSifuCliParser(sifuModel, (text: string) => {
        firstDeltaSeen = true;
        if (idRejected) return;
        if (expectedDM && !idChecked) {
          idBuf += text;
          scheduleStreamGuardTimeoutG();
          const nl = idBuf.indexOf("\n");
          if (nl !== -1) {
            const chk = validateIdentity(idBuf.slice(0, nl) + "\n", expectedDM);
            if (chk.reason === "dm_mismatch") { rejectIdG(chk.reason); return; }
          }
          const hasTrace = !traceFacts || !!parseTraceLine(idBuf);
          const visibleHead = sanitizeSifuStreamVisible(idBuf, ctx);
          const nlCount = (idBuf.match(/\n/g) || []).length;
          if (hasTrace || visibleHead.trim() || nlCount >= 3 || idBuf.length > 500) {
            const rest = releaseStreamGuardG(hasTrace ? "trace_seen" : "visible_or_limit");
            if (rest !== null) emitVisibleG(rest);
          }
          return;
        }
        let visibleText = sanitizeSifuStreamVisible(text, ctx);
        visibleText = stripTraceLine(stripIdLine(visibleText));
        emitVisibleG(visibleText);
      }, (text: string) => {
        cliErr += "\n" + text;
      });
      c.stdout.on("data", parser);
      c.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        cliErr += text;
        console.warn("[sifu sse stderr]", text.slice(0, 200));
      });
      c.on("close", async (code) => {
        releaseSlotOnceG();
        clearTimeout(killTimer);
        clearGuardTimer();
        if (idRejected) { safeClose(); return; }
        const ms = Date.now() - t0;
        if (expectedDM && !idChecked && idBuf) {
          const rest = releaseStreamGuardG("close");
          if (rest !== null) emitVisibleG(rest);
        }
        flushVisibleG();
        if (idRejected) { safeClose(); return; }
        if (expectedDM && !idChecked) { send("error", { error: "identity_mismatch", reason: "no_visible_text" }); safeClose(); return; }
        if (code === 0 && full.trim()) {
          let finalReply = full.trim();
          const finalRawForAudit = idBuf;
          const finalCritical = checkSifuCriticalEvidence(finalReply, message, ctx, { hasPacket: !!expectedDM });
          const finalFactClaim = checkSifuFactClaimGate(finalReply, ctx);
          if (!finalFactClaim.ok) {
            console.error(`[sifu] GET stream fact claim FAIL on close (${finalFactClaim.violations.map((v) => v.code).join(",")})`);
            send("error", { error: "fact_claim_mismatch", violations: finalFactClaim.violations });
            safeClose();
            return;
          }
          if (!finalCritical.ok) {
            console.warn(`[sifu] critical-evidence incomplete (GET stream audit-only) profile=${profileId || "-"} missing=${finalCritical.missing.map((m) => m.code).join(",")}`);
          }
          const streamGuard = buildSifuStreamGuardMeta(streamIdentityResult, streamTraceResult);
          const answerSupportedBy = { ...buildSifuAnswerSupportAudit(finalReply, finalCritical), streamGuard };
          const payload: SifuPayload = { reply: finalReply, model: sifuModel, provider_model: providerModelName(sifuModel) };
          if (useCache && finalCritical.ok && streamGuard.cacheable) setCachedReply(key, payload, ms, ajekVersion).catch(() => {});
          if (session?.userId) drainHoursByCharsForUser(session.userId, payload.reply.length, "sifu_master").catch(() => {}); // หักยามตามตัวอักษร (GET stream)
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
            claimedSrc: parseClaimedSources(finalRawForAudit),
            ctx,
            message,
            history: [],
            prompt,
            answer: payload.reply,
            answerSupportedBy,
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
            responseMeta: { stream: true, cache_key: key.slice(0, 8), context_cache: contextCache, chars: payload.reply.length, thread_id: threadId, critical_evidence: finalCritical, stream_guard: streamGuard },
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
              identityCheckResult: streamIdentityResult,
            }),
          });
          if (!firstChunkSent) {
            sendFirstOnceG();
            send("chunk", { text: payload.reply });
          }
          send("done", { ms, model: payload.model, cached: false, chars: payload.reply.length });
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
